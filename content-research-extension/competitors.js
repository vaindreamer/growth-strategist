// Viral Lens – deep competitor research (Instagram, TikTok, Facebook).
// Drives one dedicated browser tab step by step: search → profile → each post,
// with human-paced delays, and builds a competitor report from what it reads.
import { scoreItems, competitorSummary, commentInsights, fmt, pct, ageLabel, toCSV } from './lib/analyze.js';
import { buildCompetitorPrompt } from './lib/ai.js';

const PLATFORMS = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const hoursSince = (iso) => { const t = new Date(iso).getTime(); return isFinite(t) ? Math.max(0.05, (Date.now() - t) / 3.6e6) : null; };

// ---------------- parsing competitor input ----------------
export function profileUrl(platform, handle) {
  if (platform === 'instagram') return `https://www.instagram.com/${handle}/`;
  if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  if (platform === 'facebook') return handle.startsWith('profile.php') ? `https://www.facebook.com/${handle}` : `https://www.facebook.com/${handle}/`;
  return '';
}

export function parseCompetitor(line, fallbackPlatform = 'instagram') {
  let s = (line || '').trim();
  if (!s) return null;
  let platform = null, handle = null;
  if (/^(https?:\/\/)?([\w-]+\.)?(instagram|tiktok|facebook)\.com\//i.test(s)) {
    let u;
    try { u = new URL(/^https?:/i.test(s) ? s : 'https://' + s); } catch { return null; }
    const seg = u.pathname.split('/').filter(Boolean);
    if (/instagram\.com$/.test(u.hostname)) {
      platform = 'instagram';
      if (seg[0] && !['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(seg[0])) handle = seg[0];
    } else if (/tiktok\.com$/.test(u.hostname)) {
      platform = 'tiktok';
      const m = u.pathname.match(/\/@([\w.]+)/); if (m) handle = m[1];
    } else if (/facebook\.com$/.test(u.hostname)) {
      platform = 'facebook';
      if (seg[0] === 'profile.php' && u.searchParams.get('id')) handle = 'profile.php?id=' + u.searchParams.get('id');
      else if (seg[0] && !['search', 'groups', 'watch', 'reel', 'share', 'permalink.php', 'story.php'].includes(seg[0])) handle = seg[0];
    }
  } else {
    platform = fallbackPlatform;
    handle = s.replace(/^@/, '');
    if (!/^[\w.-]{2,60}$/.test(handle)) return null;
  }
  if (!platform || !handle) return null;
  return { id: platform + ':' + handle.toLowerCase(), platform, handle, url: profileUrl(platform, handle), name: '', include: true };
}

function searchUrl(platform, q) {
  const e = encodeURIComponent(q);
  if (platform === 'instagram') return `https://www.instagram.com/explore/search/keyword/?q=${e}`;
  if (platform === 'tiktok') return `https://www.tiktok.com/search/user?q=${e}`;
  if (platform === 'facebook') return `https://www.facebook.com/search/pages/?q=${e}`;
}

function postKey(url) {
  const m = url.match(/\/(?:p|reel|reels|video|photo)\/([\w-]+)/);
  return m ? m[1] : url;
}

// ---------------- the module ----------------
export function initCompetitors(ctx) {
  const { state, $, $$, esc, itemCard, runAI, download, dateStamp } = ctx;
  const work = { tabId: null, running: false, stop: false, steps: 0, done: 0 };
  let candidates = [];

  const saveCompetitors = () => chrome.storage.local.set({ competitors: state.competitors });
  const saveDeep = () => chrome.storage.local.set({ deep: state.deep });
  const label = (c) => `${c.name ? c.name + ' ' : ''}@${c.handle.replace(/^profile\.php\?id=/, 'id ')} (${PLATFORMS[c.platform]})`;

  // ---------- tab driving ----------
  async function getWorkTab() {
    if (work.tabId) { try { const t = await chrome.tabs.get(work.tabId); await chrome.tabs.update(t.id, { active: true }); return t.id; } catch {} }
    const t = await chrome.tabs.create({ url: 'about:blank', active: true });
    work.tabId = t.id;
    return t.id;
  }
  function navigate(tabId, url) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(l); clearTimeout(timer); err ? reject(err) : resolve(); };
      const l = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
      const timer = setTimeout(() => finish(), 25000);
      chrome.tabs.onUpdated.addListener(l);
      chrome.tabs.update(tabId, { url }).catch((e) => finish(new Error('The research tab was closed.')));
    }).then(() => sleep(rand(1800, 3000)));
  }
  async function call(tabId, fn, args = []) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: (name, a) => window[name](...a), args: [fn, args] });
    return r && r.result;
  }
  async function waitForUser(tabId, platform, block) {
    const msg = block === 'captcha'
      ? `${PLATFORMS[platform]} wants to check you're human. Solve the puzzle in the research tab — I'll continue automatically.`
      : `You're not logged in to ${PLATFORMS[platform]}. Log in in the research tab — I'll continue automatically.`;
    if (block !== 'captcha' && block !== 'login') return false;
    status('⏸ ' + msg, true); log('⏸ ' + msg);
    try { const t = await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); } catch {}
    const end = Date.now() + 180000;
    while (Date.now() < end && !work.stop) {
      await sleep(3000);
      try { if (!(await call(tabId, '__vlBlock', [platform]))) { log('▶ Thanks — continuing.'); return true; } } catch {}
    }
    return false;
  }
  function blockMessage(block, platform) {
    if (block === 'login') return `Not logged in to ${PLATFORMS[platform]} – log in in this browser and run again.`;
    if (block === 'captcha') return `${PLATFORMS[platform]} asked for a captcha that wasn't solved.`;
    if (block === 'notfound') return 'Profile not found (check the handle).';
    return 'Could not open this profile.';
  }

  // ---------- UI helpers ----------
  function status(msg, warn = false) { const s = $('#drStatus'); s.textContent = msg; s.classList.toggle('err', warn); }
  function log(msg) {
    const el = $('#drLog');
    el.insertAdjacentHTML('afterbegin', `<div>${esc(new Date().toLocaleTimeString())} · ${esc(msg)}</div>`);
    while (el.children.length > 60) el.lastChild.remove();
  }
  function progress() { $('#drBar').style.width = Math.min(100, (work.done / Math.max(work.steps, 1)) * 100) + '%'; }
  function setRunning(on) {
    work.running = on;
    $('#drStartBtn').classList.toggle('hidden', on);
    $('#drStopBtn').classList.toggle('hidden', !on);
    $('#cqFindBtn').disabled = on;
    if (on) $('#drProgress').classList.remove('hidden');
  }

  // ---------- 1. discover competitors ----------
  async function discover() {
    const kw = $('#cqKeyword').value.trim();
    if (!kw) { $('#cqKeyword').focus(); return; }
    const q = [kw, $('#cqCity').value.trim()].filter(Boolean).join(' ');
    const plats = $$('.cqPlat').filter((c) => c.checked).map((c) => c.value);
    if (!plats.length) return;
    Object.assign(state.settings, { lastQuery: q, lastKeyword: kw, lastCity: $('#cqCity').value.trim() });
    chrome.storage.local.set({ settings: state.settings });
    setRunning(true); work.stop = false; work.steps = plats.length; work.done = 0; progress();
    candidates = [];
    try {
      const tabId = await getWorkTab();
      for (const p of plats) {
        if (work.stop) break;
        status(`Searching ${PLATFORMS[p]} for "${q}"…`);
        await navigate(tabId, searchUrl(p, q));
        let r = await call(tabId, '__vlDiscover', [p, q]);
        if (r && r.block && (await waitForUser(tabId, p, r.block))) { await navigate(tabId, searchUrl(p, q)); r = await call(tabId, '__vlDiscover', [p, q]); }
        const found = (r && r.accounts) || [];
        log(`${PLATFORMS[p]}: found ${found.length} accounts${r && r.block ? ' (' + blockMessage(r.block, p) + ')' : ''}`);
        found.forEach((a, i) => candidates.push({ ...a, id: p + ':' + a.handle.toLowerCase(), pick: i < 5 }));
        work.done++; progress();
        await sleep(rand(1500, 2500));
      }
      status(candidates.length ? `Found ${candidates.length} accounts. Tick the real competitors and add them to your list.` : 'No accounts found. Try a different keyword, or paste competitor links below.', !candidates.length);
    } catch (e) { status('Search stopped: ' + e.message, true); }
    setRunning(false);
    renderCandidates();
  }

  function renderCandidates() {
    const el = $('#cqCandidates');
    if (!candidates.length) { el.innerHTML = ''; return; }
    const have = new Set(state.competitors.map((c) => c.id));
    el.innerHTML = `<div class="cands">${candidates.map((c, i) => `
      <label class="cand ${have.has(c.id) ? 'muted' : ''}">
        <input type="checkbox" data-cand="${i}" ${c.pick && !have.has(c.id) ? 'checked' : ''} ${have.has(c.id) ? 'disabled' : ''}>
        <span class="chip">${esc(PLATFORMS[c.platform])}</span>
        <span class="ellipsis"><b>${esc(c.name || c.handle)}</b> <span class="muted">@${esc(c.handle)}</span></span>
        <span class="muted small">${c.followers != null ? fmt(c.followers) : ''}</span>
        <a href="${esc(c.url)}" target="_blank" rel="noopener" title="Open">↗</a>
      </label>`).join('')}</div>
      <button id="cqAddBtn" class="btn small primary">Add ticked to my list</button>`;
    $$('[data-cand]', el).forEach((cb) => cb.addEventListener('change', () => (candidates[+cb.dataset.cand].pick = cb.checked)));
    $('#cqAddBtn').addEventListener('click', () => {
      let n = 0;
      for (const c of candidates) if (c.pick && !state.competitors.some((x) => x.id === c.id)) {
        state.competitors.push({ id: c.id, platform: c.platform, handle: c.handle, url: profileUrl(c.platform, c.handle), name: c.name, followers: c.followers, include: true }); n++;
      }
      saveCompetitors(); renderList(); renderCandidates();
      status(`Added ${n} competitor${n === 1 ? '' : 's'}.`);
    });
  }

  // ---------- 2. competitor list ----------
  function renderList() {
    const el = $('#compList');
    $('#compCount').textContent = state.competitors.length;
    el.innerHTML = state.competitors.length ? state.competitors.map((c) => `
      <div class="comp-row" data-cid="${esc(c.id)}">
        <input type="checkbox" data-inc ${c.include ? 'checked' : ''} title="Include in research">
        <span class="chip">${esc(PLATFORMS[c.platform])}</span>
        <a class="ellipsis" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name || '@' + c.handle)}</a>
        <span class="muted small">${c.followers != null ? fmt(c.followers) : ''}</span>
        <button class="btn small" data-del title="Remove">✕</button>
      </div>`).join('') : '<p class="muted small">No competitors yet. Find them above, or paste their profile links below.</p>';
    $$('.comp-row', el).forEach((row) => {
      const c = state.competitors.find((x) => x.id === row.dataset.cid);
      row.querySelector('[data-inc]').addEventListener('change', (e) => { c.include = e.target.checked; saveCompetitors(); estimate(); });
      row.querySelector('[data-del]').addEventListener('click', () => { state.competitors = state.competitors.filter((x) => x !== c); saveCompetitors(); renderList(); });
    });
    estimate();
  }
  function addLines(text, plat) {
    let n = 0, bad = [];
    for (const line of text.split(/[\n,]+/)) {
      if (!line.trim()) continue;
      const c = parseCompetitor(line, plat);
      if (!c) { bad.push(line.trim()); continue; }
      if (!state.competitors.some((x) => x.id === c.id)) { state.competitors.push(c); n++; }
    }
    saveCompetitors(); renderList();
    return { n, bad };
  }
  function estimate() {
    const n = state.competitors.filter((c) => c.include).length;
    const max = +$('#drMax').value, deep = $('#drMode').value === 'deep';
    const mins = Math.max(1, Math.round((n * (25 + max * (deep ? 9 : 3))) / 60));
    $('#drEstimate').textContent = n ? `${n} competitor${n === 1 ? '' : 's'} × ${max} posts ≈ ${mins} min. Keep this panel open while it runs.` : 'Tick at least one competitor.';
  }

  // ---------- 3. deep research ----------
  async function openProfile(tabId, c, max) {
    const urls = c.platform === 'instagram' ? [`https://www.instagram.com/${c.handle}/reels/`, `https://www.instagram.com/${c.handle}/`]
      : c.platform === 'facebook' ? [c.url, c.handle.startsWith('profile.php') ? c.url + '&sk=reels_tab' : c.url.replace(/\/?$/, '/') + 'reels/']
      : [c.url];
    const items = new Map();
    let profile = null, lastBlock = null;
    for (let u = 0; u < urls.length; u++) {
      if (work.stop) break;
      if (u > 0) {
        const withNums = [...items.values()].filter((i) => i.views != null || i.likes != null).length;
        if (c.platform === 'instagram' && items.size >= max * 0.6) break;
        if (c.platform === 'facebook' && withNums >= 3) break;
      }
      await navigate(tabId, urls[u]);
      let r = await call(tabId, '__vlProfile', [c.platform, { max }]);
      if (r && r.block && (await waitForUser(tabId, c.platform, r.block))) { await navigate(tabId, urls[u]); r = await call(tabId, '__vlProfile', [c.platform, { max }]); }
      if (!r || !r.ok) { lastBlock = r && r.block; continue; }
      if (!profile || (!profile.followers && r.profile.followers)) profile = { ...(profile || {}), ...Object.fromEntries(Object.entries(r.profile).filter(([, v]) => v)) };
      for (const i of r.items) { const k = postKey(i.url); if (!items.has(k)) items.set(k, i); else { const o = items.get(k); for (const f of ['views', 'likes', 'comments']) if (o[f] == null && i[f] != null) o[f] = i[f]; } }
    }
    if (!items.size) return { ok: false, block: lastBlock };
    return { ok: true, profile: profile || {}, items: [...items.values()].slice(0, max) };
  }

  function mergeDetail(p, d, comments) {
    if (d) {
      for (const k of ['views', 'likes', 'comments', 'shares', 'saves', 'durationSec', 'sound', 'hashtags', 'postedAt']) if (d[k] != null && d[k] !== '') p[k] = d[k];
      if (d.caption && d.caption.length > (p.title || '').length) p.title = d.caption.replace(/\s+/g, ' ').slice(0, 1000);
      if (d.postedAt) p.ageHours = hoursSince(d.postedAt);
      if (d.durationSec && !p.duration) p.duration = `${Math.floor(d.durationSec / 60)}:${String(Math.round(d.durationSec % 60)).padStart(2, '0')}`;
    }
    if (comments && comments.length) p.topComments = comments;
  }

  async function run() {
    const list = state.competitors.filter((c) => c.include);
    if (!list.length) { status('Tick at least one competitor first.', true); return; }
    const max = +$('#drMax').value, mode = $('#drMode').value;
    work.stop = false; setRunning(true);
    $('#drLog').innerHTML = '';
    work.steps = list.length * (max + 1); work.done = 0; progress();
    state.deep = { startedAt: new Date().toISOString(), query: state.settings.lastQuery || '', mode, max, results: [] };
    let tabId;
    try { tabId = await getWorkTab(); } catch (e) { status('Could not open a tab: ' + e.message, true); setRunning(false); return; }
    log(`Started: ${list.length} competitors, up to ${max} posts each, ${mode === 'deep' ? 'with comments' : 'stats only'}.`);

    for (const c of list) {
      if (work.stop) break;
      const res = { id: c.id, platform: c.platform, handle: c.handle, name: c.name, url: c.url, posts: [], error: null };
      try {
        status(`Opening ${label(c)}…`);
        const prof = await openProfile(tabId, c, max);
        if (!prof.ok) throw new Error(blockMessage(prof.block, c.platform) + (prof.block ? '' : ' No posts found.'));
        res.name = prof.profile.name || c.name; res.bio = prof.profile.bio || ''; res.profile = prof.profile;
        if (prof.profile.followers) c.followers = prof.profile.followers;
        if (res.name && !c.name) c.name = res.name;
        const posts = prof.items.map((i) => ({ ...i, platform: c.platform, author: c.handle }));
        work.steps -= max - posts.length; work.done++; progress();
        log(`${label(c)}: ${fmt(prof.profile.followers)} followers, ${posts.length} posts found.`);

        if (c.platform !== 'facebook') {
          let fastFails = 0;
          for (let k = 0; k < posts.length && !work.stop; k++) {
            const p = posts[k];
            status(`${label(c)} · reading post ${k + 1} of ${posts.length}…`);
            let r = null;
            if (mode === 'fast' && fastFails < 3) {
              try { r = await call(tabId, '__vlPostDetail', [c.platform, p.url]); } catch {}
              if (!r || !r.ok) fastFails++; else fastFails = 0;
              await sleep(rand(1300, 2800));
            }
            if (mode === 'deep' || !r || !r.ok) {
              await navigate(tabId, p.url);
              r = await call(tabId, '__vlReadPost', [c.platform, { maxComments: 15 }]);
              if (r && r.block && (await waitForUser(tabId, c.platform, r.block))) { await navigate(tabId, p.url); r = await call(tabId, '__vlReadPost', [c.platform, { maxComments: 15 }]); }
              if (mode === 'deep') await sleep(rand(1200, 2600));
            }
            if (r && r.ok) mergeDetail(p, r.detail, r.comments);
            work.done++; progress();
          }
        }
        res.posts = scoreItems(posts, { followers: prof.profile.followers }).map((p) => ({ ...p, id: undefined }));
        res.summary = competitorSummary(res.posts, prof.profile);
        c.lastResearched = new Date().toISOString();
        log(`✓ ${label(c)} done – median ${fmt(res.summary.medianViews ?? res.summary.medianLikes)} ${res.summary.medianViews != null ? 'views' : 'likes'}, ${res.summary.hits} posts at 2x+.`);
      } catch (e) {
        res.error = e.message;
        log(`⚠ ${label(c)}: ${e.message}`);
        if (/tab was closed/.test(e.message)) { work.stop = true; work.tabId = null; }
      }
      state.deep.results.push(res);
      finalize();
      await saveDeep(); await saveCompetitors();
      renderResults();
      if (!work.stop) await sleep(rand(2500, 4500));
    }
    state.deep.finishedAt = new Date().toISOString();
    finalize(); await saveDeep();
    setRunning(false);
    const ok = state.deep.results.filter((r) => !r.error).length;
    status(work.stop ? `Stopped. Saved results for ${ok} competitor${ok === 1 ? '' : 's'}.` : `Done! Researched ${ok} of ${list.length} competitors. Scroll down for the report.`);
    renderList(); renderResults();
    try { await chrome.tabs.update(tabId, { url: 'about:blank' }); } catch {}
  }
  function finalize() {
    state.deep.insights = commentInsights(state.deep.results.flatMap((r) => r.posts));
  }

  // ---------- results ----------
  function renderResults() {
    const el = $('#drResults');
    const d = state.deep;
    if (!d || !d.results.length) { el.innerHTML = ''; return; }
    const good = d.results.filter((r) => !r.error && r.summary);
    const allPosts = good.flatMap((r) => r.posts);
    const ins = d.insights || { n: 0 };
    const reachName = (s) => (s.medianViews != null ? 'views' : 'likes');
    el.innerHTML = `
      <div class="card">
        <h3>Competitor report</h3>
        <p class="muted small">${esc(new Date(d.startedAt).toLocaleString())}${d.query ? ` · "${esc(d.query)}"` : ''} · ${good.length} competitors · ${allPosts.length} posts${ins.n ? ` · ${ins.n} comments` : ''}${d.finishedAt ? '' : ' · <b>running…</b>'}</p>
        <div class="row gap wrap">
          <button class="btn small ai" id="drAiBtn">✨ AI competitor report + content plan</button>
          <button class="btn small" id="drCsvBtn">Export CSV</button>
          <button class="btn small" id="drPatternsBtn">See winning patterns →</button>
        </div>
        <div id="drAiOut" class="ai-out hidden"></div>
        ${good.length ? `<div class="tablewrap"><table class="mini cmp">
          <tr><th>Competitor</th><th>Followers</th><th>Typical</th><th>Eng.</th><th>Posts/wk</th><th>Best</th></tr>
          ${[...good].sort((a, b) => (b.summary.medianViews ?? b.summary.medianLikes ?? 0) - (a.summary.medianViews ?? a.summary.medianLikes ?? 0)).map((r) => `<tr>
            <td><span class="chip">${{ instagram: 'IG', tiktok: 'TT', facebook: 'FB' }[r.platform]}</span> <a href="#comp-${esc(r.id)}" data-jump="${esc(r.id)}">${esc(r.name || '@' + r.handle)}</a></td>
            <td>${fmt(r.summary.followers)}</td>
            <td>${fmt(r.summary.medianViews ?? r.summary.medianLikes)} <span class="muted">${reachName(r.summary)}</span></td>
            <td>${pct(r.summary.avgEngagement)}</td>
            <td>${r.summary.postsPerWeek ? r.summary.postsPerWeek.toFixed(1) : '–'}</td>
            <td>${r.summary.best ? fmt(r.summary.best.reach) : '–'}</td></tr>`).join('')}
        </table></div>` : ''}
        ${d.results.filter((r) => r.error).map((r) => `<p class="status err small">⚠ ${esc(r.name || '@' + r.handle)}: ${esc(r.error)}</p>`).join('')}
      </div>
      ${ins.n ? `<div class="card">
        <h3>What people say in the comments</h3>
        <p class="muted small">From ${ins.n} comments on competitors' posts. Their questions and objections are your next videos.</p>
        <div class="bars">${ins.intents.map((i) => `<details class="intent"><summary><span>${esc(i.label)}</span><span class="val">${Math.round(i.share * 100)}%</span><div class="track"><div class="fill" style="width:${Math.round(i.share * 100)}%"></div></div></summary>
          <ul class="small">${i.examples.map((x) => `<li>“${esc(x.slice(0, 200))}”</li>`).join('')}</ul></details>`).join('')}</div>
        ${ins.questions.length ? `<h4>Questions people ask</h4><ol class="small qs">${ins.questions.map((q) => `<li>${esc(q.text)} ${q.likes ? `<span class="muted">♥ ${fmt(q.likes)}</span>` : ''} <a href="${esc(q.url)}" target="_blank" rel="noopener">↗</a></li>`).join('')}</ol>` : ''}
        ${ins.words.length ? `<h4>Words they use</h4><div class="chips">${ins.words.map((w) => `<span>${esc(w.word)} ${w.n}</span>`).join('')}</div>` : ''}
      </div>` : d.mode === 'fast' && d.finishedAt ? '<p class="muted small">Tip: run in <b>Deep</b> mode to also read what people say in the comments.</p>' : ''}
      ${d.results.map((r) => compCard(r)).join('')}`;

    $('#drAiBtn').addEventListener('click', () => {
      if (!good.length) return;
      runAI($('#drAiBtn'), $('#drAiOut'), buildCompetitorPrompt(good, ins, state.settings, d.query));
    });
    $('#drCsvBtn').addEventListener('click', () => download(`viral-lens-competitors-${dateStamp()}.csv`, toCSV(allPosts), 'text/csv'));
    $('#drPatternsBtn').addEventListener('click', () => ctx.showResearch('deep'));
    $$('[data-jump]', el).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = document.getElementById('comp-' + a.dataset.jump); if (t) { t.open = true; t.scrollIntoView({ behavior: 'smooth' }); } }));
    $$('[data-allposts]', el).forEach((b) => b.addEventListener('click', () => {
      const r = d.results.find((x) => x.id === b.dataset.allposts);
      b.insertAdjacentHTML('beforebegin', [...r.posts].sort((x, y) => (y.viralScore || 0) - (x.viralScore || 0)).slice(5).map((p) => itemCard(p, false)).join(''));
      b.remove();
    }));
  }

  function compCard(r) {
    if (r.error || !r.summary) return '';
    const s = r.summary;
    const stat = (v, l) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
    return `<details class="card comp" id="comp-${esc(r.id)}">
      <summary><span class="chip">${esc(PLATFORMS[r.platform])}</span> <b>${esc(r.name || '@' + r.handle)}</b> <span class="muted small">@${esc(r.handle)} · ${fmt(s.followers)} followers</span></summary>
      ${r.bio ? `<p class="small muted">${esc(r.bio)}</p>` : ''}
      <div class="stats">
        ${stat(fmt(s.medianViews ?? s.medianLikes), 'typical ' + (s.medianViews != null ? 'views' : 'likes'))}
        ${stat(pct(s.avgEngagement), 'engagement')}
        ${stat(s.postsPerWeek ? s.postsPerWeek.toFixed(1) : '–', 'posts / week')}
        ${stat(s.hits, 'posts at 2x+')}
      </div>
      <p class="small">
        ${s.lastPostDays != null ? `Last post ${ageLabel(s.lastPostDays * 24)}. ` : ''}
        ${s.viewsPerFollower != null ? `Typical post reaches ${pct(s.viewsPerFollower)} of followers. ` : ''}
        ${s.medianDuration ? `Typical video length ${Math.round(s.medianDuration)}s. ` : ''}
        ${s.formats.length > 1 ? `Best format: <b>${esc(s.formats[0].format)}</b>.` : ''}
      </p>
      ${s.hashtags.length ? `<div class="chips">${s.hashtags.map((h) => `<span>#${esc(h.tag)} ${h.n}</span>`).join('')}</div>` : ''}
      <h4>Their best posts</h4>
      <div class="list">${[...r.posts].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0)).slice(0, 5).map((p) => itemCard(p, false)).join('')}
      ${r.posts.length > 5 ? `<button class="btn small" data-allposts="${esc(r.id)}">Show all ${r.posts.length} posts</button>` : ''}</div>
    </details>`;
  }

  // ---------- wire up ----------
  $('#cqFindBtn').addEventListener('click', discover);
  $('#compAddBtn').addEventListener('click', () => {
    const { n, bad } = addLines($('#compPaste').value, $('#compPastePlat').value);
    $('#compPaste').value = bad.join('\n');
    status(`Added ${n}.${bad.length ? ' Could not read: ' + bad.join(', ') : ''}`, !!bad.length);
    $('#drProgress').classList.remove('hidden');
  });
  $('#compAddTabBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const c = tab && parseCompetitor(tab.url);
    $('#drProgress').classList.remove('hidden');
    if (!c) { status('Open a competitor’s Instagram, TikTok or Facebook profile first, then click this.', true); return; }
    if (!state.competitors.some((x) => x.id === c.id)) { c.name = (tab.title || '').replace(/\s*[(|•·].*$/, '').slice(0, 60); state.competitors.push(c); saveCompetitors(); renderList(); }
    status(`Added ${label(c)}.`);
  });
  $('#drStartBtn').addEventListener('click', () => run().catch((e) => { status('Research stopped: ' + e.message, true); setRunning(false); }));
  $('#drStopBtn').addEventListener('click', () => { work.stop = true; status('Stopping after this step…'); });
  ['#drMax', '#drMode'].forEach((s) => $(s).addEventListener('change', estimate));
  $('#cqKeyword').value = state.settings.lastKeyword || '';
  $('#cqCity').value = state.settings.lastCity || '';

  renderList();
  renderResults();
  return { renderList, renderResults, isRunning: () => work.running };
}
