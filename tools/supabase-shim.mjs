/* A Supabase-shaped empty database, in memory.
   Used by tools/test-sql.mjs and tools/test-rls.mjs.

   The migrations are written against a Supabase project, which is Postgres
   plus a specific set of things Supabase creates before any migration runs:
   three roles, an `auth` schema, and `auth.uid()`. None of that is standard
   Postgres, so a bare database rejects the very first statement — the
   admin_users table references auth.users.

   This file creates exactly those pieces and nothing else. It is deliberately
   the smallest shim that lets the real SQL run, because every extra convenience
   put in here is a difference between what is tested and what is deployed.

   WHAT THIS IS NOT. It proves the SQL executes and that the policies behave.
   It does not prove the migration will apply to the real project, because
   these are genuinely different:

     - Real Supabase has PostgREST in front. These tests speak SQL directly, so
       they exercise RLS and the grants but not PostgREST's own behaviour
       (schema exposure, the `Prefer` header, its 401 vs 403 mapping).
     - Real `auth.uid()` reads a JWT that GoTrue signed. Here it reads the same
       setting by the same name, but nothing verifies a signature — so these
       tests can say "a request claiming to be this user is refused", never
       "the token could not be forged".
     - Extensions and the dashboard's own roles are absent. A migration that
       touches one will fail here for a reason that is not a real defect, and
       the fix is to add it to this file consciously rather than to work around
       it. That is what happened to `storage` in Phase 6: the photographs
       migration creates a bucket and four policies on storage.objects, so the
       schema is below — two tables with the columns those statements name, and
       nothing else. What it is NOT is Supabase Storage: no upload endpoint, no
       size or MIME enforcement (which the real service applies from
       storage.buckets, not from a constraint), no signed URLs. So these tests
       can say the policies are created and that they refuse the wrong caller.
       They cannot say a 4 MB file is rejected — that is a live check, and it is
       on the Phase 7 list.

   So: green here means the SQL is sound and the policies say what POLICIES.md
   claims. It does not retire step 7 of Phase 3 — run the security advisor. */

import { PGlite } from "@electric-sql/pglite";

/* Supabase's own bootstrap, reduced to what these migrations actually touch.
   `anon` and `authenticated` are NOLOGIN roles that PostgREST switches into
   after checking the JWT; `service_role` bypasses RLS via BYPASSRLS. */
const BOOTSTRAP = `
  create role anon          nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role  nologin noinherit bypassrls;

  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;

  /* Only the columns the migrations reference. The real table has ~30 more. */
  create table auth.users (
    id    uuid primary key,
    email text unique
  );

  /* The real one reads the JWT PostgREST put into request.jwt.claims. So does
     this, by the same name and shape — the difference is that nothing here
     ever checked a signature. Same NULL-when-absent behaviour, which is what
     makes is_owner() fail closed for a logged-out visitor.

     The inner nullif is not decoration. Without it the setting's empty string
     reaches ''::json, which RAISES rather than returning null — and a raising
     auth.uid() makes every policy that calls it error out. That reads exactly
     like "the visitor was refused", so every logged-out test passed for the
     wrong reason until tools/test-db-guards.mjs put a real hole in and nothing
     noticed. Fail closed, not fail loud. */
  create function auth.uid() returns uuid
  language sql stable
  as $shim$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', ''
    )::uuid;
  $shim$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  /* ── storage ──
     Only what the photographs migration names. The real storage.objects has a
     dozen more columns and a set of triggers that keep a path index in step;
     none of that changes whether a policy is written correctly.

     RLS on and no policies of its own, which is how a real project arrives:
     everything Supabase Storage does on behalf of a signed-in caller goes
     through policies somebody wrote. */
  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;

  create table storage.buckets (
    id                 text primary key,
    name               text not null,
    public             boolean not null default false,
    file_size_limit    bigint,
    allowed_mime_types text[],
    created_at         timestamptz not null default now()
  );

  create table storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets (id),
    name       text not null,
    owner      uuid,
    created_at timestamptz not null default now()
  );

  alter table storage.objects enable row level security;

  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
`;

/* The real accounts, created by hand in the dashboard — the owner on
   2026-08-01, the second editor on 2026-08-06. The two allowlist migrations
   reference them, so they have to exist before the migrations run, which is
   also the real order of events and the reason those files are separate from
   the schema. Adding a third account to the dashboard means adding it here too,
   or its migration fails on the foreign key. */
export const OWNER_UID = "a69c4370-3872-4b61-aba2-4049e34f9549";
export const EDITOR_UID = "e47472aa-730d-46b3-b648-cc1dfd4ccaaa";

/* Applying a migration as the owner of everything, which is what the Supabase
   SQL editor and `supabase db push` both do. */
export async function freshDatabase() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  await db.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
                 [OWNER_UID, "owner@aromatiNY.com",
                  EDITOR_UID, "editor@aromatiNY.com"]);
  return db;
}

/* Postgres reports a byte offset into the statement it was given. Turning that
   into "file:line" is the difference between a fixable error and a puzzle. */
export function locate(sql, position) {
  if (!position) return null;
  const upto = sql.slice(0, Number(position));
  const line = upto.split("\n").length;
  return { line, text: sql.split("\n")[line - 1] };
}

/* Run one file, and report where it stopped rather than just that it did. */
export async function applyFile(db, path, sql) {
  try {
    await db.exec(sql);
    return { ok: true };
  } catch (err) {
    const where = locate(sql, err.position);
    return {
      ok: false,
      path,
      message: err.message,
      detail: err.detail || err.hint || "",
      line: where && where.line,
      source: where && where.text
    };
  }
}
