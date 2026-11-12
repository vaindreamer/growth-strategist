// Runs content.js against mock platform markup in headless Chromium.
// Usage: node test/scanner.test.cjs
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const fx = (n) => 'file://' + path.join(__dirname, 'fixtures', n + '.html');
  const run = async (name, platform) => {
    await page.goto(fx(name));
    await page.addScriptTag({ path: path.join(__dirname, '..', 'content.js') });
    return page.evaluate((p) => window.__vlScan({ platform: p }), platform);
  };

  const yt = await run('youtube', 'youtube');
  assert.ok(yt.ok, yt.error);
  assert.equal(yt.items.length, 5);
  assert.equal(yt.items[0].views, 1200000);
  assert.equal(yt.items[0].ageHours, 72);
  assert.equal(yt.items[3].views, 15400);
  assert.equal(yt.items[4].format, 'short');
  assert.equal(yt.context.followers, 120000);

  const x = await run('x', 'x');
  assert.equal(x.items.length, 3);
  assert.deepEqual([x.items[0].views, x.items[0].likes, x.items[0].shares, x.items[0].comments], [1100000, 12000, 1450, 120]);
  assert.equal(x.items[0].author, 'coachq');

  const tt = await run('tiktok', 'tiktok');
  assert.equal(tt.items.length, 3);
  assert.deepEqual(tt.items.map((i) => i.views), [2300000, 14100, 9812]);
  assert.equal(tt.context.followers, 48200);
  assert.ok(tt.items[0].title.startsWith('POV'));

  const rd = await run('reddit', 'reddit');
  assert.equal(rd.items.length, 5);
  assert.equal(rd.items[0].score, 15200);
  assert.equal(rd.items[0].comments, 1204);

  const parse = await page.evaluate(() => [
    window.__vlParse.parseCount('1.2M views'), window.__vlParse.parseCount('3,456'), window.__vlParse.parseCount('12K'),
    window.__vlParse.parseAgeHours('2 weeks ago'), window.__vlParse.parseAgeHours('Streamed 5 hours ago'), window.__vlParse.parseAgeHours('3d ago')
  ]);
  assert.deepEqual(parse, [1200000, 3456, 12000, 336, 5, 72]);

  const hl = await page.evaluate((id) => { window.__vlHighlight({ [id]: { text: '🔥 50x', color: '#dc2626', tip: 't' } }); return document.querySelectorAll('.__vl-badge').length; }, rd.items[0].id);
  assert.equal(hl, 1);

  await browser.close();
  console.log('scanner tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
