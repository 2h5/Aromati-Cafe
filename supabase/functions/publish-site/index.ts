/* Publish — the owner's button, and the only thing that may pull the trigger.
   ══════════════════════════════════════════════════════════════════════════

   The editor writes photographs to the database. From the point where the site
   stops swapping them at runtime (see PHOTOGRAPHS.md §3), the database being
   right is no longer enough — the markup has to be rebuilt before a visitor
   sees the new picture. This function is what asks for that rebuild.

   ── why this exists at all, rather than a fetch() in admin.js ──
   A Cloudflare deploy hook is an unauthenticated URL: anyone who holds it can
   spend the project's builds, as many times as they like, forever. Putting it
   in admin.js would publish it to every visitor who opens the page source, and
   admin.js is served to anyone who asks for /admin.html — the sign-in gate is
   in front of the *editor*, not in front of the file.

   So the URL lives here, in DEPLOY_HOOK_URL, which is a Supabase secret and is
   never committed. This file is the only thing that reads it, and it reads it
   at the last possible moment, after the caller has been checked.

   ── who is allowed ──
   Two gates, and both are needed.

   verify_jwt (on by default) proves the caller holds a valid session for this
   project. That alone is not enough: it proves *somebody* signed in, not that
   they are allowed to edit this site. Anyone with an account would pass it.

   So the token is handed back to Postgres and is_owner() decides, which is the
   same function every RLS policy on the site already trusts. There is exactly
   one answer to "who may edit Aromati" and it lives in admin_users, not in a
   second list kept here that could drift from it.

   ── what it deliberately does not do ──
   No debouncing, no queueing, no "a build is already running" check. Cloudflare
   cancels a build that a newer one supersedes, which is the correct behaviour
   and is already implemented by someone whose job it is. A second Publish while
   the first is still going costs nothing and is a thing an anxious person will
   do; it must not be an error. */

import { createClient } from "jsr:@supabase/supabase-js@2";

/* The editor is served from the Pages project, and from its preview
   deployments while something is being tried. Echoed rather than answered with
   `*`, because the browser will not send credentials to a wildcard — and the
   Authorization header is the entire point of the request. */
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)?aromati-cafe\.pages\.dev$/;

/* The requested headers are echoed rather than listed.

   Listing them is how the first version of this failed, and it failed silently
   in the only way CORS can: the preflight was answered 204, the browser then
   compared the list to what supabase-js actually sends, found x-client-info
   missing, and never sent the POST at all. Nothing reached this function, so
   the logs showed an OPTIONS with no POST after it and the editor showed the
   generic "try again in a minute" — a failure with no failed request in it.

   A hardcoded list has to be kept in step with a client library that is free to
   add a header in any release. Echoing cannot drift. It is not a weakening
   either: the origin is still checked against ALLOWED, and every header named
   here arrives on a request that has already been proved to come from the
   editor's own origin. */
function cors(origin: string | null, requested?: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": requested || "authorization, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
  if (origin && ALLOWED.test(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors(origin, req.headers.get("Access-Control-Request-Headers")),
    });
  }
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405, origin);

  /* Read before anything else is done, so a project that was deployed without
     the secret says so plainly instead of failing later as a refused fetch that
     looks like Cloudflare being down. */
  const hook = Deno.env.get("DEPLOY_HOOK_URL");
  if (!hook) {
    console.error("DEPLOY_HOOK_URL is not set — nothing can be published until it is");
    return reply({ error: "Publishing is not configured for this site." }, 500, origin);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return reply({ error: "Not signed in." }, 401, origin);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );

  /* is_owner() is `authenticated`-only and security definer, so a bad or
     expired token gets an error here rather than a false — both of which mean
     the same thing to this function and neither of which is told apart in the
     reply. Which of the two it was is not the caller's business to learn by
     guessing, the same rule the sign-in form follows. */
  const { data: isOwner, error } = await supabase.rpc("is_owner");
  if (error || isOwner !== true) {
    return reply({ error: "That account may not publish this site." }, 403, origin);
  }

  let res: Response;
  try {
    res = await fetch(hook, { method: "POST" });
  } catch (err) {
    console.error("the deploy hook could not be reached", err);
    return reply({ error: "Could not reach the build service. Try again in a minute." }, 502, origin);
  }

  if (!res.ok) {
    console.error("the deploy hook refused", res.status, await res.text().catch(() => ""));
    return reply({ error: "The build service refused the request." }, 502, origin);
  }

  /* 202, not 200: the build has been asked for, not finished. The editor says
     "about a minute" on the strength of this and nothing more — there is no
     way to learn from here whether it succeeded, which is why PHOTOGRAPHS.md §3
     lists a failed build as a real cost of this design rather than an edge
     case. */
  return reply({ ok: true }, 202, origin);
});
