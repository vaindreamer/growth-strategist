/* Core: state, storage, tabs, the About You form, and shared text generators. */
(function () {
  const STORE_KEY = 'vaMommaKit.v1';
  const listeners = [];

  const blank = () => ({
    fullName: '', email: '', location: '', phone: '', availability: '', rate: '',
    portfolioUrl: '', linkedin: '', photoUrl: '', niche: '', headline: '', summary: '',
    services: [], tools: [], customServices: [], customTools: [], translator: [],
    experience: [], projects: [], certifications: '', education: '',
    ui: { resumeTemplate: 'classic', resumeAccent: '#8a3f6b', portfolioTheme: 'blush', bookingUrl: '', platform: 'upwork', checks: {} }
  });

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) return Object.assign(blank(), saved, { ui: Object.assign(blank().ui, saved.ui || {}) });
    } catch (e) { /* ignore corrupt storage */ }
    return blank();
  }

  const state = load();
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        flash('Saved ✓');
      } catch (e) { flash('Could not save. Your browser storage may be full or turned off.'); }
    }, 300);
  }
  function flash(msg) {
    const el = document.getElementById('saveStatus');
    el.textContent = msg;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.textContent = 'Your work saves automatically on this device'; }, 1800);
  }
  function changed() { save(); listeners.forEach(fn => fn(state)); }

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const safeUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';
  const titleCase = s => String(s || '').replace(/\b([a-z])([a-z]*)/g, (m, a, b, i) => i > 0 && /^(and|or|for|of|the|a|an|in|on|to|with)$/.test(m) ? m : a.toUpperCase() + b);
  // Lower-case a phrase for use mid-sentence, keeping brand names and acronyms (Canva, Shopify, BPO, SOP) intact.
  const BRANDS = /^(Canva|Shopify|YouTube|Google|Gmail|Instagram|Facebook|TikTok|LinkedIn|QuickBooks|Xero|Amazon|Etsy|Trello|Asana|Notion|Salesforce|HubSpot|Zendesk|Mailchimp|Pinterest)$/;
  const lc = s => String(s || '').split(' ').map(w => BRANDS.test(w) || /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()).join(' ');
  const listJoin = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  /* ---------- generators shared by every tool ---------- */
  const gen = {
    services: () => state.services.slice(),
    tools: () => state.tools.slice(),
    niche: () => state.niche.trim() || 'small business owners',
    firstName: () => (state.fullName.trim().split(/\s+/)[0] || 'there'),

    headline() {
      if (state.headline.trim()) return state.headline.trim();
      const s = state.services;
      if (s.some(x => /social|canva|content/i.test(x))) return 'Social Media & Admin Virtual Assistant';
      if (s.some(x => /bookkeeping/i.test(x))) return 'Admin & Bookkeeping Virtual Assistant';
      if (s.some(x => /shopify|e-commerce/i.test(x))) return 'E-commerce Virtual Assistant';
      if (s.some(x => /customer/i.test(x))) return 'Customer Support Virtual Assistant';
      return 'Executive & Administrative Virtual Assistant';
    },

    // Platform title: role + niche + top services, trimmed to a limit.
    titleOptions(limit) {
      const role = gen.headline().replace(/virtual assistant/i, 'VA');
      const niche = titleCase(gen.niche());
      const s = state.services.slice(0, 3);
      const t = state.tools.slice(0, 2);
      const opts = [
        `${gen.headline()} for ${niche}`,
        `${role} | ${s.slice(0, 3).join(', ')}`,
        `${role} for ${niche} | ${s[0] || 'Inbox Management'}`,
        `${role} for ${niche}`,
        `${s[0] || 'Admin'} & ${s[1] || 'Calendar'} VA for ${niche}`,
        `Virtual Assistant for ${niche} | ${t.join(' & ') || 'Google Workspace'}`,
        `Reliable ${role} | ${t.join(' & ') || 'Google Workspace'} | ${s[0] || 'Inbox Management'}`,
        `${role} Helping ${niche} Save 10+ Hours a Week`,
        `${s[0] || 'Admin'} & ${s[1] || 'Calendar'} Virtual Assistant | ${t[0] || 'Google Workspace'}`,
        gen.headline()
      ];
      return [...new Set(opts)].map(o => o.replace(/\s+/g, ' ').trim()).filter(o => o.length <= limit);
    },

    summary() {
      if (state.summary.trim()) return state.summary.trim();
      const s = state.services.slice(0, 3).map(lc);
      const t = state.tools.slice(0, 4);
      const hasExp = state.experience.some(e => e.role);
      return `Organized, dependable virtual assistant helping ${gen.niche()} take ${s.length ? listJoin(s) : 'day-to-day admin'} off their plate.` +
        (hasExp ? ` I bring real-world experience as ${aOrAn(state.experience[0].role)} ${lc(state.experience[0].role)}` + (state.experience[0].org ? ` at ${state.experience[0].org}` : '') + '.' : '') +
        (t.length ? ` Comfortable with ${listJoin(t)}.` : '') +
        ` Clear communication, quick replies and work done right the first time.`;
    },

    overview(platform) {
      const n = gen.niche();
      const svc = state.services.length ? state.services : ['Inbox Management', 'Calendar & Scheduling', 'Data Entry'];
      const tools = state.tools;
      const exp = state.experience.filter(e => e.role);
      const proj = state.projects.filter(p => p.title);
      const trans = KIT.translator.filter(x => state.translator.includes(x.id)).slice(0, 2);
      const out = [];
      out.push(`${n.charAt(0).toUpperCase() + n.slice(1)}: are emails, scheduling and endless to-dos keeping you from the work only you can do? I can take those tasks off your plate so you get your time back.`);
      out.push(`Hi, I'm ${gen.firstName()}, ${aOrAn(gen.headline())} ${lc(gen.headline())} based in ${state.location || 'the Philippines'}.` +
        (exp.length ? ` Before freelancing I worked as ${aOrAn(exp[0].role)} ${lc(exp[0].role)}` + (exp[0].org ? ` at ${exp[0].org}` : '') + ', where I learned to be fast, accurate and calm under pressure.' : ' I am detail-oriented, quick to learn new tools, and I treat your business like it matters, because it does.'));
      out.push('HOW I CAN HELP YOU:\n' + svc.slice(0, 6).map(x => '✔ ' + x).join('\n'));
      if (tools.length) out.push('TOOLS I USE:\n' + tools.join(' • '));
      const proof = [];
      exp.forEach(e => lines(e.bullets).slice(0, 1).forEach(b => proof.push(b)));
      proj.slice(0, 2).forEach(p => proof.push(p.title + (p.result ? ` (${p.result})` : '')));
      if (proof.length) out.push('RESULTS & SAMPLE WORK:\n' + proof.slice(0, 4).map(x => '• ' + x).join('\n'));
      if (trans.length) out.push('WHAT YOU CAN EXPECT:\n' + trans.map(x => '• ' + x.pro).join('\n') + '\n• Daily or end-of-day updates so you always know where things stand');
      else out.push('WHAT YOU CAN EXPECT:\n• Replies within a few hours during my working hours\n• End-of-day updates so you always know where things stand\n• Your data kept private and secure');
      if (state.availability) out.push(`Availability: ${state.availability}.`);
      out.push(platform === 'olj'
        ? 'If you need someone reliable who will stay for the long term, I would love to hear from you. Send me a message and tell me what is on your plate this week.'
        : 'Ready to get hours back in your week? Click "Invite to Job" or send me a message and tell me what is on your plate. I usually reply within a few hours.');
      return out.join('\n\n');
    },

    skills(platform) {
      const max = platform === 'upwork' ? 15 : 20;
      return [...new Set([...state.services, ...state.tools, 'Virtual Assistance', 'Administrative Support'])].slice(0, max);
    },

    translatorSkills: () => KIT.translator.filter(x => state.translator.includes(x.id)).map(x => x.pro)
  };
  function aOrAn(word) { return /^[aeiou]/i.test(String(word || '').trim()) ? 'an' : 'a'; }

  /* ---------- tabs ---------- */
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('is-active', p.id === 'tab-' + name));
    listeners.forEach(fn => fn(state));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));

  /* ---------- About You form ---------- */
  const form = document.getElementById('aboutForm');
  const SIMPLE = ['fullName', 'email', 'location', 'phone', 'availability', 'rate', 'portfolioUrl', 'linkedin', 'photoUrl', 'niche', 'headline', 'summary', 'certifications', 'education'];

  function fillSimple() { SIMPLE.forEach(k => { const el = form.elements[k]; if (el) el.value = state[k] || ''; }); }
  form.addEventListener('input', e => {
    const k = e.target.name;
    if (SIMPLE.includes(k)) { state[k] = e.target.value; changed(); }
  });

  function renderChips(kind) {
    const box = document.getElementById(kind + 'Chips');
    const custom = kind === 'services' ? 'customServices' : 'customTools';
    const all = [...KIT[kind], ...state[custom]];
    box.innerHTML = all.map(v => `<label class="chip ${state[kind].includes(v) ? 'is-on' : ''}"><input type="checkbox" value="${esc(v)}" ${state[kind].includes(v) ? 'checked' : ''}>${esc(v)}</label>`).join('');
    box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      const v = cb.value;
      state[kind] = cb.checked ? [...state[kind], v] : state[kind].filter(x => x !== v);
      cb.parentElement.classList.toggle('is-on', cb.checked);
      changed();
    }));
  }
  document.querySelectorAll('[data-add-custom]').forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.dataset.addCustom;
    const input = document.getElementById(kind === 'services' ? 'customService' : 'customTool');
    const v = input.value.trim();
    if (!v) return;
    const custom = kind === 'services' ? 'customServices' : 'customTools';
    if (![...KIT[kind], ...state[custom]].includes(v)) state[custom].push(v);
    if (!state[kind].includes(v)) state[kind].push(v);
    input.value = '';
    renderChips(kind); changed();
  }));

  function renderTranslator() {
    const box = document.getElementById('translatorList');
    box.innerHTML = KIT.translator.map(t => `
      <label class="tr-row ${state.translator.includes(t.id) ? 'is-on' : ''}">
        <input type="checkbox" value="${t.id}" ${state.translator.includes(t.id) ? 'checked' : ''}>
        <span class="tr-mom">${esc(t.mom)}</span>
        <span class="tr-arrow" aria-hidden="true">→</span>
        <span class="tr-pro">${esc(t.pro)}</span>
      </label>`).join('');
    box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
      state.translator = cb.checked ? [...state.translator, cb.value] : state.translator.filter(x => x !== cb.value);
      cb.closest('.tr-row').classList.toggle('is-on', cb.checked);
      changed();
    }));
  }

  const REPEAT = {
    experience: { fields: [['role', 'Role / title', 'Customer Service Representative'], ['org', 'Company / organization', 'ABC Company'], ['dates', 'Dates', '2019 – 2022'], ['bullets', 'What you did (one per line)', 'Answered 50+ customer emails a day\nUpdated client records in Google Sheets', true]], empty: { role: '', org: '', dates: '', bullets: '' } },
    projects: { fields: [['title', 'Project title', 'Inbox Zero System'], ['link', 'Link (Google Drive, Canva, Loom)', 'https://...'], ['desc', 'What you made', 'Built a Gmail label and filter system...', true], ['result', 'Result / benefit', 'Saves 30 minutes a day']], empty: { title: '', link: '', desc: '', result: '' } }
  };
  function renderRepeat(kind) {
    const box = document.getElementById(kind + 'List');
    const cfg = REPEAT[kind];
    box.innerHTML = state[kind].map((item, i) => `
      <div class="repeat-item" data-i="${i}">
        <div class="grid-2">
          ${cfg.fields.map(([k, label, ph, area]) => area
            ? `<label class="span-2">${label}<textarea data-k="${k}" rows="3" placeholder="${esc(ph)}">${esc(item[k])}</textarea></label>`
            : `<label>${label}<input data-k="${k}" value="${esc(item[k])}" placeholder="${esc(ph)}"></label>`).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-danger-ghost" data-remove>Remove</button>
      </div>`).join('') || `<p class="empty">Nothing here yet.</p>`;
    box.querySelectorAll('.repeat-item').forEach(row => {
      const i = +row.dataset.i;
      row.querySelectorAll('[data-k]').forEach(f => f.addEventListener('input', () => { state[kind][i][f.dataset.k] = f.value; changed(); }));
      row.querySelector('[data-remove]').addEventListener('click', () => { state[kind].splice(i, 1); renderRepeat(kind); changed(); });
    });
  }
  document.querySelectorAll('[data-add-item]').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.addItem;
    state[kind].push(Object.assign({}, REPEAT[kind].empty));
    renderRepeat(kind); changed();
  }));

  function renderAbout() {
    fillSimple(); renderChips('services'); renderChips('tools'); renderTranslator();
    renderRepeat('experience'); renderRepeat('projects');
  }

  function replaceState(next) {
    const ui = state.ui;
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, blank(), next, { ui: Object.assign(blank().ui, ui, next.ui || {}) });
    renderAbout(); changed();
  }

  document.getElementById('loadSample').addEventListener('click', () => {
    if (state.fullName && !confirm('Replace your answers with the sample data?')) return;
    replaceState(JSON.parse(JSON.stringify(KIT.sample)));
  });
  document.getElementById('resetData').addEventListener('click', () => {
    if (!confirm('Erase everything and start over? Click "Back up my answers" first if you want to keep a copy.')) return;
    replaceState({ ui: blank().ui });
  });
  document.getElementById('exportData').addEventListener('click', () => {
    download('va-kit-backup.json', JSON.stringify(state, null, 2), 'application/json');
  });
  document.getElementById('importData').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { replaceState(JSON.parse(t)); flash('Backup restored ✓'); })
      .catch(() => alert('That file could not be read. Make sure it is a backup from this kit.'));
    e.target.value = '';
  });

  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.App = { state, gen, esc, lc, lines, safeUrl, titleCase, listJoin, save, changed, download, onChange: fn => listeners.push(fn) };
  renderAbout();
})();
