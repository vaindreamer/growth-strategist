// Viral Lens – scoring and market-research engine (pure functions, no DOM).

export const median = (arr) => {
  const a = arr.filter((n) => typeof n === 'number' && isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function percentileRanker(values) {
  const sorted = values.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
  return (v) => {
    if (v == null || !sorted.length) return null;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
    return sorted.length === 1 ? 0.5 : (lo - 1) / (sorted.length - 1);
  };
}

/** The main "reach" number for an item: views when we have them, else score/likes. */
export function reachOf(item) {
  if (item.views != null) return item.views;
  if (item.score != null) return item.score;
  if (item.likes != null) return item.likes;
  return null;
}

export function reachLabel(item) {
  if (item.views != null) return 'views';
  if (item.score != null) return 'upvotes';
  if (item.likes != null) return 'likes';
  return '';
}

export const TIERS = [
  { min: 70, key: 'viral', label: 'Viral', emoji: '🔥', color: '#dc2626' },
  { min: 45, key: 'outlier', label: 'Outlier', emoji: '🚀', color: '#ea580c' },
  { min: 25, key: 'above', label: 'Above avg', emoji: '📈', color: '#2563eb' },
  { min: -1, key: 'normal', label: 'Normal', emoji: '•', color: '#6b7280' }
];

/**
 * Score a list of items scanned from one page.
 *  - outlier:   reach ÷ median reach of the same creator (if ≥3 of their posts are in the scan)
 *               otherwise ÷ median of the whole page. "5x" = 5 times a typical post.
 *  - velocity:  reach per hour since posting.
 *  - engagement: (likes + comments + shares) ÷ views.
 *  - viralScore: 0-100 blend (60 pts outlier, 25 pts velocity rank, 15 pts engagement rank).
 */
export function scoreItems(items, context = {}) {
  const list = items.map((i) => ({ ...i, reach: reachOf(i) }));
  // Baseline = median of comparable posts: same creator + same format (Shorts vs long-form
  // views aren't comparable), falling back to creator, then page + format, then the whole page.
  const groups = {};
  const add = (k, v) => (groups[k] ||= []).push(v);
  for (const i of list) {
    if (i.reach == null) continue;
    add('page', i.reach);
    if (i.format) add('f|' + i.format, i.reach);
    if (i.author) { add('a|' + i.author, i.reach); if (i.format) add('af|' + i.author + '|' + i.format, i.reach); }
  }
  const baseFor = (i) => {
    for (const k of ['af|' + i.author + '|' + i.format, 'a|' + i.author, 'f|' + i.format]) if (groups[k] && groups[k].length >= 3) return median(groups[k]);
    return median(groups.page || []);
  };

  for (const i of list) {
    const base = baseFor(i);
    i.baseline = base;
    i.outlier = i.reach != null && base ? i.reach / base : null;
    i.velocity = i.reach != null && i.ageHours != null ? i.reach / Math.max(i.ageHours, 1) : null;
    const known = i.likes != null || i.comments != null || i.shares != null;
    const inter = (i.likes || 0) + (i.comments || 0) + (i.shares || 0);
    i.engagement = i.views && known ? inter / i.views : null;
    if (i.platform === 'reddit' && i.score) i.engagement = (i.comments || 0) / Math.max(i.score, 1); // discussion ratio
    const followers = context.followers || i.followers;
    i.followerRatio = followers && i.reach != null ? i.reach / followers : null;
  }

  const velRank = percentileRanker(list.map((i) => i.velocity));
  const engRank = percentileRanker(list.map((i) => i.engagement));
  for (const i of list) {
    const outPts = i.outlier ? clamp((Math.log10(i.outlier) / Math.log10(10)) * 60, 0, 60) : 0;
    const vr = velRank(i.velocity), er = engRank(i.engagement);
    let score = outPts + (vr == null ? 0 : vr * 25) + (er == null ? 0 : er * 15);
    if (vr == null) score *= 1.2; // rescale when a signal is missing
    if (er == null) score *= 1.12;
    if (i.followerRatio != null && i.followerRatio > 1) score += Math.min(10, i.followerRatio * 2); // broke out of its audience
    i.viralScore = Math.round(clamp(score, 0, 100));
    i.tier = TIERS.find((t) => i.viralScore >= t.min).key;
  }
  return list;
}

export const tierOf = (key) => TIERS.find((t) => t.key === key) || TIERS[TIERS.length - 1];

export function summarize(items) {
  const reach = items.map((i) => i.reach).filter((n) => n != null);
  const eng = items.map((i) => i.engagement).filter((n) => n != null);
  const top = [...items].sort((a, b) => (b.outlier || 0) - (a.outlier || 0))[0];
  return {
    count: items.length,
    withMetrics: reach.length,
    medianReach: median(reach),
    maxReach: reach.length ? Math.max(...reach) : null,
    avgEngagement: eng.length ? eng.reduce((a, b) => a + b, 0) / eng.length : null,
    topOutlier: top && top.outlier ? top.outlier : null,
    viral: items.filter((i) => i.tier === 'viral').length,
    outliers: items.filter((i) => i.tier === 'outlier').length
  };
}

// ---------- formatting ----------
export function fmt(n) {
  if (n == null || !isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n * 10) / 10);
}
export const pct = (n) => (n == null ? '–' : (n * 100).toFixed(n < 0.1 ? 1 : 0) + '%');
export function ageLabel(h) {
  if (h == null) return '';
  if (h < 1) return Math.round(h * 60) + 'm ago';
  if (h < 48) return Math.round(h) + 'h ago';
  if (h < 24 * 60) return Math.round(h / 24) + 'd ago';
  if (h < 24 * 730) return Math.round(h / 730) + 'mo ago';
  return Math.round(h / 8760) + 'y ago';
}

// ---------- title / hook pattern analysis ----------
const STOP = new Set(('a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those ' +
  'i me my we our you your he she they them his her their what which who whom how why when where do does did done can could should would will ' +
  'just not no yes all any some more most very too up down out over under again into about than also get got one two new vs via amp de la el en y que ' +
  'im ive dont cant wont youre thats whats heres there here have has had like doing make makes made going really much many every way').split(' '));

// Words that belong to the hook, not the topic – kept when building templates.
const HOOK_WORDS = new Set(('stop never mistakes mistake worst avoid wrong ruin ruining killing kill bad lies lie myth myths secret secrets nobody ' +
  'truth actually hidden real reason why happens tried try challenge experiment tested before after transformation results result lost gained ' +
  'best easiest fastest ultimate perfect only most things ways tips reasons signs habits steps rules lessons tools need know should ' +
  'pov day days week weeks month months year years minutes min hours beginner beginners guide tutorial how').split(' '));

/** Topic words of a title: content words that aren't part of the hook formula. */
export function topicWords(title, max = 2) {
  return tokenize(title).filter((w) => !HOOK_WORDS.has(w)).slice(0, max);
}

export const PATTERNS = [
  { key: 'number', label: 'Uses a number', test: (t) => /\d/.test(t) },
  { key: 'question', label: 'Asks a question', test: (t) => /\?/.test(t) },
  { key: 'howto', label: '"How to / how I"', test: (t) => /\bhow (to|i|we|you)\b/i.test(t) },
  { key: 'firstPerson', label: 'Personal story (I / my)', test: (t) => /\b(i|i'm|i've|my|me)\b/i.test(t) },
  { key: 'you', label: 'Talks to "you"', test: (t) => /\byou(r|'re)?\b/i.test(t) },
  { key: 'negative', label: 'Warning / mistake / stop', test: (t) => /\b(stop|never|don'?t|mistakes?|worst|avoid|wrong|ruin|killing|bad|lies?|myth)\b/i.test(t) },
  { key: 'curiosity', label: 'Curiosity gap (secret, nobody, this, why)', test: (t) => /\b(secret|nobody|no one|this is why|why|truth|actually|hidden|real reason|what happens)\b/i.test(t) },
  { key: 'challenge', label: 'Challenge / experiment ("I tried", "for 30 days")', test: (t) => /\b(i tried|tried|for \d+ (days|weeks|months)|challenge|experiment|tested)\b/i.test(t) },
  { key: 'transformation', label: 'Before → after / results', test: (t) => /\b(before|after|transformation|results?|lost|gained|went from|from .* to)\b/i.test(t) },
  { key: 'list', label: 'Listicle ("5 things", "top 10")', test: (t) => /\b(\d+|top \d+)\s+(things|ways|tips|mistakes|reasons|signs|habits|exercises|foods|steps|rules|secrets|lessons|tools)\b/i.test(t) },
  { key: 'time', label: 'Time frame / speed ("in 10 minutes")', test: (t) => /\b(in|under|only)\s+\d+\s*(sec|second|min|minute|hour|day|week)s?\b|\b\d+[- ]?(min|minute|day|week)\b/i.test(t) },
  { key: 'superlative', label: 'Superlative (best, easiest, #1)', test: (t) => /\b(best|easiest|fastest|ultimate|perfect|#1|only|most)\b/i.test(t) },
  { key: 'emoji', label: 'Uses emoji', test: (t) => /\p{Extended_Pictographic}/u.test(t) },
  { key: 'caps', label: 'CAPS word for emphasis', test: (t) => /\b[A-Z]{3,}\b/.test(t) && !/^[^a-z]*$/.test(t) },
  { key: 'brackets', label: '(Brackets) / [tags]', test: (t) => /[([]/.test(t) },
  { key: 'short', label: 'Short hook (≤ 6 words)', test: (t) => t.trim().split(/\s+/).length <= 6 }
];

export function tokenize(text) {
  return (text || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[#@]/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/**
 * Market research over a set of scored items. Compares the top quartile (by outlier
 * score) against everything else to find which hooks, words and formats over-perform.
 */
export function research(items) {
  const scored = items.filter((i) => i.outlier != null && (i.title || '').trim());
  if (scored.length < 4) return { enough: false, n: scored.length };
  const sorted = [...scored].sort((a, b) => b.outlier - a.outlier);
  const cut = Math.max(1, Math.round(sorted.length * 0.25));
  const top = sorted.slice(0, cut), rest = sorted.slice(cut);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const patterns = PATTERNS.map((p) => {
    const withP = scored.filter((i) => p.test(i.title));
    const without = scored.filter((i) => !p.test(i.title));
    const mWith = median(withP.map((i) => i.outlier)), mWithout = median(without.map((i) => i.outlier));
    return {
      key: p.key, label: p.label,
      share: withP.length / scored.length,
      topShare: top.filter((i) => p.test(i.title)).length / top.length,
      lift: mWith && mWithout ? mWith / mWithout : null,
      n: withP.length
    };
  }).filter((p) => p.n >= 2 && p.lift != null).sort((a, b) => b.lift - a.lift);

  const df = (arr) => { const c = {}; for (const i of arr) for (const w of new Set(tokenize(i.title))) c[w] = (c[w] || 0) + 1; return c; };
  const bigr = (arr) => { const c = {}; for (const i of arr) { const t = tokenize(i.title); const s = new Set(); for (let k = 0; k < t.length - 1; k++) s.add(t[k] + ' ' + t[k + 1]); for (const b of s) c[b] = (c[b] || 0) + 1; } return c; };
  const kw = (topC, restC) => Object.entries(topC).map(([w, n]) => ({
    word: w, top: n, rest: restC[w] || 0,
    lift: (n / top.length + 0.01) / (((restC[w] || 0) / Math.max(rest.length, 1)) + 0.01)
  })).filter((k) => k.top >= 2 || (top.length < 6 && k.top >= 1)).sort((a, b) => b.lift - a.lift || b.top - a.top);

  const keywords = kw(df(top), df(rest)).slice(0, 15);
  const phrases = kw(bigr(top), bigr(rest)).filter((k) => k.top >= 2).slice(0, 10);
  const allWords = Object.entries(df(scored)).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, n]) => ({ word, n }));

  // formats
  const fmts = {};
  for (const i of scored) { const f = i.format || 'unknown'; (fmts[f] ||= []).push(i.outlier); }
  const formats = Object.entries(fmts).map(([format, v]) => ({ format, n: v.length, medianOutlier: median(v) })).sort((a, b) => b.medianOutlier - a.medianOutlier);

  // title length
  const lenBucket = (t) => { const w = t.trim().split(/\s+/).length; return w <= 6 ? '≤6 words' : w <= 12 ? '7–12 words' : w <= 20 ? '13–20 words' : '20+ words'; };
  const lens = {};
  for (const i of scored) (lens[lenBucket(i.title)] ||= []).push(i.outlier);
  const lengths = Object.entries(lens).map(([bucket, v]) => ({ bucket, n: v.length, medianOutlier: median(v) })).sort((a, b) => b.medianOutlier - a.medianOutlier);

  // posting day/hour (only items with an exact timestamp)
  const timed = scored.filter((i) => i.postedAt);
  let bestDays = [], bestHours = [];
  if (timed.length >= 8) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = {}, h = {};
    for (const i of timed) { const dt = new Date(i.postedAt); (d[days[dt.getDay()]] ||= []).push(i.outlier); const hb = Math.floor(dt.getHours() / 3) * 3; (h[hb] ||= []).push(i.outlier); }
    bestDays = Object.entries(d).filter(([, v]) => v.length >= 2).map(([day, v]) => ({ day, n: v.length, medianOutlier: median(v) })).sort((a, b) => b.medianOutlier - a.medianOutlier).slice(0, 3);
    bestHours = Object.entries(h).filter(([, v]) => v.length >= 2).map(([hr, v]) => ({ window: `${String(hr).padStart(2, '0')}:00–${String(+hr + 3).padStart(2, '0')}:00`, n: v.length, medianOutlier: median(v) })).sort((a, b) => b.medianOutlier - a.medianOutlier).slice(0, 3);
  }

  // creators who over-index
  const auth = {};
  for (const i of scored) if (i.author) (auth[i.platform + '\u0000' + i.author] ||= []).push(i);
  const creators = Object.entries(auth).map(([k, v]) => ({ author: k.split('\u0000')[1], platform: k.split('\u0000')[0], n: v.length, hits: v.filter((i) => i.outlier >= 2).length, best: Math.max(...v.map((i) => i.outlier)) }))
    .sort((a, b) => b.hits - a.hits || b.best - a.best).slice(0, 8);

  return {
    enough: true, n: scored.length, topN: top.length,
    medianTopOutlier: median(top.map((i) => i.outlier)),
    avgTopEngagement: avg(top.map((i) => i.engagement).filter((n) => n != null)),
    avgRestEngagement: avg(rest.map((i) => i.engagement).filter((n) => n != null)),
    patterns, keywords, phrases, allWords, formats, lengths, bestDays, bestHours, creators,
    topTitles: top.slice(0, 10).map((i) => ({ title: i.title, outlier: i.outlier, url: i.url, platform: i.platform }))
  };
}

// ---------- local (no-AI) remix ideas ----------
/** Turn a winning title into a reusable fill-in-the-blank hook template. */
export function toTemplate(title, topics = topicWords(title)) {
  let t = (title || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\p{Extended_Pictographic}/gu, '').replace(/#\w+/g, '').trim();
  t = t.replace(/\b\d+(?:[.,]\d+)?(?:\s*(k|lbs?|kg|pounds|x)\b|(%))?/gi, (m, u, p) => (u || p ? '[N' + (u || p).toUpperCase().replace('LBS', ' LBS').replace('KG', ' KG') + ']' : '[N]'));
  t = t.replace(/\$\s?\[N\]/g, '[$N]');
  for (const w of topics) {
    if (!w || w.length < 3) continue;
    t = t.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '[TOPIC]');
  }
  t = t.replace(/(\[TOPIC\]\s*)+/g, '[TOPIC] ').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? t.slice(0, 137) + '…' : t;
}

export function detectHooks(title) {
  return PATTERNS.filter((p) => p.test(title || '') && p.key !== 'short' && p.key !== 'emoji').map((p) => p.label);
}

/** Five quick remix angles for one post, adapted to the user's niche (no AI needed). */
export function remixIdeas(item, settings = {}) {
  const niche = (settings.niche || 'your niche').trim();
  const audience = (settings.audience || 'your audience').trim();
  const words = topicWords(item.title, 2);
  const template = toTemplate(item.title, words);
  const hooks = detectHooks(item.title);
  const fmtName = { short: 'short-form vertical video', video: 'long-form video', carousel: 'carousel', image: 'image post', text: 'text post', post: 'post', link: 'post' }[item.format] || 'post';
  return {
    template,
    hooks,
    ideas: [
      template.includes('[TOPIC]') ? `Same hook, your topic: "${template}" — swap [TOPIC] for a subject from ${niche}` : `Same hook structure, applied to ${niche}: "${template}"`,
      `Your take / reaction: what ${audience} get wrong about the idea in "${(item.title || '').slice(0, 70)}"`,
      `Personal-proof version: you (or a client) try it and share real results, in a ${fmtName}`,
      `Myth-buster flip: "Stop doing ${words[0] || 'this'} — do this instead" for ${audience}`,
      `Beginner breakdown: a step-by-step ${fmtName === 'carousel' ? 'carousel' : 'carousel or short'} teaching the core idea in 3–5 steps`
    ]
  };
}

// ---------- export ----------
export function toCSV(rows) {
  const cols = ['platform', 'title', 'author', 'url', 'reach', 'views', 'likes', 'comments', 'shares', 'outlier', 'velocity', 'engagement', 'viralScore', 'tier', 'ageHours', 'format', 'tags', 'notes', 'savedAt'];
  const esc = (v) => { if (v == null) return ''; const s = Array.isArray(v) ? v.join('|') : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
