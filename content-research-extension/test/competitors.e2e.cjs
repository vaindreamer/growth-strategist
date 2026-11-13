// End-to-end test of deep competitor research against mock Instagram / TikTok / Facebook.
// Loads the real extension in Chromium and serves fake platform pages via request routing.
// Usage: node test/competitors.e2e.cjs [screenshotDir] [mode=deep|fast]
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const EXT = path.join(__dirname, '..');
const OUT = process.argv[2] || fs.mkdtempSync('/tmp/vl-');
const MODE = process.argv[3] || 'deep';
const page = (head, body) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const day = (n) => new Date(Date.now() - n * 864e5);

// ---------- mock data ----------
const IG = {
  abcbail: { name: 'ABC Bail Bonds', followers: '12K', reels: [
    ['R1', 'How much does bail cost in Texas? Watch this before you pay 💸', 480000, 21000, 1400, 2],
    ['R2', 'Our office hours', 3100, 40, 2, 5], ['R3', 'Happy Friday from the team', 2800, 35, 1, 9],
    ['R4', '3 mistakes families make when someone gets arrested', 95000, 4100, 320, 12],
    ['R5', 'Call us 24/7', 2500, 22, 3, 16], ['R6', 'Meet Maria, our agent', 4000, 90, 6, 20]
  ] },
  freedombail: { name: 'Freedom Bail', followers: '3,400', reels: [
    ['F1', 'What happens after you get bailed out?', 12000, 300, 44, 3], ['F2', 'Bail vs bond explained', 2000, 30, 4, 10],
    ['F3', 'Client testimonial', 1500, 25, 2, 17], ['F4', 'Holiday hours', 900, 9, 0, 24]
  ] }
};
const COMMENTS = ['How much is the fee for a $5,000 bond?', 'Thank you, you saved my family 🙏', 'Do you take payment plans?', 'Is this available 24/7 in Houston?', 'Scam, they never answered', 'My son was arrested last night what do I do?'];
const TT = { bailtx: { name: 'Bail TX', followers: '5.2K', videos: [
  [1, 'POV: your cousin calls you from jail at 3am 😳 #bailbonds', 820000, 61000, 2100, 3400, 4, 27],
  [2, 'bail bond myths', 14000, 600, 30, 12, 8, 45], [3, 'day in the life of a bondsman', 9000, 400, 18, 6, 15, 60], [4, 'office tour', 7000, 210, 9, 2, 22, 33]
] } };

