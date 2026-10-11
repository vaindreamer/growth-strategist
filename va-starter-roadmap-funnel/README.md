# VA Starter Roadmap Funnel: GHL sections

Clean redesign of the 3-step funnel (no paper texture, grid lines, squiggles or tape effects).
Every file is a self-contained section: its own styles (scoped under `.vsr`, so it won't clash with GHL),
fonts (Fraunces + DM Sans from Google Fonts) and, where needed, a small script.

## How to add a section in GoHighLevel
1. Funnel step → Edit page → add a **Section** → set it to **Full width**, and set section/row/column padding to **0**.
2. Add the **Custom JS/HTML** (Code) element → Open code editor.
3. Paste the whole file → Save. Repeat in order (01, 02, 03 …), one section per file.

`preview/` holds each full page assembled for checking in a browser; don't paste those.

## Section order
| Step | Files |
|---|---|
| 1 · Sales page (₱550) | 01-hero · 02-problem · 03-about · 04-stages · 05-inside · 06-fit · 07-offer · 08-faq · 09-final-cta |
| 2 · Upsell (30-Day Support) | 01-confirmation-bar · 02-hero-countdown · 03-whats-included · 04-timeline · 05-why-15-seats · 06-pricing · 07-is-it-worth-it |
| 3 · Thank you | 01-hero · 02-downloads · 03-first-steps · 04-cohort-group |

## Replace before publishing
Search the files for `REPLACE-WITH-` and `[`:
- `1-sales-page/07-offer.html`: `REPLACE-WITH-CHECKOUT-LINK` (your order-form step URL). Hero and final CTA buttons scroll to this section (`#buy`).
- `1-sales-page/03-about.html`: swap `[Mary's photo]` for `<img src="YOUR-PHOTO-URL" alt="Mary Rose Jane Galo">`.
- `1-sales-page/01-hero.html`: `[Your Name]` on the mock portfolio card.
- `1-sales-page/08-faq.html`: payment-methods answer.
- `2-upsell-page/02-hero-countdown.html`: `data-deadline` and the `[15] of 15 seats` count.
- `2-upsell-page/06-pricing.html`: `REPLACE-WITH-UPSELL-CHECKOUT-LINK`, `REPLACE-WITH-THANK-YOU-PAGE-LINK`.
  For a true **one-click upsell**, delete the two links from the code and drop GHL's native Button (action: one-click upsell)
  and a "No thanks" link (action: next step) underneath, because custom HTML links can't charge the saved card.
- `3-thank-you-page/02-downloads.html`: workbook + Canva template download links.
- `3-thank-you-page/04-cohort-group.html`: group link, upsell page link, `[your support email]`.

## Brand tokens
Change colours once at the top of any section's `<style>` (`.vsr{--ink:#400106;--rose:#ff2487;…}`). Each file carries its own copy, so update all files if you rebrand.
