import { scoreItems, summarize, research, remixIdeas, toTemplate, detectHooks, tokenize, tierOf, fmt, pct, ageLabel, reachLabel, toCSV } from './lib/analyze.js';
import { MODELS, askClaude, buildMarketPrompt, buildRemixPrompt, buildPagePrompt, md } from './lib/ai.js';
import { initCompetitors } from './competitors.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLATFORM_NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', x: 'X', reddit: 'Reddit', linkedin: 'LinkedIn', web: 'Web page' };
const MAX_SCANS = 40;

const state = { settings: {}, scans: [], swipe: [], current: null, tabId: null, competitors: [], deep: null };

// ---------------- storage ----------------
async function load() {
  const d = await chrome.storage.local.get(['settings', 'scans', 'swipe', 'competitors', 'deep']);
  state.competitors = d.competitors || [];
  state.deep = d.deep || null;
  state.settings = d.settings || {};
  state.scans = d.scans || [];
  state.swipe = d.swipe || [];
  state.current = state.scans[0] || null;
}
const saveScans = () => chrome.storage.local.set({ scans: state.scans });
const saveSwipe = () => { chrome.storage.local.set({ swipe: state.swipe }); $('#swipeCount').textContent = state.swipe.length; };

// ---------------- tabs ----------------
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'research') renderResearch();
  if (name === 'swipe') renderSwipe();
  if (name === 'settings') renderSettings();
}

// ---------------- active tab tracking ----------------
function platformOf(url) {
  try {
    const h = new URL(url).hostname;
    if (/youtube\.com$/.test(h)) return 'youtube';
    if (/tiktok\.com$/.test(h)) return 'tiktok';
    if (/instagram\.com$/.test(h)) return 'instagram';
    if (/(^|\.)x\.com$|twitter\.com$/.test(h)) return 'x';
    if (/reddit\.com$/.test(h)) return 'reddit';
    if (/linkedin\.com$/.test(h)) return 'linkedin';
    if (/facebook\.com$/.test(h)) return 'facebook';
    if (/^https?:/.test(url)) return 'web';
  } catch {}
  return null;
}
async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab ? tab.id : null;
  const p = tab ? platformOf(tab.url || '') : null;
  $('#platformChip').textContent = p ? PLATFORM_NAMES[p] : '–';
  $('#pageTitle').textContent = tab ? (tab.title || tab.url) : '';
  $('#pageTitle').title = tab ? tab.url : '';
  const ok = !!p;
  $('#scanBtn').disabled = !ok; $('#deepScanBtn').disabled = !ok || p === 'web';
  $('#scanBtn').textContent = p === 'web' ? 'Analyse this page' : 'Scan this page';
}
chrome.tabs.onActivated.addListener(refreshActiveTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (id === state.tabId && (info.title || info.url || info.status === 'complete')) refreshActiveTab(); });

// ---------------- scanning ----------------
async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}
async function runInPage(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res && res.result;
}

function setStatus(msg, err = false) { const s = $('#scanStatus'); s.innerHTML = msg; s.classList.toggle('err', err); }

