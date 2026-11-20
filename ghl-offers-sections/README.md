# MRJ Offers & Pricing: GoHighLevel sections

One file per section. Paste each into its own GHL **Custom JS/HTML** element.

| File | Section |
|---|---|
| `01-nav.html` | Fixed top bar |
| `02-hero.html` | Hero + 2 offer cards ($1,197 / from $697) |
| `03-pain-to-fix.html` | "Sound familiar?" problem → fix band |
| `04-offer-landing-page.html` | Offer 01: 7-day timeline, $1,197 price card, **design samples** (4 landing pages, click to view full page) |
| `05-offer-social-media.html` | Offer 02: 3-month plan, **design samples** (reels, posts, content calendar), 3 tiers, bundle |
| `06-brands.html` | Brands I've worked with + portfolio link |
| `07-testimonials.html` | **Client testimonials**: 1 video + 3 image testimonials (click to enlarge) |
| `08-about.html` | **About me** + headshot, facts, book/portfolio buttons |
| `09-faq.html` | FAQ (click to open) |
| `10-book-a-call.html` | Book a call: copy on the left, **GHL calendar slot** on the right |
| `11-footer.html` | Footer |

## GHL setup (every section)
Section and Row: **Full Width**, all padding **0**. Add Custom JS/HTML, paste the file and save.
Sections stretch edge to edge on their own, even inside a boxed container.

## Before publishing
1. **Images/videos**: same files as the portfolio, so if they're already in your Media Library, reuse those URLs.
   Replace each `img/...` path (files 04, 05 and 07).
2. `07-testimonials.html`: upload your video + 3 testimonial images, then replace
   `img/testimonial-video.mp4`, `img/testimonial-video-poster.jpg` (a still for the cover) and
   `img/testimonial-1/2/3.jpg` (each appears twice: `src` and `data-full`). Fill in every `[Client name]` / `[Business name]`.
3. `08-about.html`: swap the headshot placeholder (instructions in the comment) and the portfolio link.
4. `06-brands.html`: point "See my portfolio" at your GHL portfolio page.
5. `10-book-a-call.html`: delete the placeholder box and paste your GHL calendar embed code in its place (Calendars → your discovery call → Copy embed code).
6. Every "Book a discovery call" button already scrolls down to the calendar, so no links to change.
