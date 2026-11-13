# Launch checklist

## 1. Put the kit online (about 10 minutes, free)
- [ ] Create a free account at netlify.com.
- [ ] Run the build once (see step 2) and drag the `dist/app` folder onto **app.netlify.com/drop**.
- [ ] In Netlify: Site configuration → Change site name, e.g. `va-momma-kit`. Your link becomes `https://va-momma-kit.netlify.app`.
- [ ] Open the link on your phone and try all 4 steps.

## 2. Fill in your details and rebuild
- [ ] Edit `sell/config.json`: `sellerName` (your shop name), `supportEmail` (a business email, not your personal one), and `appUrl` (your Netlify link).
- [ ] From the `va-launch-kit` folder, run:

```bash
node sell/build.js
```

- [ ] Drag the new `dist/app` folder onto your Netlify site again (Deploys → drag and drop) so the footer shows your shop name.
- [ ] Open `dist/START HERE.pdf` and tap "Open my kit". Make sure it opens your site.

## 3. Create the listing
- [ ] Upload `dist/VA-Momma-Launch-Kit.zip` and `dist/START HERE.pdf`.
- [ ] Upload the photos from `dist/listing-images/`.
- [ ] Paste the title, tags and description from `LISTING-COPY.md`.
- [ ] Buy your own product once (or use a 100% discount code) to check the buyer experience.

## 4. Before you go live
- [ ] Search the name "VA Momma Launch Kit" on Etsy and Google, and in a trademark search (USPTO TESS, or IPOPHL if you're in the Philippines), to make sure nobody else uses it. To rename, change `productName` in `config.json` and the name in `index.html`.
- [ ] Read Etsy's current fees and digital-items rules (they change). As of writing: a listing fee per item, a transaction fee and payment processing.
- [ ] Gumroad and Payhip take a percentage per sale. Compare their current pricing pages.

## 5. Updating the product later
Change the app, run `node sell/build.js`, then:
- re-upload `dist/app` to Netlify (existing buyers get the update automatically), and
- replace the ZIP in your listings.
Bump `version` in `config.json` each time.

## Good to know
- **Link sharing:** anyone with the link can open the kit. That's normal for template products and a fair trade-off for an easy buyer experience. The license forbids sharing. If you ever see the link posted publicly, rename the Netlify site and send buyers the new link.
- **Data:** buyers' answers stay in their own browser. You don't collect or store any personal data through the kit.
