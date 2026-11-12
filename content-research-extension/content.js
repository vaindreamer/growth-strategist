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
    const m = s.match(/(\d[\d,.\s]*)\s*([kmbt])?(?![a-z])/i);
    if (!m) return null;
    let num = m[1].replace(/\s/g, '');
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
      const vm = all.match(/([\d.,]+\s*[KMB]?)\s*views/i);
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
    const subs = (txt(document.querySelector('#page-header, ytd-c4-tabbed-header-renderer, yt-page-header-view-model')).match(/([\d.,]+\s*[KMB]?)\s*subscribers/i) || [])[1];
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
    const f = (header.match(/([\d.,]+\s*[KMB]?)\s*followers/i) || [])[1];
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

  window.__vlScan = async (opts = {}) => {
    try {
      const platform = opts.platform || detectPlatform(location.hostname);
      if (opts.scroll) await autoScroll(opts.scroll);
      elById.clear();
      const scanners = { youtube: scanYouTube, tiktok: scanTikTok, instagram: scanInstagram, x: scanX, reddit: scanReddit, linkedin: scanLinkedIn, web: scanWeb };
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
