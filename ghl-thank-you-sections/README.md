# MRJ Thank-You Page: GoHighLevel sections

One page that works for **both** people who booked a call and people who sent an inquiry.

| File | Section |
|---|---|
| `01-header.html` | Simple brand bar + "Back to offers" |
| `02-confirmation.html` | Checkmark, thank-you message, 3 "what happens next" steps (switches for booked vs inquiry) |
| `03-while-you-wait.html` | 3 project cards + the 2 offers, to warm them up before the call |
| `04-footer.html` | Footer |

## GHL setup
1. Create a new funnel step / page (e.g. `/thank-you`).
2. For each file: Section and Row **Full Width**, padding **0**, add a Custom JS/HTML element and paste the file.

## Point your redirects here
- **Calendar** (Calendars → your discovery call → Confirmation → Redirect URL):
  `https://yourdomain.com/thank-you`  → shows **"You're booked."**
- **Inquiry form** (Form → On submit → Open URL):
  `https://yourdomain.com/thank-you?type=inquiry`  → shows **"Got it. I'll be in touch soon."**

## Tracking
If your Meta Pixel is on the page (Settings → Tracking code), it automatically fires
**Schedule** for bookings and **Lead** for inquiries. Nothing else to set up.

## Before publishing
- Replace the `#` links: logo/"Back to offers" (01), project cards and offer cards (03), and the
  "Book a discovery call" button in the inquiry version (02, your calendar link).
- Swap the 3 `img/...` paths in 03 for your Media Library URLs (same images as the portfolio).
- "Reply within 1 business day" (02) is a promise. Change it if that doesn't match how you work.
