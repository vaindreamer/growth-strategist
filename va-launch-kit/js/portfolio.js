/* Step 3: Generates a standalone one-page portfolio website. */
(function () {
  const { state, gen, esc, lines, safeUrl } = App;
  const frame = document.getElementById('portfolioFrame');
  const themeSel = document.getElementById('portfolioTheme');
  const booking = document.getElementById('bookingUrl');

  const THEMES = {
    blush: { bg: '#fdf7f4', ink: '#2e1f2a', muted: '#6f5d68', accent: '#8a3f6b', accent2: '#f3d6cf', card: '#ffffff' },
    sage: { bg: '#f6f5ef', ink: '#1f2a24', muted: '#5d6a62', accent: '#4f7a5f', accent2: '#dbe7d6', card: '#ffffff' },
    ocean: { bg: '#f4f8fb', ink: '#14263a', muted: '#566779', accent: '#1f6f9a', accent2: '#f2e4cf', card: '#ffffff' },
    midnight: { bg: '#141824', ink: '#f3efe6', muted: '#b4b0a6', accent: '#d9a441', accent2: '#2a3145', card: '#1c2232' }
  };

  const BLURB = {
    'Inbox Management': 'Sorted, labeled and answered email so you only see what needs you.',
    'Calendar & Scheduling': 'Meetings booked, reminders sent and no double-bookings.',
    'Data Entry': 'Accurate, organized spreadsheets and CRM records.',
    'Customer Support': 'Friendly, fast replies that keep your customers happy.',
    'Social Media Management': 'Consistent posting and engagement that grows your audience.',
    'Canva Graphic Design': 'On-brand graphics, carousels and templates.',
    'Content Scheduling': 'A full content calendar, scheduled ahead of time.',
    'Lead Generation': 'Researched, verified lead lists ready for outreach.',
    'Online Research': 'Clear summaries so you can decide faster.',
    'Bookkeeping Support': 'Invoices, receipts and expenses tracked and tidy.',
    'E-commerce / Shopify Support': 'Product listings, orders and customer messages handled.',
    'Email Marketing': 'Newsletters written, designed and scheduled.',
    'Travel & Event Planning': 'Itineraries and events planned down to the details.',
    'Transcription': 'Accurate transcripts, meeting notes and summaries.',
    'Project Management': 'Tasks, deadlines and SOPs that keep your team moving.',
    'Podcast / YouTube Support': 'Uploads, show notes and thumbnails handled each week.'
  };

  themeSel.value = state.ui.portfolioTheme;
  booking.value = state.ui.bookingUrl;
  themeSel.addEventListener('change', () => { state.ui.portfolioTheme = themeSel.value; App.changed(); });
  booking.addEventListener('input', () => { state.ui.bookingUrl = booking.value; App.changed(); });

  const slug = () => (state.fullName || 'your-name').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-va';

  function build() {
    const t = THEMES[state.ui.portfolioTheme] || THEMES.blush;
    const name = esc(state.fullName || 'Your Name');
    const initials = esc((state.fullName || 'Y N').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase());
    const photo = safeUrl(state.photoUrl);
    const book = safeUrl(state.ui.bookingUrl);
    const mail = state.email ? `mailto:${encodeURIComponent(state.email)}?subject=${encodeURIComponent('Virtual Assistant inquiry')}` : '#contact';
    const cta = book || mail;
    const services = state.services.length ? state.services : ['Inbox Management', 'Calendar & Scheduling', 'Data Entry'];
    const projects = state.projects.filter(p => p.title);
    const exp = state.experience.filter(e => e.role);
    const why = gen.translatorSkills().slice(0, 4);
    if (why.length < 3) why.push('Clear updates at the end of every working day', 'Quick replies during my working hours', 'Your data and passwords kept private and secure');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} | ${esc(gen.headline())}</title>
<meta name="description" content="${esc(gen.summary())}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:${t.bg};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--accent2:${t.accent2};--card:${t.card}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.65}
h1,h2,h3{font-family:'Playfair Display',Georgia,serif;line-height:1.2;margin:0 0 .5em}
a{color:var(--accent)}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
nav{display:flex;justify-content:space-between;align-items:center;padding:20px 0}
nav b{font-family:'Playfair Display',serif;font-size:1.2rem}
nav .links a{margin-left:20px;text-decoration:none;color:var(--ink);font-size:.95rem}
.btn{display:inline-block;background:var(--accent);color:var(--bg);padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:600}
.btn.alt{background:transparent;color:var(--accent);border:2px solid var(--accent)}
.hero{display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:center;padding:56px 0 72px}
.hero h1{font-size:clamp(2.2rem,5vw,3.4rem)}
.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.8rem;color:var(--accent);font-weight:600}
.hero p.lead{font-size:1.15rem;color:var(--muted);max-width:34em}
.hero .ctas{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.avatar{aspect-ratio:1;border-radius:50% 50% 46% 54%/55% 45% 55% 45%;background:var(--accent2);display:grid;place-items:center;overflow:hidden;font-family:'Playfair Display',serif;font-size:5rem;color:var(--accent);box-shadow:0 30px 60px -30px rgba(0,0,0,.35)}
.avatar img{width:100%;height:100%;object-fit:cover}
section{padding:64px 0}
section.tint{background:var(--accent2)}
.head{text-align:center;max-width:620px;margin:0 auto 40px}
.head p{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}
.card{background:var(--card);border-radius:18px;padding:26px;box-shadow:0 10px 30px -18px rgba(0,0,0,.25)}
.card h3{font-size:1.15rem}.card p{color:var(--muted);margin:0}
.icon{width:42px;height:42px;border-radius:12px;background:var(--accent2);color:var(--accent);display:grid;place-items:center;font-weight:700;margin-bottom:14px}
.tools{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.tools span{background:var(--card);border:1px solid rgba(127,127,127,.25);padding:8px 16px;border-radius:999px;font-size:.92rem}
.proj .result{margin-top:12px;font-weight:600;color:var(--accent);font-size:.92rem}
.proj a{display:inline-block;margin-top:12px;font-weight:600}
.why{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.why li{background:var(--card);padding:18px 20px 18px 52px;border-radius:14px;position:relative}
.why li:before{content:'✓';position:absolute;left:18px;top:16px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--bg);display:grid;place-items:center;font-size:.8rem}
.timeline .item{border-left:3px solid var(--accent2);padding:0 0 24px 22px;position:relative}
.timeline .item:before{content:'';position:absolute;left:-8px;top:6px;width:13px;height:13px;border-radius:50%;background:var(--accent)}
.timeline .meta{color:var(--muted);font-size:.9rem}
.timeline ul{margin:.4em 0 0;padding-left:1.1em;color:var(--muted)}
.contact{text-align:center}
.contact .card{max-width:640px;margin:0 auto;padding:44px}
footer{text-align:center;padding:28px;color:var(--muted);font-size:.85rem}
@media(max-width:760px){.hero{grid-template-columns:1fr;text-align:center}.hero .ctas{justify-content:center}.avatar{max-width:240px;margin:0 auto;order:-1}nav .links{display:none}}
</style></head>
<body>
<div class="wrap">
<nav><b>${name}</b><div class="links"><a href="#services">Services</a><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></div></nav>
<header class="hero">
  <div>
    <div class="eyebrow">${esc(gen.headline())}</div>
    <h1>I help ${esc(gen.niche())} get hours back every week.</h1>
    <p class="lead">${esc(gen.summary())}</p>
    <div class="ctas"><a class="btn" href="${esc(cta)}">${book ? 'Book a free discovery call' : 'Work with me'}</a><a class="btn alt" href="#work">See my work</a></div>
  </div>
  <div class="avatar">${photo ? `<img src="${esc(photo)}" alt="${name}">` : initials}</div>
</header>
</div>

<section class="tint" id="services"><div class="wrap">
  <div class="head"><h2>How I can help</h2><p>Hand these off so you can focus on the work only you can do.</p></div>
  <div class="grid">${services.map((s, i) => `<div class="card"><div class="icon">${String(i + 1).padStart(2, '0')}</div><h3>${esc(s)}</h3><p>${esc(BLURB[s] || 'Handled reliably, on time and done right the first time.')}</p></div>`).join('')}</div>
</div></section>

${state.tools.length ? `<section><div class="wrap"><div class="head"><h2>Tools I work with</h2></div><div class="tools">${state.tools.map(x => `<span>${esc(x)}</span>`).join('')}</div></div></section>` : ''}

${projects.length ? `<section class="${state.tools.length ? 'tint' : ''}" id="work"><div class="wrap">
  <div class="head"><h2>Sample work</h2><p>Real examples of how I organize, create and simplify.</p></div>
  <div class="grid">${projects.map(p => `<div class="card proj"><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p>${p.result ? `<div class="result">→ ${esc(p.result)}</div>` : ''}${safeUrl(p.link) ? `<a href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">View sample →</a>` : ''}</div>`).join('')}</div>
</div></section>` : '<span id="work"></span>'}

<section id="about"><div class="wrap">
  <div class="head"><h2>Why work with me</h2>${state.availability ? `<p>Availability: ${esc(state.availability)}${state.location ? ' · Based in ' + esc(state.location) : ''}</p>` : ''}</div>
  <ul class="why">${why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
  ${exp.length ? `<div class="timeline" style="max-width:720px;margin:56px auto 0"><h2 style="text-align:center;margin-bottom:28px">Experience</h2>${exp.map(e => `<div class="item"><h3>${esc(e.role)}</h3><div class="meta">${esc([e.org, e.dates].filter(Boolean).join(' · '))}</div><ul>${lines(e.bullets).map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
</div></section>

<section class="contact tint" id="contact"><div class="wrap"><div class="card">
  <h2>Let's give you your time back</h2>
  <p>Tell me what's on your plate. I'll reply within one business day with how I can help.</p>
  <p style="margin:28px 0 8px"><a class="btn" href="${esc(cta)}">${book ? 'Book a free discovery call' : 'Email me'}</a></p>
  ${state.email ? `<p><a href="${esc(mail)}">${esc(state.email)}</a></p>` : ''}
  ${safeUrl(state.linkedin) ? `<p><a href="${esc(safeUrl(state.linkedin))}" target="_blank" rel="noopener">LinkedIn</a></p>` : ''}
</div></div></section>
<footer>© ${new Date().getFullYear()} ${name} · ${esc(gen.headline())}</footer>
</body></html>`;
  }

  let last = '';
  function render() {
    if (!document.getElementById('tab-portfolio').classList.contains('is-active')) return;
    const html = build();
    document.getElementById('browserUrl').textContent = slug() + '.netlify.app';
    if (html !== last) { frame.srcdoc = html; last = html; }
  }
  document.getElementById('downloadPortfolio').addEventListener('click', () => {
    App.download('index.html', build(), 'text/html');
  });

  App.onChange(render);
  render();
})();
