// Viral Lens – optional AI analysis through the Claude API (Messages endpoint).
// Uses the user's own API key, stored only in chrome.storage.local on this computer.
// Plain fetch is used because a no-build Chrome extension can't bundle the npm SDK.
import { fmt, pct } from './analyze.js';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best quality)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' }
];

const SYSTEM = `You are a senior content strategist and market researcher for social media creators and small businesses.
You analyse real performance data scraped from social platforms and explain, concretely, why certain posts outperform.
Rules:
- Base every claim on the data provided; when you infer, say so.
- "Outlier" means the post's reach divided by the creator's (or page's) typical post. 3x+ is strong, 10x+ is exceptional.
- When suggesting content to replicate, never tell the user to copy someone's post. Extract the underlying format, hook structure and idea, then adapt it originally to the user's brand, offer and audience.
- Be specific and practical: write actual hooks, outlines and CTAs, not generic advice.
- Format the answer in Markdown with short sections, headings and bullet lists.`;

function brandBlock(s) {
  return `About me / my brand:
- Niche: ${s.niche || '(not set)'}
- Target audience: ${s.audience || '(not set)'}
- Offer / what I sell: ${s.offer || '(not set)'}
- Brand voice: ${s.voice || '(not set)'}
- Platforms I post on: ${s.platforms || '(not set)'}`;
}

function itemLine(i, n) {
  return `${n}. [${i.platform}${i.format ? '/' + i.format : ''}] "${(i.title || '(no caption)').slice(0, 220)}" — by ${i.author || '?'} | reach ${fmt(i.reach)}${i.views != null ? ' views' : ''}` +
    `${i.likes != null ? ` | likes ${fmt(i.likes)}` : ''}${i.comments != null ? ` | comments ${fmt(i.comments)}` : ''}${i.shares != null ? ` | shares ${fmt(i.shares)}` : ''}` +
    ` | outlier ${i.outlier ? i.outlier.toFixed(1) + 'x' : '–'} | ${i.velocity ? fmt(i.velocity) + '/hr' : ''} | engagement ${pct(i.engagement)} | age ${i.ageHours ? Math.round(i.ageHours) + 'h' : '?'}`;
}

export function buildMarketPrompt(items, research, settings, sourceLabel) {
  const top = [...items].sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0)).slice(0, 40);
  const pat = research && research.enough
    ? `Pattern stats computed locally (lift = median outlier with pattern ÷ without):
${research.patterns.slice(0, 8).map((p) => `- ${p.label}: lift ${p.lift.toFixed(2)}x, used in ${Math.round(p.share * 100)}% of posts`).join('\n')}
Top keywords among the best posts: ${research.keywords.slice(0, 12).map((k) => k.word).join(', ')}
Formats by median outlier: ${research.formats.map((f) => `${f.format} ${f.medianOutlier?.toFixed(1)}x (n=${f.n})`).join(', ')}`
    : '';
  return `${brandBlock(settings)}

Source: ${sourceLabel}
Here are the ${top.length} posts I collected, sorted by viral score:
${top.map((i, n) => itemLine(i, n + 1)).join('\n')}

${pat}

Write a market-research brief with these sections:
1. **What's working right now** – the 3–5 themes, hook styles and formats driving the outliers (cite post numbers).
2. **Why the top 5 outliers popped** – one tight paragraph each: hook, emotion, format, timing, audience fit.
3. **Audience insight** – what this tells me about what the audience wants, fears and aspires to.
4. **Gaps & opportunities** – angles nobody here is covering well that fit my brand.
5. **10 content ideas for me** – a table with: Title/hook | Format & platform | Why it should work (reference the pattern) | 3-beat outline | CTA tied to my offer.
6. **Avoid** – patterns that look saturated or under-perform.
Keep it practical and specific to my niche.`;
}

export function buildRemixPrompt(item, settings) {
  return `${brandBlock(settings)}

This post is performing very well:
${itemLine(item, 1)}
URL: ${item.url}

1. Break down why it works: hook (first 1–3 seconds / first line), structure, emotional trigger, format, and who it's for.
2. Give me the reusable template behind it (fill-in-the-blank).
3. Write 5 original remixes for MY brand — each with: hook line, format, a short script or outline (5–8 beats), on-screen text / caption, and CTA. Vary the angles (story, how-to, myth-bust, results/proof, contrarian).
4. One "do not copy" note: what would make my version feel like a rip-off, and how to avoid it.`;
}

export function buildPagePrompt(page, settings) {
  return `${brandBlock(settings)}

I'm researching this competitor / market page:
Title: ${page.title}
URL: ${page.url}
Meta description: ${page.description}
Headings: ${page.headings.join(' | ')}
CTAs: ${page.ctas.join(' | ')}
Prices spotted: ${page.prices.join(', ') || 'none'}
Word count: ${page.wordCount}

Give me: their positioning and promise, target customer, offer structure, messaging angles and proof they use, weaknesses/gaps I can exploit, and 8 content ideas I could make that position my brand against this.`;
}

export async function askClaude({ apiKey, model, prompt, signal }) {
  if (!apiKey) throw new Error('Add your Claude API key in Settings to use AI analysis.');
  const m = model || 'claude-opus-5-5';
  const body = {
    model: m,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: prompt }]
  };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2026-10-21',
    // Required for calling the API from a browser/extension context (CORS opt-in).
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  // Server-side refusal fallback (supported on Opus 5.5 / Sonnet 5.5).
  if (m !== 'claude-haiku-5-5') {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.statusText;
    if (res.status === 401) throw new Error('Invalid API key (401). Check it in Settings.');
    if (res.status === 429) throw new Error('Rate limited (429). Wait a minute and try again.');
    if (res.status === 529 || res.status >= 500) throw new Error(`Claude is busy (${res.status}). Try again shortly.`);
    throw new Error(`API error ${res.status}: ${msg}`);
  }
  if (data.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing your brand details.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new Error('Empty response from Claude.');
  return text + (data.stop_reason === 'max_tokens' ? '\n\n_(Response was cut off at the length limit.)_' : '');
}

// Minimal, safe Markdown → HTML (escapes everything first).
export function md(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = src.replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const flushP = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flushP(); closeList();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      html += '<div class="tablewrap"><table><thead><tr>' + cells(line).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { html += '<tr>' + cells(lines[i]).map((c) => `<td>${c}</td>`).join('') + '</tr>'; i++; }
      i--; html += '</tbody></table></div>';
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flushP(); closeList(); const lv = Math.min(m[1].length + 2, 6); html += `<h${lv}>${inline(m[2])}</h${lv}>`; }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushP(); closeList(); html += '<hr>'; }
    else if (!line.trim()) { flushP(); closeList(); }
    else { closeList(); para.push(line.trim()); }
  }
  flushP(); closeList();
  return html;
}
