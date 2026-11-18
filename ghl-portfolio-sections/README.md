# MRJ Portfolio: GoHighLevel sections

Each file is **one page section**, ready to paste into a GHL **Custom Code** element (Elements → Custom JS/HTML).
Every file is self-contained (fonts + styles + HTML), so you can reorder, duplicate or delete sections freely.

| File | Section |
|---|---|
| `01-nav.html` | Top bar (fixed, stays on screen while scrolling) |
| `02-hero.html` | Hero + proof bar |
| `03-how-i-work.html` | Dark "How I work" band, 4 steps |
| `04-selected-work.html` | 5 case studies + click-to-open full-page viewer + auto-playing reels |
| `05-services.html` | Ways to work together (3 cards) |
| `06-toolkit.html` | Toolkit (4 columns) |
| `07-process.html` | What working with me looks like (5 steps) |
| `08-about.html` | About + facts |
| `09-contact.html` | Final CTA |
| `10-footer.html` | Footer |

## GHL setup (do this for every section)

1. Add a **Section** → set width to **Full Width**.
2. Section **padding top/bottom: 0**, and no background color (the code brings its own).
3. Add a **1-column Row** → width **Full Width**, padding 0. Column padding 0.
4. Drop in a **Custom JS/HTML** element → open the code editor → paste the whole file → Save.

The content inside each section is capped at **1170px** (GHL's standard row width) and centered,
while the colored backgrounds stretch edge to edge. Mobile layouts are built in.

Also in **Settings → (page) SEO meta**: title `Mary Rose Jane Galo Portfolio`, description
`Funnels and social media management for service businesses. Portfolio of Mary Rose Jane Galo, The MRJ Creatives & Co.`

## Before publishing

**1. Upload images and swap the links.** Upload everything from your `img/` folder to **Media Library**,
copy each file's URL, and replace the matching `img/...` path in the code (search for `img/`).
GHL renames uploads, so each one has to be replaced individually.

- `02-hero.html`: habitat-founding-hero.jpg, habitat-countdown-post.jpg
- `04-selected-work.html`: all the others (molima-*, qfitu-*, habitat-*, luts-*, beacons-calendar.jpg, boc-*), including the 3 `.mp4` reels and their `-poster.jpg` images

**2. Fill in the placeholders.**
- `08-about.html`: replace the "Add your headshot here" box (instructions in the comment above it).
- `09-contact.html`: point the button at your GHL calendar link, and replace the three dashed "Add…" boxes with your booking link, email and socials.
- `01-nav.html` "Book a call" jumps to the contact section; you can also point it straight at your calendar.

## Notes
- All CSS is scoped under `.mrj`, so GHL's theme styles won't break the design and the design won't leak into other GHL elements.
- The GHL editor preview may look a bit off for the fixed nav; check in **Preview** mode.
- Keep `04-selected-work.html` as one element. Its full-page viewer and reel autoplay script live inside it.