function igProfile(h) {
  const p = IG[h];
  const tiles = p.reels.map(([c, , views]) => `<a href="/${h}/reel/${c}/"><img alt="reel" src="data:,"><span>${views >= 1000 ? (views / 1000).toFixed(1) + 'K' : views}</span></a>`).join('');
  return page(`<meta property="og:description" content="${p.followers} Followers, 100 Following, 340 Posts - See Instagram photos and videos from ${p.name} (@${h})"><meta property="og:title" content="${p.name} (@${h}) • Instagram photos and videos">`,
    `<header><section><h1>${p.name}</h1><div>Licensed bail bonds · 24/7</div></section></header><main>${tiles}</main>`);
}
function igPost(h, code) {
  const r = IG[h].reels.find((x) => x[0] === code);
  const [, cap, views, likes, comments, ago] = r;
  const d = day(ago);
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const cm = COMMENTS.map((t, i) => `<li><div><div><a href="/user${i}/">user${i}</a></div><span dir="auto">${t}</span><span>2w</span><span>Reply</span></div></li>`).join('');
  return page(`<meta property="og:description" content="${likes.toLocaleString('en-US')} likes, ${comments} comments - ${h} on ${date}: &quot;${cap}&quot;">`,
    `<script>window.__d={"play_count":${views},"taken_at":${Math.floor(d / 1000)}}</script><main><article><ul><li><a href="/${h}/">${h}</a><h1>${cap}</h1></li>${cm}</ul><time datetime="${d.toISOString()}">${ago}d</time></article></main>`);
}
function ttProfile(h) {
  const p = TT[h];
  return page('', `<h1 data-e2e="user-title">${h}</h1><h2 data-e2e="user-subtitle">${p.name}</h2><strong data-e2e="followers-count">${p.followers}</strong><strong data-e2e="likes-count">1.1M</strong><h2 data-e2e="user-bio">Fast bail in Texas</h2>` +
    p.videos.map(([id, cap, views]) => `<div data-e2e="user-post-item"><a href="https://www.tiktok.com/@${h}/video/${id}"><img alt="${cap}"></a><strong data-e2e="video-views">${views}</strong></div>`).join(''));
}
function ttVideo(h, id) {
  const [, cap, views, likes, comments, shares, ago, dur] = TT[h].videos.find((v) => v[0] === +id);
  const data = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { desc: cap, createTime: Math.floor(day(ago) / 1000), video: { duration: dur }, music: { title: 'original sound', authorName: h },
    stats: { playCount: views, diggCount: likes, commentCount: comments, shareCount: shares, collectCount: 50 }, textExtra: [{ hashtagName: 'bailbonds' }] } } } } };
  return page('', `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script>` +
    COMMENTS.map((t, i) => `<div class="DivCommentItemContainer"><p data-e2e="comment-level-1">${t}</p>\n${(i + 1) * 10}</div>`).join(''));
}
function fbSearch() {
  return page('', `<div role="main"><div role="article"><a role="link" href="https://www.facebook.com/quickbailfl">Quick Bail FL</a><span>Bail bond service · 3.4K followers</span></div>
    <div role="article"><a href="https://www.facebook.com/groups/123">Some group</a></div></div>`);
}
function fbPage() {
  const posts = [['Need bail fast? Here is how the process works in Florida, step by step.', 950, 120, 40, 2], ['We are open on Sunday', 12, 1, 0, 6], ['Thank you to all our clients', 20, 3, 1, 9], ['Meet our new agent', 15, 2, 0, 13]];
  return page('', `<div role="main"><h1>Quick Bail FL</h1><span>3.4K followers</span>` + posts.map(([m, r, c, s, d], i) =>
    `<div role="article"><h2>Quick Bail FL</h2><a href="https://www.facebook.com/quickbailfl/posts/pfbid${i}?__cft__=x">${d}d</a><div data-ad-preview="message">${m}</div><div><span>All reactions:</span> <span>${r}</span></div> <div><span>${c} comments</span> <span>${s} shares</span></div></div>`).join('') + '</div>');
}

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(OUT, 'profile-' + Date.now()), {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const hits = [];
  await ctx.route(/^https:\/\/www\.(instagram|tiktok|facebook)\.com\//, (route) => {
    const u = new URL(route.request().url());
    hits.push(u.hostname.split('.')[1] + u.pathname);
    const html = (b) => route.fulfill({ contentType: 'text/html', body: b });
    let m;
    if (u.hostname === 'www.instagram.com') {
      if (/topsearch/.test(u.pathname)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ users: Object.entries(IG).map(([h, p]) => ({ user: { username: h, full_name: p.name, follower_count: 1000 } })) }) });
      if (/^\/explore\//.test(u.pathname)) return html(page('', '<main>results</main>'));
      if ((m = u.pathname.match(/^\/(\w+)\/(?:reels\/)?$/)) && IG[m[1]]) return html(igProfile(m[1]));
      if ((m = u.pathname.match(/^\/(\w+)\/reel\/(\w+)\/$/))) return html(igPost(m[1], m[2]));
    }
    if (u.hostname === 'www.tiktok.com') {
      if (/^\/search\/user/.test(u.pathname)) return html(page('', Object.entries(TT).map(([h, p]) => `<div data-e2e="search-user-container"><a href="/@${h}"><p data-e2e="search-user-nickname">${p.name}</p></a><span>${p.followers} Followers</span></div>`).join('')));
      if ((m = u.pathname.match(/^\/@(\w+)\/video\/(\d+)/))) return html(ttVideo(m[1], m[2]));
      if ((m = u.pathname.match(/^\/@(\w+)$/))) return html(ttProfile(m[1]));
    }
    if (u.hostname === 'www.facebook.com') {
      if (/^\/search\//.test(u.pathname)) return html(fbSearch());
      if (/^\/quickbailfl\/?$/.test(u.pathname)) return html(fbPage());
      if (/^\/quickbailfl\/reels/.test(u.pathname)) return html(page('', '<div role="main"></div>'));
    }
    route.fulfill({ status: 404, body: 'nope' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const panel = await ctx.newPage();
  const errors = [];
  panel.on('pageerror', (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.click('[data-tab="competitors"]');

  // 1. discover
  await panel.fill('#cqKeyword', 'bail bonds');
  await panel.fill('#cqCity', 'Houston');
  await panel.click('#cqFindBtn');
  await panel.waitForSelector('#cqAddBtn', { timeout: 120000 });
  const cands = await panel.locator('.cand').allInnerTexts();
  console.log('candidates:', cands.map((c) => c.replace(/\s+/g, ' ').trim()));
  assert.ok(cands.some((c) => /abcbail/.test(c)) && cands.some((c) => /bailtx/.test(c)) && cands.some((c) => /quickbailfl/.test(c)), 'found all 3 platforms');
  assert.ok(!cands.some((c) => /groups/.test(c)), 'facebook groups filtered out');
  await panel.click('#cqAddBtn');
  assert.equal(await panel.locator('.comp-row').count(), 4);

  // manual paste parsing
  await panel.fill('#compPaste', 'https://www.tiktok.com/@bailtx?lang=en\n@abcbail\nnot a link here\n');
  await panel.click('#compAddBtn');
  assert.equal(await panel.locator('.comp-row').count(), 4, 'duplicates ignored');

  // 2. research
  await panel.selectOption('#drMax', '12');
  await panel.selectOption('#drMode', MODE);
  const t0 = Date.now();
  await panel.click('#drStartBtn');
  await panel.waitForSelector('#drStartBtn:not(.hidden)', { timeout: 600000 });
  console.log(`research took ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log('status:', await panel.locator('#drStatus').innerText());

  const deep = await panel.evaluate(() => chrome.storage.local.get('deep').then((d) => d.deep));
  for (const r of deep.results) console.log(`  ${r.platform} @${r.handle}: ${r.error || `${r.posts.length} posts, followers ${r.summary.followers}, median ${r.summary.medianViews ?? r.summary.medianLikes}, best "${(r.summary.best || {}).title}"`}`);
  const abc = deep.results.find((r) => r.handle === 'abcbail');
  assert.equal(abc.summary.followers, 12000);
  assert.equal(abc.posts.length, 6);
  const r1 = abc.posts.find((p) => /bail cost/.test(p.title));
  assert.equal(r1.views, 480000); assert.equal(r1.likes, 21000); assert.equal(r1.comments, 1400);
  assert.ok(r1.ageHours > 40 && r1.ageHours < 56, 'post date parsed');
  assert.equal(r1.tier, 'viral');
  const tt = deep.results.find((r) => r.handle === 'bailtx');
  const v1 = tt.posts.find((p) => /POV/.test(p.title));
  assert.deepEqual([v1.views, v1.likes, v1.comments, v1.shares, v1.saves, v1.durationSec], [820000, 61000, 2100, 3400, 50, 27]);
  assert.ok(tt.summary.postsPerWeek > 0);
  const fb = deep.results.find((r) => r.platform === 'facebook');
  assert.equal(fb.posts.length, 4); assert.equal(fb.summary.followers, 3400);
  assert.equal(fb.posts.find((p) => /process/.test(p.title)).likes, 950);
  if (MODE === 'deep') {
    assert.ok(r1.topComments && r1.topComments.length >= 5, 'instagram comments read: ' + JSON.stringify(r1.topComments));
    assert.ok(!r1.topComments.some((c) => /bail cost in Texas/.test(c.text)), 'caption not counted as comment');
    assert.ok(v1.topComments.length === 6, 'tiktok comments read');
    const ins = deep.insights;
    console.log('intents:', ins.intents.map((i) => `${i.label} ${i.n}`).join(', '));
    console.log('questions:', ins.questions.slice(0, 4).map((q) => q.text));
    assert.ok(ins.intents.find((i) => i.key === 'price').n >= 2);
    assert.ok(ins.questions.some((q) => /payment plans/.test(q.text)));
  }

  // 3. report UI
  const report = await panel.locator('#drResults').innerText();
  assert.ok(/Competitor report/.test(report) && /ABC Bail Bonds/.test(report));
  await panel.screenshot({ path: path.join(OUT, `comp-${MODE}-report.png`), fullPage: true });
  await panel.locator('details.comp').first().evaluate((d) => (d.open = true));
  await panel.locator('details.comp').first().screenshot({ path: path.join(OUT, `comp-${MODE}-card.png`) });
  await panel.click('#drPatternsBtn');
  assert.ok(/Analysed \d+ posts/.test(await panel.locator('#researchOut').innerText()), 'research tab uses competitor data');
  assert.deepEqual(errors, []);
  console.log('page loads:', hits.length, '| competitors e2e passed (' + MODE + ')');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
