# Level Up Talent Solutions — RPO Landing Page

GoHighLevel-ready pages for the RPO (Recruitment Process Outsourcing) offer: the `/rpo` landing page, and a generic `/thank-you` page to follow any form or booking on the site.

Brand: Poppins (headings) + Roboto (body). Colors: Navy `#004AAD`, Gold `#FFB803`, Blue `#0099FF`, White.

## Files

- **`index.html`** — the full page, combined. Open it directly in a browser to preview, or host it as-is if you're not using GHL's page builder.
- **`sections/`** — the same page broken into 15 self-contained files, one per section, in build order. Each one includes its own Google Fonts link and `<style>` block so it renders correctly whether you paste it alone or alongside the others.

## Section order

| # | File | Section |
|---|------|---------|
| 01 | `01-header.html` | Sticky nav + logo, mobile hamburger menu |
| 02 | `02-hero.html` | Hero headline + primary CTAs |
| 03 | `03-trust-bar.html` | Client logo strip (placeholders) |
| 04 | `04-problem.html` | Pain points |
| 05 | `05-solution.html` | What is RPO |
| 06 | `06-services.html` | What's included (9 services) |
| 07 | `07-process.html` | How it works — interactive 5-step stepper |
| 08 | `08-why-us.html` | Differentiators |
| 09 | `09-industries.html` | Industries served |
| 10 | `10-results-stats.html` | Stat bar (placeholders) |
| 11 | `11-testimonials.html` | Testimonials (placeholders) |
| 12 | `12-engagement-models.html` | Full / Project / On-Demand RPO |
| 13 | `13-faq.html` | FAQ accordion with animated +/× indicator |
| 14 | `14-final-cta-form.html` | Book-a-call + lead form |
| 15 | `15-footer.html` | Footer |

## How to add this to GoHighLevel

1. In your GHL sub-account, go to **Sites → Funnels/Websites**, create or open the `/rpo` page.
2. Add a **Custom Code (HTML)** element to the page.
3. Open each file in `sections/` **in numeric order** and paste its full contents into its own Custom Code element, stacked top to bottom (01 → 15).
4. Repeat for all 15 files. Save and preview — the design system (fonts/colors) is duplicated in every file on purpose, so it renders correctly no matter how GHL isolates each block.

If your GHL plan lets you paste raw HTML for a whole page at once, you can instead paste all of `index.html` (minus the outer `<html>/<head>/<body>` wrapper if GHL requires it) into a single Custom Code/HTML page element.

## Full width in GHL

Every section file wraps its content in `<div class="lvlup lvlup-bleed">`. The `lvlup-bleed` class forces that div to span the full browser width (100vw) even if GHL nests it inside a narrower Row/Section container — so you shouldn't need to touch GHL's width settings. If a section still looks boxed in after pasting:
- Check the parent Row/Section's own width setting in GHL and set it to **Full Width** (belt-and-suspenders — the CSS fix should make this unnecessary, but some GHL themes add their own container padding).
- Make sure you pasted the **entire** section file, including its `<style>` block — deleting or trimming it before pasting will drop the `lvlup-bleed` rule.

## Before you publish — replace these placeholders

- **Logo**: the header (`01-header.html`) and footer (`15-footer.html`) now use an `<img>` placeholder (a dashed "YOUR LOGO" box) instead of a text wordmark. Upload your real logo to GHL's Media Library and swap the `src` on both `<!-- TODO -->`-marked `<img>` tags — use a white/reversed version for the footer's dark background.
- **Hero photo**: the right column of the hero (`02-hero.html`) is now an `<img>` placeholder for Pedro's photo. A transparent-background PNG cutout (~800x1000px, portrait) works best since it floats directly on the navy gradient with no card behind it. Upload it in GHL's Media Library and swap the `<!-- TODO -->`-marked `src`.
- **CTA form** (`14-final-cta-form.html`): the form is now a dashed "GHL Form Embed Placeholder" box. Replace it with your real GHL form embed (GHL: Sites → Forms → Builder → your form → Integrate → copy embed code — an `<iframe>` + a `form_embed.js` `<script>` tag). A commented-out plain-HTML fallback form is left in the file if you'd rather not use a native GHL form — see the comment directly above it for how to wire it up instead.
- **Booking link**: two `<!-- TODO -->` comments (in the hero/final CTA and footer) mark `href="#"` — replace with your real GHL Calendar booking link.
- **Lead form**: the form in `14-final-cta-form.html` is plain HTML (`action="#"`). Either:
  - Swap it for a native **GHL Form element** styled to match (white card, navy labels, gold submit button), or
  - Point `action` at your GHL inbound form/webhook URL.
