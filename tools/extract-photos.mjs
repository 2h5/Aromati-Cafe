/* Photographs: markup → data, and the hooks that read them back.
   node tools/extract-photos.mjs

   The same one-pass idea as tools/extract-copy.mjs, and for the same reason:
   the slot name in the data and the slot name in the markup are written from
   one source, so they cannot drift into a photo that renders blank because
   somebody typed gallery.g4 in one file and gallery.g5 in the other.

   ── a slot is a position, not a picture ──
   The database keys photos by *slot* — "the photograph behind the opening
   headline" — never by filename. The set of places a photo can go is the
   markup's business; which photo goes there is the owner's. The same file can
   fill two slots (georgian-salad.jpg is in the strip and in the gallery, with
   a different description in each), and that is not a duplicate to be
   de-duplicated: they are two decisions.

   ── decorative slots ──
   Five of these images are behind a scrim or a gradient and carry alt="" with
   aria-hidden="true". They are texture, not content. A screen reader must go
   on announcing nothing for them, so they are stamped data-photo-decorative
   and the editor never asks for a description. Getting this wrong in either
   direction is an accessibility bug: a described backdrop is noise, and an
   undescribed photograph is a hole.

   ── what this does NOT write ──
   No width/height attributes are added to the markup. The layout today is
   entirely CSS — fixed containers with object-fit — and adding intrinsic sizes
   to 38 images to fix a reflow nobody has reported would be a change to the
   look of the site made blind, in the phase least able to check it. The
   dimensions are read and stored because the *editor* needs them: it warns
   when a replacement photograph has a very different shape from the one it is
   replacing, which is the thing that actually goes wrong when an owner uploads
   a portrait phone photo into a landscape slot.

   The slot table itself is in tools/photo-slots.mjs, because the migration
   needs it too and two copies of a list of 29 names is one copy too many.

   Idempotent: an image already carrying the right data-photo is left alone. */

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { PHOTO_SLOTS as PAGES } from "./photo-slots.mjs";

/* Ours, not the owner's. The studio credit strip is out of scope by decision —
   see memory.md, "Explicitly out of scope". */
const NOT_CONTENT = "studio-credit__mark";

/* ── intrinsic size, without a dependency ─────
   Enough of the two container formats to read one number pair. A file this
   cannot read is not an error: the dimensions are advisory, and a photograph
   with no numbers is better than a build step that fails on an unusual JPEG. */

function dimensions(file) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }

  /* PNG: the IHDR chunk is always first and always at the same offset. */
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  /* JPEG: walk the marker segments to the frame header. SOF0/1/2/… carry the
     size; SOF4 (0xC4), SOF8 (0xC8) and SOF12 (0xCC) are not frame headers at
     all — they are Huffman tables, arithmetic conditioning and the like — so
     they are stepped over rather than read. */
  if (buf.length > 4 && buf.readUInt16BE(0) === 0xffd8) {
    let at = 2;
    while (at + 9 < buf.length) {
      if (buf[at] !== 0xff) { at += 1; continue; }
      const marker = buf[at + 1];
      const size = buf.readUInt16BE(at + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: buf.readUInt16BE(at + 5), width: buf.readUInt16BE(at + 7) };
      at += 2 + size;
    }
  }

  /* WebP: a RIFF container with the size in whichever chunk comes first. There
     are three and they disagree about where the numbers live — VP8X (an
     extended file, which is what the editor's own encoder writes), VP8L
     (lossless) and VP8 (plain lossy). All three are 14-bit fields, and two of
     them are stored minus one.

     This branch was missing until 4 August 2026, which meant `dimensions()`
     quietly returned null for every .webp on the site and a run of this tool
     stripped the width and height off eleven slots at once. Nothing broke
     visibly — the layout is CSS and does not use them — so the only symptom
     was the editor losing its ability to warn that a replacement photograph is
     a very different shape from the one it replaces. A reader that fails by
     going quiet is worth more suspicion than one that throws. */
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP") {
    let at = 12;
    while (at + 8 <= buf.length) {
      const kind = buf.toString("ascii", at, at + 4);
      const size = buf.readUInt32LE(at + 4);
      const body = at + 8;

      if (kind === "VP8X" && body + 10 <= buf.length) {
        return { width: buf.readUIntLE(body + 4, 3) + 1,
                 height: buf.readUIntLE(body + 7, 3) + 1 };
      }
      if (kind === "VP8L" && body + 5 <= buf.length) {
        const bits = buf.readUInt32LE(body + 1);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8 " && body + 10 <= buf.length) {
        return { width: buf.readUInt16LE(body + 6) & 0x3fff,
                 height: buf.readUInt16LE(body + 8) & 0x3fff };
      }
      /* Chunks are padded to an even length and the pad byte is not counted. */
      at = body + size + (size & 1);
    }
  }
  return null;
}

/* ── read, check and stamp ────────────────── */

const photos = new Map();       // slot -> { label, src, alt, decorative, width, height }
let stamped = 0;
let images = 0;

