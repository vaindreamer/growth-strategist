#!/usr/bin/env node
/*
 * Builds everything needed to sell the kit:
 *   dist/app/                        → upload this folder to Netlify (your buyers' access link)
 *   dist/VA-Momma-Launch-Kit.zip     → the downloadable file buyers receive
 *   dist/START HERE.pdf              → also upload separately (Etsy buyers on phones can just tap the link)
 *   dist/listing-images/*.png        → Etsy / Gumroad / Payhip product photos
 *
 * Usage:  node sell/build.js      (run from the va-launch-kit folder; needs Playwright + Chromium and the `zip` command)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const slug = cfg.productName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const words = cfg.productName.split(' ');
const vars = {
  ...cfg,
  year: new Date().getFullYear(),
  productName1: words.slice(0, Math.ceil(words.length / 2)).join(' '),
  productName2: words.slice(Math.ceil(words.length / 2)).join(' ')
};
const fill = tpl => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => k in vars ? esc(vars[k]) : m);

function warnPlaceholders() {
  const todo = [];
  if (/YOUR SHOP/i.test(cfg.sellerName)) todo.push('sellerName');
  if (/example\.com/i.test(cfg.supportEmail)) todo.push('supportEmail');
  if (/your-kit-link/i.test(cfg.appUrl)) todo.push('appUrl');
  if (todo.length) console.warn(`\n⚠  Still placeholders in sell/config.json: ${todo.join(', ')}. Fine for a preview, but update them before you upload to a shop.\n`);
}

function copyApp(dest) {
  fs.mkdirSync(path.join(dest, 'js'), { recursive: true });
  for (const f of ['index.html', 'styles.css']) fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) fs.copyFileSync(path.join(ROOT, 'js', f), path.join(dest, 'js', f));
  // Stamp the license/owner into the footer.
  const p = path.join(dest, 'index.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(
    /<div class="wrap">([^<]*Nothing is uploaded\.)<\/div>/,
    `<div class="wrap">$1<br>© ${vars.year} ${esc(cfg.sellerName)} · Licensed for one person's personal use. Please don't share or resell. Questions? ${esc(cfg.supportEmail)}</div>`
  ));
}

async function appShots(browser, appIndex, out) {
  fs.mkdirSync(out, { recursive: true });
  const url = 'file://' + appIndex;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  await p.goto(url);
  await p.click('#loadSample');
  await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(out, 'about.png') });
  // Un-stick the header so it doesn't cover element screenshots.
  await p.addStyleTag({ content: '.site-header{position:static!important}' });

  await p.click('[data-tab=resume]');
  for (const t of ['classic', 'modern']) {
    await p.selectOption('#resumeTemplate', t);
    await p.waitForTimeout(300);
    await (await p.$('#resumeOut')).screenshot({ path: path.join(out, `resume-${t}.png`) });
  }
  await p.selectOption('#resumeTemplate', 'classic');

  await p.click('[data-tab=portfolio]');
  const site = await ctx.newPage();
  await site.setViewportSize({ width: 1440, height: 1100 });
  for (const theme of ['blush', 'sage', 'ocean', 'midnight']) {
    await p.selectOption('#portfolioTheme', theme);
    await p.waitForTimeout(300);
    await site.setContent(await p.$eval('#portfolioFrame', f => f.srcdoc), { waitUntil: 'networkidle' }).catch(() => {});
    await site.waitForTimeout(400);
    await site.screenshot({ path: path.join(out, `portfolio-${theme}.png`) });
  }
  await p.selectOption('#portfolioTheme', 'blush');

  await p.click('[data-tab=optimizer]');
  await p.click('#loadDrafts');
  const boxes = await p.$$('#checklist input');
  for (const cb of boxes.slice(0, 4)) await cb.check();
  await p.fill('#jobPost', "Hi! I'm a life coach looking for a VA to manage my Gmail inbox, schedule client calls in Calendly and create Instagram graphics in Canva. Thanks, Jessica");
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(out, 'optimizer.png') });
  await ctx.close();

  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('dialog', d => d.accept());
  await mp.goto(url);
  await mp.click('#loadSample');
  await mp.waitForTimeout(400);
  await mp.evaluate(() => window.scrollTo(0, 0));
  await mp.screenshot({ path: path.join(out, 'mobile-about.png') });
  await mp.click('[data-tab=resume]');
  await mp.waitForTimeout(400);
  await mp.evaluate(() => document.querySelector('.paper-wrap').scrollIntoView());
  await mp.screenshot({ path: path.join(out, 'mobile-resume.png') });
  await m.close();
}

async function main() {
  warnPlaceholders();
  if (path.basename(DIST) !== 'dist' || !DIST.startsWith(ROOT)) throw new Error('Unexpected dist path');
  fs.rmSync(DIST, { recursive: true, force: true });

  const appDir = path.join(DIST, 'app');
  const pkg = path.join(DIST, '_package', slug);
  const work = path.join(DIST, '_work');
  copyApp(appDir);
  copyApp(path.join(pkg, 'kit'));
  fs.mkdirSync(work, { recursive: true });

  const browser = await chromium.launch();
  try {
    console.log('• Taking app screenshots…');
    await appShots(browser, path.join(appDir, 'index.html'), path.join(work, 'shots'));

    console.log('• Making START HERE.pdf…');
    const guide = path.join(work, 'start-here.html');
    fs.writeFileSync(guide, fill(fs.readFileSync(path.join(__dirname, 'templates', 'start-here.html'), 'utf8')));
    const gp = await browser.newPage();
    await gp.goto('file://' + guide, { waitUntil: 'networkidle' }).catch(() => {});
    await gp.pdf({ path: path.join(DIST, 'START HERE.pdf'), format: 'Letter', printBackground: true, preferCSSPageSize: true });
    fs.copyFileSync(path.join(DIST, 'START HERE.pdf'), path.join(pkg, 'START HERE.pdf'));

    console.log('• Making listing images…');
    const mock = path.join(work, 'mockups.html');
    fs.writeFileSync(mock, fill(fs.readFileSync(path.join(__dirname, 'templates', 'mockups.html'), 'utf8')));
    const mp = await browser.newPage({ viewport: { width: 2100, height: 1600 } });
    await mp.goto('file://' + mock, { waitUntil: 'networkidle' }).catch(() => {});
    await mp.waitForTimeout(500);
    const imgDir = path.join(DIST, 'listing-images');
    fs.mkdirSync(imgDir, { recursive: true });
    const names = { s1: '01-cover', s2: '02-whats-inside', s3: '03-profile-optimizer', s4: '04-resume', s5: '05-portfolio', s6: '06-beginner-friendly', 'cover-wide': 'gumroad-payhip-cover-1280x720', thumb: 'thumbnail-square' };
    for (const [id, name] of Object.entries(names)) {
      await (await mp.$('#' + id)).screenshot({ path: path.join(imgDir, name + '.png') });
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(pkg, 'LICENSE.txt'),
`${cfg.productName} v${cfg.version}
© ${vars.year} ${cfg.sellerName}. All rights reserved.

PERSONAL-USE LICENSE
Your purchase lets ONE person use this kit to create their own resumes,
portfolio websites and freelance profiles, as many as they like.

You may NOT share, resell, give away, upload or redistribute this kit, its
files or its access link, in whole or in part, or include it in another
product, course or bundle.

Not affiliated with or endorsed by Upwork or OnlineJobs.ph.
No specific result (interviews, clients or income) is guaranteed.

Support: ${cfg.supportEmail}
`);

  console.log('• Zipping…');
  const zipPath = path.join(DIST, slug + '.zip');
  execFileSync('zip', ['-rq', '-X', zipPath, slug], { cwd: path.join(DIST, '_package') });

  console.log(`\n✓ Done. Look in ${DIST}:
  app/                  → drag onto app.netlify.com/drop to get your appUrl
  ${slug}.zip   → the buyer download
  START HERE.pdf        → upload alongside the ZIP
  listing-images/       → product photos\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
