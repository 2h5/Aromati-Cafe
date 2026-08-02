# Aromati — editing your own site

Everything on the website that changes in real life, you can change yourself:
the hours, the phone number, the whole menu, the words on the page and the
photographs. No developer, no waiting.

This page is the short guide. The editor itself explains each field as you go,
so you should not need to keep this open.

---

## Signing in

Add `/admin.html` to the end of the website address, and sign in with the email
address and password you were given.

There is exactly one account and it is yours. Nobody can create another one —
signing up is switched off — so please keep the password to yourself. If you
ever want it changed, or a second person needs access, ask first; giving out the
one password is not the way to do it.

The editor page is not linked from anywhere on the website. Visitors will not
find it, and search engines are asked to leave it alone.

---

## The one thing to know about saving

**Nothing you type is live until you press Save changes.**

Type as much as you like, across as many tabs as you like. The bar at the bottom
counts what you have changed. Then:

- **Save changes** — everything goes to the website at once. It is live
  immediately; refresh the site in another tab and it is there.
- **Discard changes** — everything goes back to how it was. Nothing is sent.

If you close the tab without saving, nothing is saved. That is deliberate: it
means you can open the editor and click around without any risk of changing the
site by accident.

Very occasionally a save is refused halfway — a bad connection, or something the
website will not accept. If that happens the editor tells you exactly how far it
got and what the problem was, in plain words, and leaves the rest still marked
as unsaved so you can fix it and press Save again. It will never tell you
something saved when it did not.

---

## The six tabs

### Words

Every heading, paragraph, button label and small caption on the site, each one
in the place it appears.

Two things you can do inside a piece of text:

- **Press Enter** to break a line where you want it broken.
- **Put \*stars\* around a word** to make it italic — `*aroma*` comes out as
  *aroma*. They work in pairs; the editor tells you if you have left one open.

Nothing else you type is treated as anything but words, which is on purpose. If
you paste in something odd, it appears on the site as exactly the characters you
pasted. It cannot break the page.

**Some headlines are animated word by word**, and if one gets long it takes an
extra line and the layout shifts. The editor watches for that as you type and
tells you — *"this takes an extra line on a phone"*. It is a warning, not a
refusal. Sometimes an extra line is fine. It is your call; the point is that you
find out before the site does.

### Hours

Your normal week, one row per day, and a **Closed all day** tick for any day you
are shut.

Underneath, **Holidays and one-off days**: a date, whether you are closed or on
different hours, and a short reason like *Christmas Day*. Add them ahead of time
and forget about them.

Changing the hours here changes them **everywhere at once** — the open/closed
badge on the home page, the table on the Visit section, the line in the footer,
the line in the phone menu, and what Google is told about you. There is nowhere
else to remember to update.

### Contact

Phone, email, Instagram, and the address.

Enter the phone as **ten digits and nothing else** — `3322073847`. The site
formats it for display and for tapping-to-call. Same idea with Instagram: enter
`aromatinyc`, not `@aromatinyc` and not the whole web address. The site adds
the rest.

This tab also holds the **delivery links** for DoorDash and Grubhub. The way to
add one is to open your listing in a browser, copy the address out of the bar
and paste it in whole. And **clearing one removes it from the site** — if you
come off a service, empty the box and the link disappears, along with the row
around it if it was the last one. Please click both links once after changing
them; nothing else can tell a good link from a typo.

### Menus

The three menu pages — Food, Drinks, Wine — each made of **sections**. A section
is a block with its own heading and its own items, and it also becomes one of
the filter buttons at the top of the page.

Each section has three names, and they are allowed to be different:

- the **heading** people read above the items,
- the **tab label**, the short version in the filter row,
- the **filter name**, which nobody sees.

Items can be priced a few ways, and the editor asks which: one price, a price
per size column, one price across both columns, or no price at all. You can also
add extra lines under an item — *Bottle 60* under a wine sold by the glass.

**Type prices without the dollar sign.** The site adds it. And type them exactly
as you want them read: `7.50` stays `7.50`, `21` stays `21`.

Sections and items each have ▲▼ arrows beside them, and the order you set is
the order on the page.

One block on the food menu — **Build Your Own Breakfast** — is built into the
page rather than stored here. You can move where it sits on the menu; changing
what is in it needs a developer.

### Photos

Every photograph on the site, in the place it appears, with a **Choose a
photograph** button under each one.

- Pick a file and you get a preview. **Nothing is uploaded until you press
  Save** — pick one, change your mind, discard, and nothing was ever sent.
- **Put the original back** is always available. The photographs the site was
  built with cannot be lost, so you can always undo.
- The site resizes and re-compresses what you pick, so a photo straight off a
  phone is fine. Photos taken sideways come out the right way up.
- **The shape matters more than the size.** Each space on the page is a fixed
  shape and the picture is cropped to fill it. Put a tall phone photo into a
  wide space and the top and bottom are cut off — it looks right in the editor
  and wrong on the page. The editor warns you when the shapes are very
  different. It is a warning, not a refusal.
- **Every photograph needs a short description** — one sentence saying what is
  in it. It is read aloud to people using a screen reader, and it is what
  appears if the picture ever fails to load. A few images are background texture
  and the editor says so; those need nothing.

### FAQ

This tab is empty on purpose, and there is a question waiting for you.

The FAQ page on the site today is **placeholder text**. Those eighteen questions
came off your OpenTable listing and read as though a computer wrote them —
nobody has checked a single answer against how the café actually runs. The page
says so, in a box above the questions.

So: do you want an FAQ page at all? If yes, write the real questions and answers
and add them here — anything you add goes live as soon as you save. If no, say
so and the page comes off the site. Nothing was moved across in the meantime,
because it would only have to be thrown away.

---

## If something looks wrong

**First, reload the page.** The site opens instantly from a copy of the content
it saw last time, then quietly checks for anything newer and swaps it in a
moment later. So a page you were already looking at when you saved will show the
old version until it is reloaded. If a plain reload does not do it, force one —
Ctrl+Shift+R on Windows, Cmd+Shift+R on a Mac.

**If the site still looks like an old version of itself** after that, it may be
running on the emergency fallback described below. Get in touch.

**If a change did not appear**, check the bottom bar in the editor. If it still
shows unsaved changes, they were never sent.

---

## What is not editable here, and that is deliberate

- **Build Your Own Breakfast** on the food menu — its ingredients and prices.
- The **crêpe toppings** list.
- **Reserve a Table** — it is a placeholder button and says so when pressed.
  Wiring it to a real booking system is a separate job whenever you want it.
- The **layout, colours, fonts and animations**.
- The **studio credit** in the footer.

Any of these can be changed; they just need a developer rather than the editor.

---

## Two things worth knowing about how it holds up

**The site does not depend on staying online.** The website carries its own
complete copy of everything — the whole menu, the hours, all the words. If the
service that stores your edits ever goes down, is deleted, or an invoice goes
unpaid, **the site keeps working and shows the last version that was built into
it**. Visitors see a correct, complete Aromati site. Nothing goes blank, and
there is no page that says "error".

**The one exception is photographs you upload.** Everything else lives in two
places; a photograph you upload lives only on the service. If it were lost, the
site would fall back to the photographs it was built with — still a correct
site, but not the one you had. If you upload a lot of new photography, keep the
originals somewhere of your own.

---

## Getting help

Tell whoever maintains the site **which page, which words, and what you
expected** — that is almost always enough to find it straight away. If the
editor gave you a message, quoting it word for word is the fastest route of all;
those messages are written to be quoted.