for (const [file, slots] of PAGES) {
  let html = readFileSync(file, "utf8");
  const doc = new JSDOM(html).window.document;

  const found = [...doc.querySelectorAll("img")]
    .filter((img) => !img.classList.contains(NOT_CONTENT));

  if (found.length !== slots.length) {
    throw new Error(
      `${file}: the page has ${found.length} content images and this file lists ` +
      `${slots.length} slots. An image was added or removed — add or remove its ` +
      `slot here (and in the migration) rather than letting every slot after it ` +
      `silently shift by one.`
    );
  }

  /* Document order and source order are the same order for a tag that cannot
     contain anything, so the nth <img in the file is the nth img in the DOM.
     Stamping textually rather than re-serialising jsdom keeps the diff to the
     attribute that was added — see the note in tools/extract-copy.mjs. */
  const opens = [...html.matchAll(/<img\b/g)].map((m) => m.index);
  const marks = [...doc.querySelectorAll("img")]
    .map((img, i) => ({ img, at: opens[i] }))
    .filter(({ img }) => !img.classList.contains(NOT_CONTENT));

  /* ── forwards: read and check ──
     Two occurrences of one slot are two elements and one decision. The slot is
     decorative only if *every* drawing of it is — the reel's second group is
     aria-hidden, but the slot it repeats is a described photograph, and the
     owner has to be asked for that description exactly once. */
  marks.forEach(({ img }, i) => {
    const [slot, label, decorative] = slots[i];
    images += 1;

    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || "";

    if (decorative && alt !== "") {
      throw new Error(`${file}: ${slot} is listed as decorative here but carries alt="${alt}".`);
    }
    if (!decorative && alt === "") {
      throw new Error(
        `${file}: ${slot} has no alt text. Either describe it in the markup, or ` +
        `list it as decorative here — but decide, because "" and "not yet" look ` +
        `identical to a screen reader and only one of them is a choice.`
      );
    }

    /* The Kitchen strip carries a short line of text over each plate, in a
       <figcaption> that is text and nothing else. That is the only shape read
       here: a figcaption with markup inside it — the story photographs' kicker
       spans, the café cards' copy-managed strong/span — is not a caption, it is
       layout, and splicing a sentence into it at build time would break both.
       Pure text is also what keeps the bake's rewrite honest: it can replace
       the text without having to understand what surrounds it. */
    const fig = img.closest("figure");
    const capEl = fig ? fig.querySelector("figcaption") : null;
    const caption = capEl && capEl.childElementCount === 0
      ? capEl.textContent.trim() || null
      : null;

    const was = photos.get(slot);
    if (was && was.src !== src) {
      throw new Error(
        `${file}: ${slot} is drawn twice and the two copies point at different ` +
        `files (${was.src} and ${src}). They are one slot; make them agree.`
      );
    }
    if (was && caption && was.caption && caption !== was.caption) {
      throw new Error(
        `${file}: ${slot} is drawn twice and the two captions disagree ` +
        `("${was.caption}" and "${caption}"). They are one slot; make them agree.`
      );
    }
    if (was) {
      was.decorative = was.decorative && decorative;
      if (!was.alt && alt) was.alt = alt;
      if (!was.caption && caption) was.caption = caption;
      return;
    }

    const size = dimensions(src) || {};
    photos.set(slot, {
      label, src, alt, decorative, caption,
      width: size.width || null, height: size.height || null
    });
  });

  /* ── backwards: stamp ──
     From the end, so an insertion cannot move an offset that has not been used
     yet. The element-level attribute records this *drawing* of the slot: an
     aria-hidden repeat stays undescribed even though its slot has a
     description. */
  for (let i = marks.length - 1; i >= 0; i--) {
    const { img, at } = marks[i];
    const [slot, , decorative] = slots[i];

    const existing = img.getAttribute("data-photo");
    if (existing === slot) continue;
    if (existing) throw new Error(`${slot}: already carries data-photo="${existing}"`);

    const attr = ` data-photo="${slot}"` + (decorative ? " data-photo-decorative" : "");
    html = html.slice(0, at + 4) + attr + html.slice(at + 4);
    stamped += 1;
  }

  writeFileSync(file, html);
}

/* ── write the seed ───────────────────────── */

const groups = [];
for (const [slot, photo] of photos) {
  const prefix = slot.slice(0, slot.indexOf("."));
  const last = groups[groups.length - 1];
  if (last && last.prefix === prefix) last.rows.push([slot, photo]);
  else groups.push({ prefix, rows: [[slot, photo]] });
}

const q = (s) => JSON.stringify(s);

const body = groups.map(({ rows }) =>
  rows.map(([slot, p]) => {
    const parts = [`src: ${q(p.src)}`];
    if (p.decorative) parts.push("decorative: true");
    else parts.push(`alt: ${q(p.alt)}`);
    if (p.caption) parts.push(`caption: ${q(p.caption)}`);
    if (p.width) parts.push(`width: ${p.width}, height: ${p.height}`);
    return `  ${q(slot)}: { ${parts.join(", ")} }`;
  }).join(",\n")
).join(",\n\n");

const header = `/* Photographs — one entry per slot in the markup.

   Generated by tools/extract-photos.mjs. Each key matches a data-photo="…"
   attribute on one or more <img> elements; render.js writes the description
   back into them at load, and the picture itself only when the owner has
   uploaded one.

   \`src\` is the built-in photograph — the file in assets/web/ that the page
   ships with. It is here to be *compared*, not rendered: the markup already
   carries it, so a page with no JavaScript and a site with no database both
   show the right pictures. The database stores an override and nothing else,
   which is why an untouched slot has no storage path and the built-in is what
   a visitor sees.

   \`decorative: true\` marks an image that is texture rather than content —
   behind a scrim, aria-hidden, and deliberately announced as nothing. The
   editor does not ask for a description for these and render.js does not
   write one.

   \`caption\` is the short line of text shown over the photograph, where the
   page displays one — today only the Kitchen strip's plates. Like \`src\` it is
   here to be compared: the words already live in the markup, the database
   stores the owner's version, and tools/bake-photos.mjs writes the current one
   into the built page.

   Dimensions are the built-in file's own, read off the file. The site does not
   use them for layout; the editor uses them to notice when a replacement is a
   very different shape from what it replaces. */

var SEED_PHOTOS = {
${body}
};
`;

writeFileSync("data/seed-photos.js", header);

console.log(`${photos.size} slots across ${images} images, ${stamped} newly stamped -> data/seed-photos.js`);
