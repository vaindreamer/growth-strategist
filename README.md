# Level Up Talent Solutions — RPO Landing Page

A GoHighLevel-ready landing page for the RPO (Recruitment Process Outsourcing) offer at `/rpo`.

Brand: Poppins (headings) + Roboto (body). Colors: Navy `#004AAD`, Gold `#FFB803`, Blue `#0099FF`, White.

## Files

- **`index.html`** — the full page, combined. Open it directly in a browser to preview, or host it as-is if you're not using GHL's page builder.
- **`sections/`** — the same page broken into 15 self-contained files, one per section, in build order. Each one includes its own Google Fonts link and `<style>` block so it renders correctly whether you paste it alone or alongside the others.

## Section order

| # | File | Section |
|---|------|---------|
| 01 | `01-header.html` | Sticky nav + logo |
| 02 | `02-hero.html` | Hero headline + primary CTAs |
| 03 | `03-trust-bar.html` | Client logo strip (placeholders) |
| 04 | `04-problem.html` | Pain points |
| 05 | `05-solution.html` | What is RPO |
| 06 | `06-services.html` | What's included (9 services) |
| 07 | `07-process.html` | How it works (5 steps) |
| 08 | `08-why-us.html` | Differentiators |
| 09 | `09-industries.html` | Industries served |
| 10 | `10-results-stats.html` | Stat bar (placeholders) |
| 11 | `11-testimonials.html` | Testimonials (placeholders) |
| 12 | `12-engagement-models.html` | Full / Project / On-Demand RPO |
| 13 | `13-faq.html` | FAQ accordion |
| 14 | `14-final-cta-form.html` | Book-a-call + lead form |
| 15 | `15-footer.html` | Footer |

## How to add this to GoHighLevel

1. In your GHL sub-account, go to **Sites → Funnels/Websites**, create or open the `/rpo` page.
2. Add a **Custom Code (HTML)** element to the page.
3. Open each file in `sections/` **in numeric order** and paste its full contents into its own Custom Code element, stacked top to bottom (01 → 15).
4. Repeat for all 15 files. Save and preview — the design system (fonts/colors) is duplicated in every file on purpose, so it renders correctly no matter how GHL isolates each block.

If your GHL plan lets you paste raw HTML for a whole page at once, you can instead paste all of `index.html` (minus the outer `<html>/<head>/<body>` wrapper if GHL requires it) into a single Custom Code/HTML page element.

## Before you publish — replace these placeholders

- **Booking link**: two `<!-- TODO -->` comments (in the hero/final CTA and footer) mark `href="#"` — replace with your real GHL Calendar booking link.
- **Lead form**: the form in `14-final-cta-form.html` is plain HTML (`action="#"`). Either:
  - Swap it for a native **GHL Form element** styled to match (white card, navy labels, gold submit button), or
  - Point `action` at your GHL inbound form/webhook URL.
- **Stats** (`10-results-stats.html`): `[XX]%` placeholders — replace with real, verifiable metrics only.
- **Testimonials** (`11-testimonials.html`): `[Client Name]` / `[Title, Company]` — replace with real, permissioned quotes.
- **Client logos** (`03-trust-bar.html`): replace the dashed placeholder boxes with actual client logo images.
- **Contact info** (`15-footer.html`): swap in your real phone number.
- **Email**: `hello@lvluptalentsolutions.com` is a placeholder — confirm the real inbox.

## Notes

- Fully responsive (breakpoints at 900px and 640px).
- No external dependencies besides Google Fonts (Poppins/Roboto).
- All copy is original and written for this offer — review it against your actual RPO process/pricing before publishing.