async function scan(deep) {
  await refreshActiveTab();
  if (!state.tabId) return;
  const btns = [$('#scanBtn'), $('#deepScanBtn')];
  btns.forEach((b) => (b.disabled = true));
  setStatus(`<span class="spinner"></span>${deep ? 'Scrolling to load more posts, then scanning…' : 'Scanning…'}`);
  try {
    await inject(state.tabId);
    const res = await runInPage(state.tabId, (o) => window.__vlScan(o), [{ scroll: deep ? 6 : 0 }]);
    if (!res || !res.ok) throw new Error(res ? res.error : 'No response from page');
    if (res.platform === 'web') {
      state.webPage = res.page;
      renderWebSnapshot();
      setStatus('Page snapshot ready. For viral metrics, open a social platform page.');
      return;
    }
    $('#webSnapshot').classList.add('hidden');
    if (!res.items.length) {
      setStatus('No posts found on this page. Try a profile’s Videos/Reels tab, a search results page, a hashtag page or a subreddit — and scroll a bit first.', true);
      return;
    }
    const items = scoreItems(res.items, res.context);
    const scan = { id: 's' + Date.now(), platform: res.platform, url: res.url, pageTitle: res.pageTitle, scannedAt: res.scannedAt, context: res.context, items };
    state.scans = [scan, ...state.scans.filter((s) => s.url !== scan.url)].slice(0, MAX_SCANS);
    state.current = scan;
    await saveScans();
    const withMetrics = items.filter((i) => i.reach != null).length;
    setStatus(`Found ${items.length} posts${withMetrics < items.length ? ` (${withMetrics} with visible numbers)` : ''}.`);
    renderScan();
    if ($('#badgesToggle').checked) drawBadges();
  } catch (e) {
    setStatus(friendlyError(e), true);
  } finally {
    await refreshActiveTab();
  }
}
function friendlyError(e) {
  const m = String(e && e.message || e);
  if (/Cannot access|cannot be scripted|chrome:\/\//i.test(m)) return 'Chrome doesn’t allow scanning this kind of page. Open a normal website.';
  if (/permission/i.test(m)) return 'No permission for this site. Click the Viral Lens toolbar icon on this tab, then try again.';
  return 'Scan failed: ' + esc(m);
}

async function drawBadges() {
  if (!state.current || !state.tabId) return;
  const labels = {};
  for (const i of state.current.items) {
    const t = tierOf(i.tier);
    labels[i.id] = { text: `${t.emoji} ${i.outlier ? i.outlier.toFixed(1) + 'x' : i.viralScore}`, color: t.color, tip: `${t.label} · score ${i.viralScore} · ${fmt(i.reach)} ${reachLabel(i)}` };
  }
  try { await inject(state.tabId); await runInPage(state.tabId, (l) => window.__vlHighlight(l), [$('#badgesToggle').checked ? labels : {}]); } catch {}
}
$('#badgesToggle').addEventListener('change', drawBadges);
$('#scanBtn').addEventListener('click', () => scan(false));
$('#deepScanBtn').addEventListener('click', () => scan(true));

// ---------------- render: scan ----------------
function sortItems(items, by) {
  const k = { newest: (i) => (i.ageHours == null ? Infinity : i.ageHours) };
  if (by === 'newest') return [...items].sort((a, b) => k.newest(a) - k.newest(b));
  return [...items].sort((a, b) => (b[by] ?? -1) - (a[by] ?? -1));
}
function filterItems(items) {
  const tier = $('#tierSel').value, q = $('#filterText').value.trim().toLowerCase();
  const order = ['normal', 'above', 'outlier', 'viral'];
  return items.filter((i) => (tier === 'all' || order.indexOf(i.tier) >= order.indexOf(tier)) && (!q || (i.title + ' ' + i.author).toLowerCase().includes(q)));
}

function renderScan() {
  const s = state.current;
  if (!s) { $('#scanResults').classList.add('hidden'); return; }
  $('#scanResults').classList.remove('hidden');
  const sum = summarize(s.items);
  const label = reachLabel(s.items.find((i) => i.reach != null) || {}) || 'reach';
  $('#stats').innerHTML = [
    [sum.count, 'posts'],
    [fmt(sum.medianReach), 'median ' + label],
    [sum.topOutlier ? sum.topOutlier.toFixed(1) + 'x' : '–', 'top outlier'],
    [sum.viral + sum.outliers, '🚀/🔥 posts']
  ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  const items = filterItems(sortItems(s.items, $('#sortSel').value));
  $('#itemList').innerHTML = items.length ? items.map((i) => itemCard(i, false)).join('') : '<div class="empty">No posts match this filter.</div>';
}
['#sortSel', '#tierSel'].forEach((s) => $(s).addEventListener('change', renderScan));
$('#filterText').addEventListener('input', renderScan);

const isSaved = (url) => state.swipe.some((x) => x.url === url);

function itemCard(i, inSwipe) {
  const t = tierOf(i.tier);
  const img = i.thumbnail ? `<img class="thumb" src="${esc(i.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  const bits = [
    i.reach != null ? `<span class="badge" title="${esc(reachLabel(i))}">👁 ${fmt(i.reach)}</span>` : '',
    i.outlier ? `<span class="badge" title="vs typical post (${fmt(i.baseline)})">${i.outlier.toFixed(1)}x</span>` : '',
    i.velocity ? `<span class="badge" title="${esc(reachLabel(i))} per hour">⚡ ${fmt(i.velocity)}/h</span>` : '',
    i.engagement != null ? `<span class="badge" title="${i.platform === 'reddit' ? 'comments ÷ upvotes' : 'engagement rate'}">💬 ${pct(i.engagement)}</span>` : '',
    i.likes != null && i.views != null ? `<span class="badge">♥ ${fmt(i.likes)}</span>` : '',
    i.comments != null ? `<span class="badge">🗨 ${fmt(i.comments)}</span>` : '',
    i.shares != null ? `<span class="badge" title="shares">↗ ${fmt(i.shares)}</span>` : '',
    i.followerRatio != null && i.followerRatio > 1 ? `<span class="badge" title="views ÷ followers">${i.followerRatio.toFixed(1)}x followers</span>` : ''
  ].join('');
  const saved = isSaved(i.url);
  return `<div class="item ${img ? '' : 'noimg'}" data-url="${esc(i.url)}" data-id="${esc(i.id || '')}">
    ${img}
    <div>
      <div class="title" data-act="open" title="Open post">${esc(i.title || '(no caption)')}</div>
      <div class="meta">${esc(PLATFORM_NAMES[i.platform] || i.platform)}${i.author ? ' · ' + esc(i.author) : ''}${i.ageHours != null ? ' · ' + ageLabel(i.ageHours) : ''}${i.duration ? ' · ' + esc(i.duration) : ''}${i.format ? ' · ' + esc(i.format) : ''}</div>
      <div class="badges"><span class="badge tier" style="background:${t.color}">${t.emoji} ${t.label} · ${i.viralScore ?? '–'}</span>${bits}</div>
      ${i.topComments && i.topComments.length ? `<details class="cm"><summary>What people said (${i.topComments.length})</summary><ul>${i.topComments.map((c) => `<li>${esc(c.text.slice(0, 220))}${c.likes ? ` <span class="muted">♥ ${fmt(c.likes)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${inSwipe ? `<input class="tags" data-field="tags" placeholder="#tags (e.g. #hook #carousel)" value="${esc((i.tags || []).join(' '))}">
        <textarea data-field="notes" placeholder="Notes: why it works, what you'd change…">${esc(i.notes || '')}</textarea>` : ''}
      <div class="actions">
        <button class="btn small" data-act="remix">♻ Replicate</button>
        ${inSwipe ? '<button class="btn small" data-act="remove">Remove</button>' : `<button class="btn small ${saved ? 'saved' : ''}" data-act="save">${saved ? '✓ Saved' : '☆ Save'}</button>`}
        ${!inSwipe && i.id ? '<button class="btn small" data-act="locate" title="Scroll to it on the page">⌖</button>' : ''}
        <button class="btn small" data-act="copy" title="Copy title + link">⧉</button>
      </div>
    </div>
  </div>`;
}

function findItem(url) {
  return (state.current && state.current.items.find((i) => i.url === url)) || state.swipe.find((i) => i.url === url) ||
    state.scans.flatMap((s) => s.items).find((i) => i.url === url) ||
    (state.deep ? state.deep.results.flatMap((r) => r.posts) : []).find((i) => i.url === url);
}

function saveItem(i) {
  if (isSaved(i.url)) return false;
  state.swipe.unshift({ ...i, savedAt: new Date().toISOString(), tags: [], notes: '' });
  saveSwipe();
  return true;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.item');
  const url = card && card.dataset.url;
  const item = url && findItem(url);
  switch (btn.dataset.act) {
    case 'open': chrome.tabs.create({ url, active: false }); break;
    case 'save': if (item && saveItem(item)) { btn.textContent = '✓ Saved'; btn.classList.add('saved'); } break;
    case 'remove': state.swipe = state.swipe.filter((x) => x.url !== url); saveSwipe(); renderSwipe(); break;
    case 'remix': if (item) openRemix(item); break;
    case 'copy': navigator.clipboard.writeText(`${item.title}\n${url}`); flash(btn, '✓'); break;
    case 'locate': try { await runInPage(state.tabId, (id) => window.__vlScrollTo(id), [card.dataset.id]); } catch {} break;
  }
});
function flash(btn, txt) { const o = btn.textContent; btn.textContent = txt; setTimeout(() => (btn.textContent = o), 1000); }

$('#saveTopBtn').addEventListener('click', () => {
  if (!state.current) return;
  const n = state.current.items.filter((i) => ['outlier', 'viral'].includes(i.tier)).map(saveItem).filter(Boolean).length;
  setStatus(`Saved ${n} new post${n === 1 ? '' : 's'} to your swipe file.`);
  renderScan();
});
$('#exportScanBtn').addEventListener('click', () => state.current && download(`viral-lens-${state.current.platform}-${dateStamp()}.csv`, toCSV(state.current.items), 'text/csv'));

// ---------------- web page snapshot ----------------
function renderWebSnapshot() {
  const p = state.webPage;
  const el = $('#webSnapshot');
  el.classList.remove('hidden');
  $('#scanResults').classList.add('hidden');
  el.innerHTML = `<h3>Page snapshot</h3>
    <div class="meta">${esc(p.url)}</div>
    <p><b>${esc(p.title)}</b><br><span class="muted">${esc(p.description || 'No meta description')}</span></p>
    <h4>Headings (their messaging)</h4><ul class="small">${p.headings.slice(0, 15).map((h) => `<li>${esc(h)}</li>`).join('') || '<li>none</li>'}</ul>
    <h4>Calls to action</h4><div class="chips">${p.ctas.map((c) => `<span>${esc(c)}</span>`).join('') || '<span>none found</span>'}</div>
    ${p.prices.length ? `<h4>Prices spotted</h4><div class="chips">${p.prices.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    <p class="small muted">${fmt(p.wordCount)} words on page</p>
    <button class="btn small ai" id="aiPageBtn">✨ AI competitor breakdown</button>
    <div id="aiPageOut" class="ai-out hidden"></div>`;
  $('#aiPageBtn').addEventListener('click', () => runAI($('#aiPageBtn'), $('#aiPageOut'), buildPagePrompt(p, state.settings)));
}

// ---------------- research ----------------
function researchItems() {
  const src = $('#sourceSel').value;
  if (src === 'swipe') return { items: state.swipe, label: 'my saved posts' };
  if (src === 'deep') return { items: state.deep ? state.deep.results.flatMap((r) => r.posts) : [], label: 'my latest competitor research' + (state.deep && state.deep.query ? ` for "${state.deep.query}"` : '') };
  if (src === 'latest') return { items: state.current ? state.current.items : [], label: state.current ? `${PLATFORM_NAMES[state.current.platform]} – ${state.current.pageTitle}` : 'nothing yet' };
  const days = src === 'all7' ? 7 : 30;
  const since = Date.now() - days * 864e5;
  const seen = new Set(), items = [];
  for (const s of state.scans) if (new Date(s.scannedAt).getTime() >= since) for (const i of s.items) if (!seen.has(i.url)) { seen.add(i.url); items.push(i); }
  return { items, label: `all scans from the last ${days} days (${new Set(state.scans.map((s) => s.platform)).size} platforms)` };
}

function bars(rows, valFn, labelFn, max) {
  const m = max || Math.max(...rows.map(valFn), 1);
  return `<div class="bars">${rows.map((r) => {
    const v = valFn(r);
    return `<div class="bar"><span>${labelFn(r)}</span><span class="val">${v.toFixed(1)}x</span><div class="track"><div class="fill ${v < 1 ? 'neg' : ''}" style="width:${Math.min(100, (v / m) * 100)}%"></div></div></div>`;
  }).join('')}</div>`;
}

function renderResearch() {
  const { items } = researchItems();
  const r = research(items);
  const out = $('#researchOut');
  if (!r.enough) {
    out.innerHTML = `<div class="empty">Need at least 4 posts with numbers to find patterns (have ${r.n}).<br>Search a keyword above, then scan a few pages.</div>`;
    return;
  }
  const niche = (state.settings.niche || '').trim();
  const templates = r.topTitles.slice(0, 6).map((t) => toTemplate(t.title));
  out.innerHTML = `
    <div class="card">
      <h3>Market snapshot</h3>
      <p class="small">Analysed <b>${r.n}</b> posts. The top ${r.topN} perform a median <b>${r.medianTopOutlier.toFixed(1)}x</b> better than typical.
      ${r.avgTopEngagement != null && r.avgRestEngagement != null ? `Their engagement is <b>${pct(r.avgTopEngagement)}</b> vs ${pct(r.avgRestEngagement)} for the rest.` : ''}</p>
    </div>
    <div class="card">
      <h3>Winning hooks & title patterns</h3>
      <p class="muted small">How much better posts using each pattern perform (median outlier with ÷ without).</p>
      ${bars(r.patterns.slice(0, 10), (p) => p.lift, (p) => `${esc(p.label)} <span class="muted">· ${Math.round(p.share * 100)}% of posts</span>`)}
    </div>
    <div class="card">
      <h3>Words that show up in winners</h3>
      <div class="chips">${r.keywords.map((k) => `<span title="in ${k.top} top posts vs ${k.rest} others">${esc(k.word)} <b>${k.lift.toFixed(1)}x</b></span>`).join('') || '<span>not enough data</span>'}</div>
      ${r.phrases.length ? `<h4>Winning phrases</h4><div class="chips">${r.phrases.map((k) => `<span>${esc(k.word)} <b>${k.top}</b></span>`).join('')}</div>` : ''}
      <h4>Most common topics overall</h4>
      <div class="chips">${r.allWords.map((k) => `<span>${esc(k.word)} ${k.n}</span>`).join('')}</div>
    </div>
    <div class="card">
      <h3>Format & length</h3>
      ${r.formats.length > 1 ? `<h4>Format (median outlier)</h4>${bars(r.formats, (f) => f.medianOutlier, (f) => `${esc(f.format)} <span class="muted">· ${f.n}</span>`)}` : ''}
      <h4>Title length</h4>${bars(r.lengths, (f) => f.medianOutlier, (f) => `${esc(f.bucket)} <span class="muted">· ${f.n}</span>`)}
      ${r.bestDays.length ? `<h4>Best posting windows <span class="muted small">(your timezone)</span></h4>
        <table class="mini">${r.bestDays.map((d) => `<tr><td>${d.day}</td><td>${d.medianOutlier.toFixed(1)}x</td><td class="muted">${d.n} posts</td></tr>`).join('')}
        ${r.bestHours.map((h) => `<tr><td>${h.window}</td><td>${h.medianOutlier.toFixed(1)}x</td><td class="muted">${h.n} posts</td></tr>`).join('')}</table>` : ''}
    </div>
    <div class="card">
      <h3>Creators to watch</h3>
      <table class="mini"><tr><th>Creator</th><th>Platform</th><th>Posts</th><th>2x+ hits</th><th>Best</th></tr>
      ${r.creators.map((c) => `<tr><td>${esc(c.author)}</td><td>${esc(PLATFORM_NAMES[c.platform] || c.platform)}</td><td>${c.n}</td><td>${c.hits}</td><td>${c.best.toFixed(1)}x</td></tr>`).join('')}</table>
    </div>
    <div class="card">
      <h3>Hook templates to reuse</h3>
      <p class="muted small">Built from the top posts. Click to copy, then fill in with ${niche ? '<b>' + esc(niche) + '</b>' : 'your topic'}.</p>
      ${templates.map((t) => `<div class="tpl" title="Click to copy">${esc(t)}</div>`).join('')}
      <h4>Top posts</h4>
      <ol class="small">${r.topTitles.map((t) => `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title.slice(0, 120))}</a> <b>${t.outlier.toFixed(1)}x</b></li>`).join('')}</ol>
    </div>`;
  $$('.tpl', out).forEach((el) => el.addEventListener('click', () => { navigator.clipboard.writeText(el.textContent); el.style.borderColor = 'var(--accent)'; }));
}
$('#sourceSel').addEventListener('change', () => { $('#aiResearchOut').classList.add('hidden'); renderResearch(); });

const LAUNCH = {
  youtube: (q) => `https://www.youtube.com/results?search_query=${q}&sp=CAM%253D`,
  youtubeRecent: (q) => `https://www.youtube.com/results?search_query=${q}&sp=CAMSAggE`,
  tiktok: (q) => `https://www.tiktok.com/search/video?q=${q}`,
  instagram: (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(decodeURIComponent(q).replace(/[^\p{L}\p{N}_]/gu, ''))}/`,
  x: (q) => `https://x.com/search?q=${q}%20min_faves%3A500&f=top`,
  reddit: (q) => `https://www.reddit.com/search/?q=${q}&sort=top&t=month`,
  linkedin: (q) => `https://www.linkedin.com/search/results/content/?keywords=${q}&sortBy=%22relevance%22`,
  trends: (q) => `https://trends.google.com/trends/explore?q=${q}&date=today%203-m`
};
$$('[data-launch]').forEach((b) => b.addEventListener('click', () => {
  const kw = $('#kw').value.trim() || state.settings.niche || '';
  if (!kw) { $('#kw').focus(); return; }
  chrome.tabs.create({ url: LAUNCH[b.dataset.launch](encodeURIComponent(kw)) });
}));

// ---------------- AI ----------------
async function runAI(btn, outEl, prompt) {
  const original = btn.textContent;
  btn.disabled = true;
  outEl.classList.remove('hidden');
  outEl.innerHTML = '<p><span class="spinner"></span>Claude is analysing… this can take up to a minute.</p>';
  try {
    const text = await askClaude({ apiKey: state.settings.apiKey, model: state.settings.model, prompt });
    outEl.innerHTML = md(text) + '<div class="ai-actions"><button class="btn small" data-copy>Copy</button><button class="btn small" data-dl>Download .md</button></div>';
    outEl.querySelector('[data-copy]').addEventListener('click', (e) => { navigator.clipboard.writeText(text); flash(e.target, '✓ Copied'); });
    outEl.querySelector('[data-dl]').addEventListener('click', () => download(`viral-lens-brief-${dateStamp()}.md`, text, 'text/markdown'));
  } catch (e) {
    outEl.innerHTML = `<p class="status err">${esc(e.message)}</p>${/API key/.test(e.message) ? '<button class="btn small" data-goto-settings>Open settings</button>' : ''}`;
    const g = outEl.querySelector('[data-goto-settings]'); if (g) g.addEventListener('click', () => showTab('settings'));
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}
$('#aiScanBtn').addEventListener('click', () => {
  if (!state.current) return;
  const items = state.current.items;
  runAI($('#aiScanBtn'), $('#aiScanOut'), buildMarketPrompt(items, research(items), state.settings, `${PLATFORM_NAMES[state.current.platform]} page "${state.current.pageTitle}" (${state.current.url})`));
});
$('#aiResearchBtn').addEventListener('click', () => {
  const { items, label } = researchItems();
  if (items.length < 3) { $('#aiResearchOut').classList.remove('hidden'); $('#aiResearchOut').innerHTML = '<p class="status err">Scan a few pages first.</p>'; return; }
  runAI($('#aiResearchBtn'), $('#aiResearchOut'), buildMarketPrompt(items, research(items), state.settings, label));
});

// ---------------- remix drawer ----------------
function openRemix(item) {
  const r = remixIdeas(item, state.settings);
  const kws = tokenize(item.title).slice(0, 6);
  $('#drawerBody').innerHTML = `
    <div class="item noimg" style="margin-bottom:8px"><div>
      <div class="title">${esc(item.title || '(no caption)')}</div>
      <div class="meta">${esc(PLATFORM_NAMES[item.platform])} · ${esc(item.author || '')} · ${fmt(item.reach)} ${reachLabel(item)}${item.outlier ? ' · ' + item.outlier.toFixed(1) + 'x typical' : ''}</div>
      <a class="small" href="${esc(item.url)}" target="_blank" rel="noopener">Open original ↗</a>
    </div></div>
    <h4>Why it may be working</h4>
    <div class="chips">${(r.hooks.length ? r.hooks : ['Plain / descriptive title — the topic or visual is doing the work']).map((h) => `<span>${esc(h)}</span>`).join('')}</div>
    ${item.engagement != null ? `<p class="small">Engagement ${pct(item.engagement)}${item.velocity ? ` · ${fmt(item.velocity)} ${reachLabel(item)}/hour` : ''}.</p>` : ''}
    <h4>Reusable template</h4>
    <div class="tpl" title="Click to copy">${esc(r.template)}</div>
    <h4>5 ways to make it yours${state.settings.niche ? '' : ' <span class="muted small">(set your niche in ⚙ for better ideas)</span>'}</h4>
    <ol class="small">${r.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
    ${kws.length ? `<h4>Keywords</h4><div class="chips">${kws.map((k) => `<span>${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="row gap wrap" style="margin-top:10px">
      <button class="btn small ai" id="aiRemixBtn">✨ Full AI breakdown + 5 scripts</button>
      ${isSaved(item.url) ? '' : '<button class="btn small" id="drawerSave">☆ Save to swipe file</button>'}
    </div>
    <div id="aiRemixOut" class="ai-out hidden"></div>`;
  $('#drawer').classList.remove('hidden');
  $('.tpl', $('#drawerBody')).addEventListener('click', (e) => navigator.clipboard.writeText(e.target.textContent));
  $('#aiRemixBtn').addEventListener('click', () => runAI($('#aiRemixBtn'), $('#aiRemixOut'), buildRemixPrompt(item, state.settings)));
  const s = $('#drawerSave'); if (s) s.addEventListener('click', () => { saveItem(item); s.textContent = '✓ Saved'; s.classList.add('saved'); renderScan(); });
}
$('#drawerClose').addEventListener('click', () => $('#drawer').classList.add('hidden'));
$('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') $('#drawer').classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#drawer').classList.add('hidden'); });

// ---------------- swipe file ----------------
function renderSwipe() {
  const q = $('#swipeFilter').value.trim().toLowerCase();
  const list = state.swipe.filter((i) => !q || [i.title, i.author, i.notes, (i.tags || []).join(' '), i.platform].join(' ').toLowerCase().includes(q));
  $('#swipeList').innerHTML = list.length ? list.map((i) => itemCard(i, true)).join('')
    : `<div class="empty">${state.swipe.length ? 'Nothing matches.' : 'Your swipe file is empty.<br>Scan a page and hit ☆ Save on posts worth remaking.'}</div>`;
}
$('#swipeFilter').addEventListener('input', renderSwipe);
$('#swipeList').addEventListener('change', (e) => {
  const f = e.target.dataset.field; if (!f) return;
  const url = e.target.closest('.item').dataset.url;
  const it = state.swipe.find((x) => x.url === url); if (!it) return;
  it[f] = f === 'tags' ? e.target.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t)) : e.target.value;
  saveSwipe();
});
$('#swipeCsvBtn').addEventListener('click', () => download(`viral-lens-swipe-file-${dateStamp()}.csv`, toCSV(state.swipe), 'text/csv'));
$('#swipeJsonBtn').addEventListener('click', () => download(`viral-lens-backup-${dateStamp()}.json`, JSON.stringify({ swipe: state.swipe, settings: { ...state.settings, apiKey: undefined } }, null, 2), 'application/json'));
$('#swipeImport').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.swipe || [];
    let n = 0;
    for (const i of incoming) if (i && i.url && !isSaved(i.url)) { state.swipe.push(i); n++; }
    saveSwipe(); renderSwipe();
    alert(`Imported ${n} posts.`);
  } catch { alert('That file isn’t a Viral Lens backup.'); }
  e.target.value = '';
});

// ---------------- settings ----------------
const FIELDS = { setNiche: 'niche', setAudience: 'audience', setOffer: 'offer', setVoice: 'voice', setPlatforms: 'platforms', setKey: 'apiKey', setModel: 'model' };
function renderSettings() {
  $('#setModel').innerHTML = MODELS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  for (const [id, k] of Object.entries(FIELDS)) $('#' + id).value = state.settings[k] || (k === 'model' ? MODELS[0].id : '');
  const n = state.scans.reduce((a, s) => a + s.items.length, 0);
  $('#dataInfo').textContent = `${state.scans.length} scans (${n} posts) and ${state.swipe.length} saved posts, stored locally in this browser.`;
}
$('#saveSettingsBtn').addEventListener('click', async () => {
  for (const [id, k] of Object.entries(FIELDS)) state.settings[k] = $('#' + id).value.trim();
  await chrome.storage.local.set({ settings: state.settings });
  $('#settingsSaved').textContent = 'Saved ✓'; setTimeout(() => ($('#settingsSaved').textContent = ''), 1500);
});
$('#testKeyBtn').addEventListener('click', async () => {
  const out = $('#testKeyOut');
  out.innerHTML = '<span class="spinner"></span>Testing…';
  try {
    await askClaude({ apiKey: $('#setKey').value.trim(), model: $('#setModel').value, prompt: 'Reply with the single word: ready' });
    out.textContent = '✓ Key works';
  } catch (e) { out.textContent = '✕ ' + e.message; }
});
$('#clearScansBtn').addEventListener('click', async () => {
  if (!confirm('Delete all scan history? Your swipe file is kept.')) return;
  state.scans = []; state.current = null; await saveScans(); renderSettings(); renderScan();
});

// ---------------- utils ----------------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const dateStamp = () => new Date().toISOString().slice(0, 10);

// ---------------- init ----------------
(async () => {
  await load();
  $('#swipeCount').textContent = state.swipe.length;
  await refreshActiveTab();
  initCompetitors({ state, $, $$, esc, itemCard, runAI, download, dateStamp, showResearch: (src) => { showTab('research'); $('#sourceSel').value = src; renderResearch(); } });
  if (state.current) { renderScan(); setStatus(`Showing your last scan: ${esc(state.current.pageTitle)} (${ageLabel((Date.now() - new Date(state.current.scannedAt)) / 3.6e6)})`); }
})();

// exposed for debugging in DevTools
window.__vl = { state, detectHooks };
