MRJ OFFER PAGE · GHL SECTIONS
=============================

Each file is one GHL Custom Code element. Paste them top to bottom in this order.

HOW TO SET UP EACH SECTION IN GHL
1. Add a Section, set it to Full Width, padding 0 on all sides,
   background none (or #0D0508).
2. Add a 1-column Row, also full width with padding 0.
3. Drag in a "Custom JS/HTML" (Custom Code) element.
4. Open the file, copy everything, paste it in, save.

ORDER
00-global-styles.html      REQUIRED, paste first. (Or put it in
                           Funnel Settings > Tracking Code > Header instead.)
01-nav.html                Fixed bar at the top of the screen
02-hero-quick-check.html   Hero + tickable checklist
03-service-strip.html
04-the-gap.html
05-what-i-build.html
06-portfolio.html          EDIT HERE: WORK list (image links)
07-client-wins.html        EDIT HERE: WINS list (screenshot links) + stats band
08-process.html
09-investment.html
10-about.html              EDIT HERE: ABOUT_IMG (your photo link)
11-faq.html
12-final-cta.html
13-footer.html
14-scroll-animations.html  Optional, paste last (or in Tracking Code > Footer).
                           Without it everything still shows, just without
                           the fade-in.

GOOD TO KNOW
- You can delete, reorder or duplicate sections. The nav links jump to
  What I build, Portfolio, Process, Investment and FAQ, so keep those or
  remove the matching nav link in 01-nav.html.
- Fonts and images only load once the page is online, so check it in
  GHL preview, not the builder canvas.
- The full single-file version is still in ../mrj-offer-page.html.
