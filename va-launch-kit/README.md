# VA Momma Launch Kit

A browser-based kit that helps moms launch as Virtual Assistants. Open `index.html` in any browser. No install, no server, no account needed.

## What's inside

1. **About You**: one form that feeds everything else. Includes a *Mom Skills Translator* (turns real life experience into client-friendly wording) and a *Practice Projects* section for people with no clients yet.
2. **Resume builder**: two templates (Classic, which is ATS-friendly, and Modern sidebar), a custom accent color, and live "make it stronger" tips. Exports to PDF through the browser's print dialog.
3. **Portfolio website**: four themes and an optional booking link. Downloads a single `index.html` that can be hosted free on Netlify Drop or GitHub Pages.
4. **Profile optimizer** (Upwork and OnlineJobs.ph):
   - a 0–100 score with a ranked "fix these next" list
   - title ideas that fit the platform's character limit
   - a preview of what clients see first in search
   - a platform-specific checklist
   - a proposal builder that matches a pasted job post to your services

All data stays in the user's browser (localStorage). Users can back up and restore their answers as a JSON file.

## Customizing / rebranding

- Service lists, tools, translator phrases and sample data: `js/data.js`
- Colors and fonts: the `:root` variables at the top of `styles.css`
- Product name: `index.html` (header, `<title>`, footer)

## A note on claims

The optimizer score is based on common client-hiring advice. It does not reflect how Upwork or OnlineJobs.ph rank profiles internally, and it cannot guarantee anyone gets hired. Keep sales copy honest, for example "build a client-ready profile" rather than "guaranteed clients."

## Selling it

Everything for Etsy / Gumroad / Payhip is in `sell/`:

- `sell/config.json`: your shop name, support email and hosted link
- `node sell/build.js`: builds `dist/` (hostable app, buyer ZIP, START HERE PDF, listing images)
- `sell/LISTING-COPY.md`: titles, tags, descriptions and pricing
- `sell/LAUNCH-CHECKLIST.md`: step-by-step launch