- **Stats** (`10-results-stats.html`): `[XX]%` placeholders — replace with real, verifiable metrics only.
- **Testimonials** (`11-testimonials.html`): `[Client Name]` / `[Title, Company]` — replace with real, permissioned quotes.
- **Client logos** (`03-trust-bar.html`): replace the dashed placeholder boxes with actual client logo images.
- **Contact info** (`15-footer.html`): swap in your real phone number.
- **Email**: `hello@lvluptalentsolutions.com` is a placeholder — confirm the real inbox.

## Interactivity

The whole page responds to the cursor and touch now, not just the process steps:

- **Header**: below 800px, the nav collapses behind a hamburger button (`01-header.html`) that slides open a full-width dropdown menu — fixes what was previously an inaccessible nav on mobile (links were just hidden with no way to reach them).
- **Every `.card`** — problem, solution, services, why-us, industries, stats, testimonials, engagement models, FAQ — lifts with a shadow on hover, defined once in the shared design-system CSS so it applies everywhere automatically.
- **Process** (`07-process.html`): click a step number 1–5 to switch the detail panel; the connecting line fills gold up to the active step.
- **FAQ** (`13-faq.html`): each question shows a `+` that rotates into an `×` when expanded, replacing the browser's default disclosure triangle.
- **Nav links**: header and footer links get an animated gold underline / color shift on hover.
- **Trust-bar logo placeholders**: border and text shift to navy on hover.
- All transitions are disabled under `prefers-reduced-motion: reduce`.

## Notes

- Fully responsive (breakpoints at 900px and 640px).
- `01-header.html` and `07-process.html` each include a small inline `<script>` scoped to that section's own element IDs — safe to paste as-is, no section depends on another's script.
- No external dependencies besides Google Fonts (Poppins/Roboto).
- All copy is original and written for this offer — review it against your actual RPO process/pricing before publishing.

---

# Thank You Page

A generic, reusable confirmation page — not tied to the RPO offer specifically, so it works after any form submission or booking anywhere on the site. Same brand system (fonts, colors, card/button styles) as the landing page above, but with no offer-specific copy, stats, or testimonials to fill in.

## Files

- **`thank-you.html`** — the full page, combined.
- **`sections-thank-you/`** — the same page split into 5 self-contained files for pasting into GHL, same convention as `sections/` above.

## Section order

| # | File | Section |
|---|------|---------|
| 01 | `01-header.html` | Logo only, no nav (keeps focus on the confirmation) |
| 02 | `02-confirmation.html` | Checkmark badge, "Thank You!" headline, book-a-call + return-home buttons |
| 03 | `03-next-steps.html` | Generic 3-step "what happens next" |
| 04 | `04-calendar.html` | GHL calendar embed placeholder ("skip the wait, book now") |
| 05 | `05-footer.html` | Minimal footer — logo, return-home link, copyright |

## Before you publish — replace these placeholders

- **Logo**: same `<!-- TODO -->` pattern as the landing page, in `01-header.html` and `05-footer.html`.
- **Booking link**: `<!-- TODO -->` in `02-confirmation.html` — point at your GHL Calendar link, or delete the button entirely if this page only follows a call that's already booked.
- **Calendar embed** (`04-calendar.html`): dashed "GHL Calendar Embed Placeholder" — replace with your real GHL calendar embed (Sites → Calendars → Embed), or delete this whole section if you don't want a second booking prompt on the thank-you page.
- **Copyright/company name**: footer says "Your Company" — swap for your real name (or delete if GHL injects this globally).
- Optional: GHL supports merge fields (e.g. `{{contact.first_name}}`) on native pages — you can drop one into the `<h1>Thank You!</h1>` in `02-confirmation.html` for personalization if you want it; left out by default to keep this page fully generic.

## How to add this to GoHighLevel

Same process as the landing page: create/open your thank-you page in Sites → Funnels/Websites, add a Custom Code element per section, and paste `01` through `05` in order. See "Full width in GHL" above — the same `lvlup-bleed` fix applies here.
