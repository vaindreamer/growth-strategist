// Viral Lens – page scanner.
// Injected on demand by the side panel. Exposes window.__vlScan(options)
// and window.__vlHighlight(labels). Reads only what is visible on the page
// (plus Reddit's public .json listing) – no logins, no private APIs.
(() => {
  if (window.__vlLoaded) return;
  window.__vlLoaded = true;

  const elById = new Map();

  // ---------- parsing helpers ----------
  const MULT = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

  function parseCount(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().toLowerCase().replace(/ /g, ' ');
    const m = s.match(/(\d[\d,.]*)\s*([kmbt])?(?![a-z])/i);
    if (!m) return null;
    let num = m[1];
    const suffix = m[2] ? m[2].toLowerCase() : '';
    if (suffix) {
      num = num.replace(/,/g, '.');
      // "1.2.3" safety
      const parts = num.split('.');
      if (parts.length > 2) num = parts[0] + '.' + parts.slice(1).join('');
    } else {
      // 1,234,567 or 1.234.567 -> thousands separators
      if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '');
      else num = num.replace(/,/g, '');
    }
    const v = parseFloat(num);
    if (!isFinite(v)) return null;
    return Math.round(v * (MULT[suffix] || 1));
  }

  const UNIT_H = { second: 1 / 3600, sec: 1 / 3600, s: 1 / 3600, minute: 1 / 60, min: 1 / 60, m: 1 / 60, hour: 1, hr: 1, h: 1, day: 24, d: 24, week: 168, wk: 168, w: 168, month: 730, mo: 730, year: 8760, yr: 8760, y: 8760 };

  function parseAgeHours(text) {
    if (!text) return null;
    const s = String(text).toLowerCase();
    let m = s.match(/(\d+|an?|one)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)\s*ago/);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
      const unit = m[2].replace(/s$/, '').replace(/^(sec|min|hr|wk|mo|yr)s?$/, '$1');
      return n * (UNIT_H[unit] ?? UNIT_H[unit.replace(/s$/, '')] ?? 24);
    }
    m = s.match(/\b(\d+)\s*(s|m|h|d|w|mo|y)\b(\s*ago)?/);
    if (m && (m[3] || /^\s*\d+\s*(s|m|h|d|w|mo|y)\s*$/.test(s) || /ago/.test(s))) {
      return parseInt(m[1], 10) * UNIT_H[m[2]];
    }
    if (/yesterday/.test(s)) return 24;
    if (/just now|now$/.test(s)) return 0.1;
    return null;
  }

  function hoursSince(date) {
    const t = new Date(date).getTime();
    if (!isFinite(t)) return null;
    return Math.max(0.05, (Date.now() - t) / 3.6e6);
  }

  const txt = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const abs = (href) => { try { return new URL(href, location.href).href; } catch { return href || ''; } };
  const firstText = (root, sels) => { for (const s of sels) { const e = root.querySelector(s); const t = txt(e); if (t) return t; } return ''; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let idSeq = 0;
  function register(el, item) {
    item.id = item.id || 'vl' + (++idSeq);
    if (el) elById.set(item.id, el);
    return item;
  }

  function detectPlatform(host) {
    if (/youtube\.com$/.test(host)) return 'youtube';
    if (/tiktok\.com$/.test(host)) return 'tiktok';
    if (/instagram\.com$/.test(host)) return 'instagram';
    if (/(^|\.)x\.com$|twitter\.com$/.test(host)) return 'x';
    if (/reddit\.com$/.test(host)) return 'reddit';
    if (/linkedin\.com$/.test(host)) return 'linkedin';
    if (/facebook\.com$/.test(host)) return 'facebook';
    return 'web';
  }

  // ---------- YouTube ----------
  function scanYouTube() {
    const cardSel = [
      'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
      'ytd-compact-video-renderer', 'ytd-reel-item-renderer', 'ytm-shorts-lockup-view-model',
      'yt-lockup-view-model', 'ytd-playlist-video-renderer'
    ].join(',');
    const items = [];
    const seen = new Set();
    for (const card of document.querySelectorAll(cardSel)) {
      // skip outer wrappers that contain another card (avoid double-counting)
      if (card.querySelector(cardSel)) continue;
      const a = card.querySelector('a#video-title-link, a#video-title, a.yt-lockup-metadata-view-model__title, a[href*="/shorts/"], h3 a, a[href*="/watch"]');
      if (!a) continue;
      const url = abs(a.getAttribute('href'));
      const key = url.replace(/&.*$/, '');
      if (!/\/(watch|shorts)/.test(url) || seen.has(key)) continue;
      seen.add(key);
      const all = txt(card);
      const title = (a.getAttribute('title') || txt(a) || firstText(card, ['#video-title', 'h3', '[role="heading"]'])).split('\n')[0].trim();
      const vm = all.match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s*views/i);
      const ageText = (all.match(/(?:streamed\s+|premiered\s+)?\d+\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago/i) || [])[0] || '';
      let author = firstText(card, ['ytd-channel-name #text', 'ytd-channel-name a', 'a[href^="/@"]', '.yt-content-metadata-view-model__metadata-text']);
      if (/views|ago/i.test(author)) author = '';
      if (!author && /\/@[^/]+/.test(location.pathname)) author = decodeURIComponent(location.pathname.match(/\/@([^/]+)/)[1]);
      const dur = firstText(card, ['ytd-thumbnail-overlay-time-status-renderer #text', 'badge-shape .badge-shape-wiz__text', '.yt-badge-shape__text']);
      const img = card.querySelector('img[src^="http"]');
      items.push(register(card, {
        platform: 'youtube', title, url, author,
        views: vm ? parseCount(vm[1]) : null,
        ageHours: parseAgeHours(ageText), publishedText: ageText,
        duration: /^\d+(:\d+)+$/.test(dur) ? dur : '',
        format: /\/shorts\//.test(url) ? 'short' : 'video',
        thumbnail: img ? img.src : ''
      }));
    }
    const subs = (txt(document.querySelector('#page-header, ytd-c4-tabbed-header-renderer, yt-page-header-view-model')).match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s*subscribers/i) || [])[1];
    return { items, context: { followers: subs ? parseCount(subs) : null } };
  }

  // ---------- TikTok ----------
  function scanTikTok() {
    const items = [];
    const seen = new Set();
    const anchors = document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]');
    for (const a of anchors) {
      const url = abs(a.getAttribute('href')).split('?')[0];
      if (seen.has(url)) continue;
      const card = a.closest('[data-e2e="user-post-item"], [data-e2e="search_top-item"], [data-e2e="search_video-item"], [data-e2e="challenge-item"], [data-e2e="music-item"], [class*="DivItemContainer"], [class*="DivVideoItem"]') || a.parentElement;
      seen.add(url);
      const viewsEl = card.querySelector('[data-e2e="video-views"], strong[class*="VideoCount"], [data-e2e="search-card-like-container"] strong, strong');
      const likesEl = card.querySelector('[data-e2e*="like-count"]');
      const img = card.querySelector('img');
      const caption = firstText(card, ['[data-e2e="search-card-video-caption"]', '[data-e2e="user-post-item-desc"]', '[data-e2e="search-card-desc"]']) || (img && img.alt) || '';
      const author = (url.match(/\/@([^/]+)/) || [])[1] || firstText(card, ['[data-e2e="search-card-user-unique-id"]']);
      const dateText = firstText(card, ['[class*="DivTimeTag"]', '[class*="SpanTime"]', '[data-e2e="search-card-time"]']);
      let ageHours = parseAgeHours(dateText);
      if (ageHours == null && /^\d{1,4}-\d{1,2}(-\d{1,2})?$/.test(dateText)) {
        const p = dateText.split('-').map(Number);
        const d = p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : new Date(new Date().getFullYear(), p[0] - 1, p[1]);
        ageHours = hoursSince(d);
      }
      const isSearch = /search/.test(location.pathname) && card.querySelector('[data-e2e="search-card-like-container"]') && !card.querySelector('[data-e2e="video-views"]');
      const n = viewsEl ? parseCount(txt(viewsEl)) : null;
      items.push(register(card, {
        platform: 'tiktok', title: caption.replace(/\s+/g, ' ').slice(0, 300), url, author,
        views: isSearch ? null : n,
        likes: isSearch ? n : (likesEl ? parseCount(txt(likesEl)) : null),
        ageHours, publishedText: dateText,
        format: url.includes('/photo/') ? 'carousel' : 'short',
        pinned: /pinned/i.test(txt(card)),
        thumbnail: img ? img.src : ''
      }));
    }
    const followers = txt(document.querySelector('[data-e2e="followers-count"]'));
    return { items, context: { followers: followers ? parseCount(followers) : null } };
  }

  // ---------- Instagram ----------
  function scanInstagram() {
    const items = [];
    const seen = new Set();
    const profile = (location.pathname.match(/^\/([^/]+)\/?/) || [])[1] || '';
    for (const a of document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')) {
      const url = abs(a.getAttribute('href')).split('?')[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const img = a.querySelector('img');
      const nums = (txt(a).match(/[\d.,]+\s*[KMB]?/gi) || []).map(parseCount).filter((n) => n != null);
      const isReel = url.includes('/reel/');
      // Reels grid shows view counts; post grid shows likes/comments only on hover.
      items.push(register(a, {
        platform: 'instagram',
        title: (img && img.alt ? img.alt : '').replace(/^Photo (by|shared by) [^.]+\.?\s*/i, '').slice(0, 300),
        url, author: ['explore', 'reels', 'p', 'reel'].includes(profile) ? '' : profile,
        views: isReel && nums.length === 1 ? nums[0] : null,
        likes: nums.length >= 2 ? nums[0] : null,
        comments: nums.length >= 2 ? nums[1] : null,
        format: isReel ? 'short' : 'post',
        thumbnail: img ? img.src : ''
      }));
    }
    const header = txt(document.querySelector('header'));
    const f = (header.match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s*followers/i) || [])[1];
    return { items, context: { followers: f ? parseCount(f) : null } };
  }

  // ---------- X / Twitter ----------
  function scanX() {
    const items = [];
    const seen = new Set();
    for (const art of document.querySelectorAll('article[data-testid="tweet"], article[role="article"]')) {
      const time = art.querySelector('time');
      const link = time ? time.closest('a') : art.querySelector('a[href*="/status/"]');
      if (!link) continue;
      const url = abs(link.getAttribute('href'));
      if (seen.has(url)) continue;
      seen.add(url);
      const group = art.querySelector('[role="group"][aria-label]');
      const label = (group && group.getAttribute('aria-label')) || '';
      const grab = (re) => { const m = label.match(re); return m ? parseCount(m[1]) : null; };
      const fromBtn = (id) => { const b = art.querySelector(`[data-testid="${id}"]`); return b ? parseCount(b.getAttribute('aria-label') || txt(b)) : null; };
      const views = grab(/([\d.,]+[KMB]?)\s+views?/i) ?? (() => { const v = art.querySelector('a[href$="/analytics"]'); return v ? parseCount(v.getAttribute('aria-label') || txt(v)) : null; })();
      const img = art.querySelector('[data-testid="tweetPhoto"] img, video');
      const handle = (new URL(url).pathname.match(/^\/([^/]+)\/status/) || [])[1] || '';
      items.push(register(art, {
        platform: 'x',
        title: txt(art.querySelector('[data-testid="tweetText"]')).replace(/\s+/g, ' ').slice(0, 400),
        url, author: handle,
        views,
        likes: grab(/([\d.,]+[KMB]?)\s+likes?/i) ?? fromBtn('like') ?? fromBtn('unlike'),
        comments: grab(/([\d.,]+[KMB]?)\s+repl(?:y|ies)/i) ?? fromBtn('reply'),
        shares: grab(/([\d.,]+[KMB]?)\s+(?:reposts?|retweets?)/i) ?? fromBtn('retweet'),
        bookmarks: grab(/([\d.,]+[KMB]?)\s+bookmarks?/i),
        ageHours: time ? hoursSince(time.getAttribute('datetime')) : null,
        postedAt: time ? time.getAttribute('datetime') : null,
        format: art.querySelector('video') ? 'video' : (art.querySelector('[data-testid="tweetPhoto"]') ? 'image' : 'text'),
        thumbnail: img && img.tagName === 'IMG' ? img.src : ''
      }));
    }
    return { items, context: {} };
  }

  // ---------- Reddit ----------
  function redditPostToItem(d) {
    return {
      platform: 'reddit', title: d.title, url: 'https://www.reddit.com' + d.permalink,
      author: 'r/' + d.subreddit + ' · u/' + d.author,
      score: d.score, likes: d.score, comments: d.num_comments,
      upvoteRatio: d.upvote_ratio,
      ageHours: hoursSince(d.created_utc * 1000), postedAt: new Date(d.created_utc * 1000).toISOString(),
      format: d.is_video ? 'video' : d.post_hint === 'image' ? 'image' : d.is_self ? 'text' : 'link',
      thumbnail: /^http/.test(d.thumbnail || '') ? d.thumbnail : '',
      followers: d.subreddit_subscribers
    };
  }

  async function scanReddit() {
    const items = [];
    // 1) DOM (new Reddit renders <shreddit-post> with all metrics as attributes)
    for (const p of document.querySelectorAll('shreddit-post')) {
      const created = p.getAttribute('created-timestamp');
      items.push(register(p, {
        platform: 'reddit', title: p.getAttribute('post-title') || '',
        url: abs(p.getAttribute('permalink') || p.getAttribute('content-href') || ''),
        author: (p.getAttribute('subreddit-prefixed-name') || '') + ' · u/' + (p.getAttribute('author') || ''),
        score: parseCount(p.getAttribute('score')), likes: parseCount(p.getAttribute('score')),
        comments: parseCount(p.getAttribute('comment-count')),
        ageHours: created ? hoursSince(created) : null, postedAt: created,
        format: p.getAttribute('post-type') || ''
      }));
    }
    if (items.length >= 5) return { items, context: {} };
    // 2) public JSON listing for the current URL
    try {
      const path = location.pathname.replace(/\/$/, '') || '/';
      const res = await fetch(location.origin + path + '.json' + (location.search ? location.search + '&' : '?') + 'limit=100', { credentials: 'include' });
      const json = await res.json();
      const listing = Array.isArray(json) ? json[0] : json;
      const kids = (listing && listing.data && listing.data.children) || [];
      const out = kids.filter((c) => c.kind === 't3').map((c) => register(null, redditPostToItem(c.data)));
      if (out.length) return { items: out, context: { followers: out[0].followers || null } };
    } catch (e) { /* fall through */ }
    return { items, context: {} };
  }

  // ---------- LinkedIn ----------
  function scanLinkedIn() {
    const items = [];
    for (const post of document.querySelectorAll('.feed-shared-update-v2, [data-urn^="urn:li:activity"], .profile-creator-shared-feed-update__container')) {
      const all = txt(post);
      const urn = post.getAttribute('data-urn') || (post.querySelector('[data-urn]') || {}).getAttribute?.('data-urn') || '';
      const reacts = txt(post.querySelector('.social-details-social-counts__reactions-count, [class*="reactions-count"]'));
      const comm = (all.match(/([\d.,]+[KMB]?)\s+comments?/i) || [])[1];
      const rep = (all.match(/([\d.,]+[KMB]?)\s+reposts?/i) || [])[1];
      const age = firstText(post, ['.update-components-actor__sub-description', '.feed-shared-actor__sub-description']);
      items.push(register(post, {
        platform: 'linkedin',
        title: txt(post.querySelector('.update-components-text, .feed-shared-text, .feed-shared-update-v2__description')).replace(/\s+/g, ' ').slice(0, 400),
        url: urn ? 'https://www.linkedin.com/feed/update/' + urn : location.href,
        author: firstText(post, ['.update-components-actor__name span[aria-hidden="true"]', '.update-components-actor__title span[aria-hidden="true"]', '.feed-shared-actor__name']),
        likes: reacts ? parseCount(reacts) : null,
        comments: comm ? parseCount(comm) : null,
        shares: rep ? parseCount(rep) : null,
        ageHours: parseAgeHours(age.replace(/•.*/, '') + ' ago'),
        format: post.querySelector('video') ? 'video' : post.querySelector('.update-components-document__container, iframe') ? 'carousel' : post.querySelector('img.update-components-image__image, .feed-shared-image') ? 'image' : 'text'
      }));
    }
    return { items: items.filter((i) => i.title || i.likes), context: {} };
  }

  // ---------- Facebook (pages, profiles, reels tab) ----------
  function parseFbTime(t) {
    if (!t) return null;
    const s = t.trim();
    let h = parseAgeHours(s);
    if (h == null) h = parseAgeHours(s + ' ago');
    if (h != null) return h;
    const m = s.match(/^([A-Z][a-z]+ \d{1,2})(?:, (\d{4}))?/);
    if (m) {
      const d = new Date(`${m[1]}, ${m[2] || new Date().getFullYear()}`);
      if (isFinite(d)) { if (d > new Date()) d.setFullYear(d.getFullYear() - 1); return hoursSince(d); }
    }
    return null;
  }

  function scanFacebook() {
    const items = [];
    const seen = new Set();
    const POST_LINK = /\/(posts|videos|reel|watch|photo|permalink)\b|story_fbid=|fbid=|\/share\/[pvr]\//;
    const cleanUrl = (u) => {
      try {
        const x = new URL(u, location.href);
        const keep = new URLSearchParams();
        for (const k of ['story_fbid', 'id', 'v', 'fbid']) if (x.searchParams.get(k)) keep.set(k, x.searchParams.get(k));
        return x.origin + x.pathname + (keep.toString() ? '?' + keep : '');
      } catch { return u; }
    };
    for (const art of document.querySelectorAll('[role="article"]')) {
      if (art.parentElement && art.parentElement.closest('[role="article"]')) continue; // nested = comments
      const links = [...art.querySelectorAll('a[href]')].filter((a) => POST_LINK.test(a.getAttribute('href')));
      if (!links.length) continue;
      const url = cleanUrl(links[0].getAttribute('href'));
      if (seen.has(url)) continue;
      seen.add(url);
      const all = txt(art);
      const grab = (re) => { const m = all.match(re); return m ? parseCount(m[1]) : null; };
      const reactEl = art.querySelector('[aria-label*="reaction" i]');
      const msgEl = art.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]');
      let caption = txt(msgEl);
      if (!caption) caption = [...art.querySelectorAll('div[dir="auto"]')].map(txt).filter((t) => t.length > 20 && t.length < 3000).sort((a, b) => b.length - a.length)[0] || '';
      const timeLink = links.find((a) => /^\s*(\d+\s*[smhdwy]|\d+\s*(min|hr|hour|day|week)s?|yesterday|[A-Z][a-z]+ \d{1,2})/i.test(txt(a) || a.getAttribute('aria-label') || ''));
      const img = [...art.querySelectorAll('img')].find((i) => (i.naturalWidth || i.width) > 120);
      items.push(register(art, {
        platform: 'facebook', title: caption.replace(/\s+/g, ' ').slice(0, 500), url,
        author: firstText(art, ['h2', 'h3', 'h4', 'strong']).split('\n')[0],
        likes: grab(/All reactions:?\s*([\d.,]+(?:\s?[KMB](?![a-z]))?)/i) ?? (reactEl ? parseCount(reactEl.getAttribute('aria-label')) : null),
        comments: grab(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+comments?/i),
        shares: grab(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+shares?/i),
        views: grab(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+(?:views|plays)/i),
        ageHours: timeLink ? parseFbTime(txt(timeLink) || timeLink.getAttribute('aria-label')) : null,
        format: art.querySelector('video') || /\/(reel|videos|watch)/.test(url) ? 'video' : img ? 'image' : 'text',
        thumbnail: img ? img.src : ''
      }));
    }
    // Reels tab: tiles with play counts
    for (const a of document.querySelectorAll('a[href*="/reel/"]')) {
      const url = cleanUrl(a.getAttribute('href'));
      if (seen.has(url)) continue;
      const n = (txt(a).match(/[\d.,]+\s*[KMB]?/i) || [])[0];
      if (!n) continue;
      seen.add(url);
      const img = a.querySelector('img');
      items.push(register(a, { platform: 'facebook', title: (img && img.alt) || '', url, views: parseCount(n), format: 'video', thumbnail: img ? img.src : '' }));
    }
    const main = txt(document.querySelector('[role="main"]')).slice(0, 3000);
    const f = (main.match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+followers/i) || [])[1] || (main.match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+likes\b/i) || [])[1];
    return { items, context: { followers: f ? parseCount(f) : null } };
  }

  // ---------- Any other page: competitor / market page snapshot ----------
  function scanWeb() {
    const meta = (n) => (document.querySelector(`meta[name="${n}"], meta[property="${n}"]`) || {}).content || '';
    const heads = [...document.querySelectorAll('h1, h2, h3')].map(txt).filter(Boolean).slice(0, 40);
    const words = txt(document.body).split(/\s+/).length;
    return {
      items: [],
      context: {},
      page: {
        title: document.title, url: location.href,
        description: meta('description') || meta('og:description'),
        headings: heads, wordCount: words,
        ctas: [...document.querySelectorAll('a, button')].map(txt).filter((t) => t && t.length < 40 && /buy|start|join|book|get|try|sign|subscribe|shop|download|claim|apply/i.test(t)).slice(0, 15),
        prices: [...new Set((txt(document.body).match(/[$€£₱]\s?\d[\d,.]*/g) || []))].slice(0, 15)
      }
    };
  }

  async function autoScroll(rounds) {
    for (let i = 0; i < rounds; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(1300);
    }
    window.scrollTo(0, 0);
    await sleep(300);
  }

  // =====================================================================
  // Deep competitor research helpers (driven step by step by the side panel)
  // =====================================================================
  async function waitFor(fn, timeout = 8000, every = 300) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(every); }
    return fn();
  }
  const meta = (p) => (document.querySelector(`meta[property="${p}"], meta[name="${p}"]`) || {}).content || '';

  function pageBlock(platform) {
    const body = txt(document.body).slice(0, 4000);
    if (platform === 'tiktok' && (document.querySelector('#captcha-verify-container, [class*="captcha"], .captcha_verify_container') || /verify to continue|drag the slider/i.test(body))) return 'captcha';
    if (platform === 'instagram' && (/\/accounts\/login|\/challenge\//.test(location.pathname) || (document.querySelector('input[name="username"]') && !document.querySelector('a[href*="/p/"], a[href*="/reel/"]')))) return 'login';
    if (platform === 'facebook' && (/\/login|checkpoint/.test(location.pathname) || (document.querySelector('input[name="email"]') && document.querySelector('input[name="pass"]') && !document.querySelector('[role="article"]')))) return 'login';
    if (/(page isn.t available|couldn.t find this account|this content isn.t available|user not found)/i.test(body)) return 'notfound';
    return null;
  }

  // Search-results page → list of accounts.
  window.__vlDiscover = async (platform, query) => {
    const out = new Map();
    const add = (handle, url, name, followers) => {
      if (!handle) return;
      const k = handle.toLowerCase();
      if (!out.has(k)) out.set(k, { platform, handle, url, name: (name || '').trim().slice(0, 80), followers: followers ?? null });
    };
    const block = pageBlock(platform);
    if (block === 'captcha' || block === 'login') return { ok: false, block, accounts: [] };
    try {
      if (platform === 'instagram') {
        for (const ep of [`/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(query)}&include_reel=true`, `/web/search/topsearch/?query=${encodeURIComponent(query)}`]) {
          try {
            const r = await fetch(ep, { credentials: 'include', headers: { 'x-ig-app-id': '936619743392459', 'x-requested-with': 'XMLHttpRequest' } });
            if (!r.ok) continue;
            const j = await r.json();
            for (const u of j.users || []) { const x = u.user || u; add(x.username, `https://www.instagram.com/${x.username}/`, x.full_name, x.follower_count ?? null); }
            if (out.size) break;
          } catch {}
        }
        if (!out.size) {
          await waitFor(() => document.querySelector('main a[href^="/"]'), 6000);
          const RESERVED = /^\/(explore|reels|p|reel|accounts|direct|stories|about|legal|developer|web|api|tags|locations)\//;
          for (const a of document.querySelectorAll('a[href^="/"]')) {
            const h = a.getAttribute('href');
            if (/^\/[\w.]+\/$/.test(h) && !RESERVED.test(h)) add(h.slice(1, -1), abs(h), txt(a).split('\n')[0]);
          }
        }
      } else if (platform === 'tiktok') {
        await waitFor(() => document.querySelector('[data-e2e="search-user-container"], [data-e2e="search_user-item-list"] a, a[href^="/@"]'), 10000);
        await sleep(1200);
        for (const a of document.querySelectorAll('a[href*="/@"]')) {
          const h = a.getAttribute('href');
          if (/\/video\/|\/photo\//.test(h)) continue;
          const m = h.match(/\/@([\w.]+)/); if (!m) continue;
          const card = a.closest('[data-e2e="search-user-container"], [class*="DivItemContainer"], li, div') || a;
          const fol = (txt(card).match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s*Followers/i) || [])[1];
          add(m[1], `https://www.tiktok.com/@${m[1]}`, firstText(card, ['[data-e2e="search-user-nickname"]', 'p', 'h3']) || txt(a), fol ? parseCount(fol) : null);
        }
      } else if (platform === 'facebook') {
        await waitFor(() => document.querySelector('[role="main"] a[role="link"], [role="feed"] a'), 10000);
        await sleep(1500);
        const RESERVED = /^(search|groups|watch|marketplace|events|gaming|help|policies|privacy|hashtag|pages|stories|reel|photo|photos|login|recover|notifications|messages|friends|bookmarks|settings|ads|business|legal|l\.php|sharer|dialog|share|people|profile\.php)$/i;
        for (const a of document.querySelectorAll('[role="main"] a[href]')) {
          let u; try { u = new URL(a.href); } catch { continue; }
          if (!/facebook\.com$/.test(u.hostname)) continue;
          const seg = u.pathname.split('/').filter(Boolean);
          let handle = null;
          if (seg[0] === 'profile.php' && u.searchParams.get('id')) handle = 'profile.php?id=' + u.searchParams.get('id');
          else if (seg.length === 1 && !RESERVED.test(seg[0])) handle = seg[0];
          else if (seg[0] === 'people' && seg[2]) handle = 'profile.php?id=' + seg[2];
          const name = txt(a).split('\n')[0];
          if (!handle || !name || name.length > 80) continue;
          const card = a.closest('[role="article"], [role="listitem"]') || a.parentElement;
          const fol = (txt(card).match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+(?:followers|likes|people like this)/i) || [])[1];
          add(handle, `https://www.facebook.com/${handle}`, name, fol ? parseCount(fol) : null);
        }
      }
    } catch (e) { return { ok: false, error: String(e.message || e), accounts: [...out.values()] }; }
    return { ok: true, accounts: [...out.values()].slice(0, 25) };
  };

  // Profile page → profile info + scroll through posts.
  window.__vlProfile = async (platform, opts = {}) => {
    const max = opts.max || 24;
    await waitFor(() => pageBlock(platform) || document.querySelector('a[href*="/reel/"], a[href*="/p/"], a[href*="/video/"], [data-e2e="user-post-item"], [role="article"]'), 12000);
    const block = pageBlock(platform);
    if (block) return { ok: false, block };
    const scanner = { instagram: scanInstagram, tiktok: scanTikTok, facebook: scanFacebook }[platform];
    let last = -1, stale = 0, res = scanner();
    for (let round = 0; round < 30 && res.items.length < max && stale < 3; round++) {
      window.scrollBy(0, Math.round(window.innerHeight * (1.6 + Math.random())));
      await sleep(1200 + Math.random() * 900);
      res = scanner();
      if (res.items.length === last) stale++; else stale = 0;
      last = res.items.length;
    }
    window.scrollTo(0, 0);
    const profile = { followers: res.context.followers || null, url: location.href };
    if (platform === 'instagram') {
      const d = meta('og:description') || meta('description');
      const m = d.match(/([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+Followers.*?([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+Posts/i);
      if (m) { profile.followers = profile.followers || parseCount(m[1]); profile.postsCount = parseCount(m[2]); }
      profile.name = (meta('og:title').match(/^(.*?)\s*\(/) || [])[1] || '';
      profile.bio = txt(document.querySelector('header section > div:last-child, header h1')).slice(0, 400);
    } else if (platform === 'tiktok') {
      profile.name = txt(document.querySelector('[data-e2e="user-subtitle"]')) || txt(document.querySelector('[data-e2e="user-title"]'));
      profile.bio = txt(document.querySelector('[data-e2e="user-bio"]')).slice(0, 400);
      profile.totalLikes = parseCount(txt(document.querySelector('[data-e2e="likes-count"]')));
      profile.link = txt(document.querySelector('[data-e2e="user-link"]'));
    } else if (platform === 'facebook') {
      profile.name = txt(document.querySelector('[role="main"] h1')) || document.title.replace(/\s*\|\s*Facebook$/, '');
      const intro = [...document.querySelectorAll('[role="main"] span[dir="auto"]')].map(txt).find((t) => t.length > 40 && t.length < 400);
      profile.bio = intro || '';
    }
    return { ok: true, profile, items: res.items.slice(0, max).map((i) => ({ ...i, id: undefined })) };
  };

  function parseIgHtml(html) {
    const out = {};
    const num = (re) => { const m = html.match(re); return m ? parseInt(m[1], 10) : null; };
    out.views = num(/"play_count":(\d+)/) ?? num(/"video_view_count":(\d+)/) ?? num(/"view_count":(\d+)/);
    out.likes = num(/"like_count":(\d+)/);
    out.comments = num(/"comment_count":(\d+)/);
    const taken = num(/"taken_at(?:_timestamp)?":(\d{9,})/);
    if (taken) out.postedAt = new Date(taken * 1000).toISOString();
    const dur = html.match(/"video_duration":([\d.]+)/);
    if (dur) out.durationSec = Math.round(parseFloat(dur[1]));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const og = (doc.querySelector('meta[property="og:description"]') || doc.querySelector('meta[name="description"]') || {}).content || '';
    // "1,234 likes, 56 comments - handle on March 3, 2024: "caption""
    const m = og.match(/^([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+likes?,\s*([\d.,]+(?:\s?[KMB](?![a-z]))?)\s+comments?\s*-\s*([\w.]+)\s+on\s+([^:]+):\s*["“]?([\s\S]*?)["”]?\.?\s*$/i);
    if (m) {
      out.likes = out.likes ?? parseCount(m[1]);
      out.comments = out.comments ?? parseCount(m[2]);
      if (!out.postedAt) { const d = new Date(m[4]); if (isFinite(d)) out.postedAt = d.toISOString(); }
      out.caption = m[5];
    } else if (og) out.caption = og;
    return out;
  }

  function parseTikTokJson(raw) {
    const j = JSON.parse(raw);
    const scope = j.__DEFAULT_SCOPE__ || {};
    const it = scope['webapp.video-detail'] && scope['webapp.video-detail'].itemInfo && scope['webapp.video-detail'].itemInfo.itemStruct;
    if (!it) return null;
    const s = it.statsV2 || it.stats || {};
    return {
      views: parseCount(s.playCount), likes: parseCount(s.diggCount), comments: parseCount(s.commentCount),
      shares: parseCount(s.shareCount), saves: parseCount(s.collectCount),
      caption: it.desc, postedAt: it.createTime ? new Date(it.createTime * 1000).toISOString() : null,
      durationSec: it.video && it.video.duration, sound: it.music ? `${it.music.title} – ${it.music.authorName}` : '',
      hashtags: (it.textExtra || []).map((t) => t.hashtagName).filter(Boolean)
    };
  }

  // Fast mode: read one post's stats without leaving the profile page.
  window.__vlPostDetail = async (platform, url) => {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return { ok: false, status: r.status };
      const html = await r.text();
      if (platform === 'instagram') {
        const d = parseIgHtml(html);
        return { ok: d.likes != null || d.views != null || !!d.caption, detail: d };
      }
      if (platform === 'tiktok') {
        const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        const d = m ? parseTikTokJson(m[1]) : null;
        return { ok: !!d, detail: d };
      }
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: false };
  };

  function cleanComment(t, owner) {
    return t.replace(/\n+/g, ' ').replace(/\b(Reply|See translation|View replies.*|Hide replies|\d+\s*(likes?|w|d|h|m|y)|Like|Liked by.*)\b/gi, ' ')
      .replace(new RegExp('^' + (owner || '\\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').replace(/\s+/g, ' ').trim();
  }

  // Deep mode: we're ON the post page – read stats and the top comments.
  window.__vlReadPost = async (platform, opts = {}) => {
    const maxComments = opts.maxComments || 15;
    const block = pageBlock(platform);
    if (block) return { ok: false, block };
    const detail = {};
    let comments = [];
    if (platform === 'tiktok') {
      const s = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      try { Object.assign(detail, (s && parseTikTokJson(s.textContent)) || {}); } catch {}
      if (detail.likes == null) {
        detail.likes = parseCount(txt(document.querySelector('[data-e2e="like-count"], [data-e2e="browse-like-count"]')));
        detail.comments = parseCount(txt(document.querySelector('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]')));
        detail.shares = parseCount(txt(document.querySelector('[data-e2e="share-count"]')));
        detail.caption = txt(document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'));
      }
      await waitFor(() => document.querySelector('[data-e2e="comment-level-1"]'), 7000);
      comments = [...document.querySelectorAll('[data-e2e="comment-level-1"]')].map((e) => {
        const box = e.closest('[class*="CommentItem"], [class*="DivCommentContentContainer"]') || e.parentElement;
        return { text: txt(e), likes: parseCount((txt(box).match(/\n(\d[\d.,]*[KMB]?)\s*$/) || [])[1]) };
      });
    } else if (platform === 'instagram') {
      Object.assign(detail, parseIgHtml(document.documentElement.outerHTML));
      const t = document.querySelector('time[datetime]');
      if (!detail.postedAt && t) detail.postedAt = t.getAttribute('datetime');
      if (!detail.caption) detail.caption = txt(document.querySelector('h1'));
      await waitFor(() => document.querySelectorAll('main ul li, article ul li').length > 1, 6000);
      const owner = (location.pathname.match(/^\/([\w.]+)\/(?:p|reel)\//) || [])[1] || '';
      const seen = new Set();
      for (const a of document.querySelectorAll('main a[href^="/"], article a[href^="/"]')) {
        const h = a.getAttribute('href');
        if (!/^\/[\w.]+\/$/.test(h)) continue;
        const user = h.slice(1, -1);
        const box = a.closest('li') || a.parentElement && a.parentElement.parentElement && a.parentElement.parentElement.parentElement;
        if (!box) continue;
        const span = [...box.querySelectorAll('span[dir="auto"], div[dir="auto"]')].map(txt).filter((x) => x && x !== user && x.length > 1).sort((a, b) => b.length - a.length)[0];
        if (!span || seen.has(span) || span === detail.caption || (detail.caption && detail.caption.startsWith(span))) continue;
        seen.add(span);
        comments.push({ text: cleanComment(span, user), user });
      }
    }
    comments = comments.filter((c) => c.text && c.text.length > 1).slice(0, maxComments);
    return { ok: true, detail, comments };
  };

  window.__vlBlock = (platform) => pageBlock(platform);

  window.__vlScrollBy = async (n = 3) => { for (let i = 0; i < n; i++) { window.scrollBy(0, window.innerHeight); await sleep(900); } return true; };

  window.__vlScan = async (opts = {}) => {
    try {
      const platform = opts.platform || detectPlatform(location.hostname);
      if (opts.scroll) await autoScroll(opts.scroll);
      elById.clear();
      const scanners = { youtube: scanYouTube, tiktok: scanTikTok, instagram: scanInstagram, x: scanX, reddit: scanReddit, linkedin: scanLinkedIn, facebook: scanFacebook, web: scanWeb };
      const res = await scanners[platform]();
      return {
        ok: true, platform, url: location.href, pageTitle: document.title,
        scannedAt: new Date().toISOString(),
        items: res.items.filter((i) => i.url),
        context: res.context || {}, page: res.page || null
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  };

  // Draw score badges on the page next to each scanned post.
  window.__vlHighlight = (labels) => {
    document.querySelectorAll('.__vl-badge').forEach((b) => b.remove());
    for (const [id, l] of Object.entries(labels || {})) {
      const el = elById.get(id);
      if (!el) continue;
      const b = document.createElement('div');
      b.className = '__vl-badge';
      b.textContent = l.text;
      b.title = 'Viral Lens: ' + l.tip;
      Object.assign(b.style, {
        position: 'absolute', top: '6px', left: '6px', zIndex: 2147483000,
        background: l.color, color: '#fff', font: '600 12px/1.2 system-ui, sans-serif',
        padding: '3px 7px', borderRadius: '999px', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.35)', pointerEvents: 'none'
      });
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(b);
    }
    return true;
  };

  window.__vlScrollTo = (id) => {
    const el = elById.get(id);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '3px solid #f97316'; setTimeout(() => (el.style.outline = ''), 2000); }
    return !!el;
  };

  // exported for tests
  window.__vlParse = { parseCount, parseAgeHours };
})();
