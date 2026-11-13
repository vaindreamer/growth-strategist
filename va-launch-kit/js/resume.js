/* Step 2: Resume builder with two printable templates. */
(function () {
  const { state, gen, esc, lines, safeUrl } = App;
  const out = document.getElementById('resumeOut');
  const tpl = document.getElementById('resumeTemplate');
  const accent = document.getElementById('resumeAccent');
  const tips = document.getElementById('resumeTips');

  tpl.value = state.ui.resumeTemplate;
  accent.value = state.ui.resumeAccent;
  tpl.addEventListener('change', () => { state.ui.resumeTemplate = tpl.value; App.changed(); });
  accent.addEventListener('input', () => { state.ui.resumeAccent = accent.value; App.changed(); });
  document.getElementById('printResume').addEventListener('click', () => {
    document.body.classList.add('printing-resume');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-resume'), 500);
  });

  const link = (u, label) => safeUrl(u) ? `<a href="${esc(safeUrl(u))}">${esc(label || safeUrl(u).replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '';

  function sections() {
    const exp = state.experience.filter(e => e.role || e.org);
    const proj = state.projects.filter(p => p.title);
    const trans = gen.translatorSkills();
    const certs = lines(state.certifications);
    const edu = lines(state.education);
    return {
      contact: [esc(state.email), esc(state.phone), esc(state.location), link(state.portfolioUrl, 'Portfolio'), link(state.linkedin, 'LinkedIn')].filter(Boolean),
      summary: `<p>${esc(gen.summary())}</p>` + (state.availability ? `<p class="r-avail"><strong>Availability:</strong> ${esc(state.availability)}</p>` : ''),
      services: state.services.length ? `<ul class="r-tags">${state.services.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '',
      tools: state.tools.length ? `<ul class="r-tags">${state.tools.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '',
      experience: exp.map(e => `
        <div class="r-item">
          <div class="r-item-head"><strong>${esc(e.role)}</strong>${e.org ? ` · ${esc(e.org)}` : ''}<span>${esc(e.dates)}</span></div>
          <ul>${lines(e.bullets).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>`).join(''),
      projects: proj.map(p => `
        <div class="r-item">
          <div class="r-item-head"><strong>${esc(p.title)}</strong>${link(p.link, 'View sample') ? ' · ' + link(p.link, 'View sample') : ''}</div>
          <ul>${p.desc ? `<li>${esc(p.desc)}</li>` : ''}${p.result ? `<li><em>Result:</em> ${esc(p.result)}</li>` : ''}</ul>
        </div>`).join(''),
      transferable: trans.length ? `<ul>${trans.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '',
      certs: certs.length ? `<ul>${certs.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '',
      edu: edu.length ? `<ul>${edu.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''
    };
  }

  const sec = (title, body) => body ? `<section class="r-sec"><h3>${title}</h3>${body}</section>` : '';

  function render() {
    if (!document.getElementById('tab-resume').classList.contains('is-active')) return;
    const s = sections();
    const name = esc(state.fullName || 'Your Name');
    const head = esc(gen.headline());
    out.style.setProperty('--accent', state.ui.resumeAccent);
    out.className = 'paper resume-' + state.ui.resumeTemplate;

    if (state.ui.resumeTemplate === 'modern') {
      out.innerHTML = `
        <aside class="r-side">
          <h1>${name}</h1><p class="r-title">${head}</p>
          <div class="r-contact">${s.contact.map(c => `<div>${c}</div>`).join('')}</div>
          ${sec('Services', s.services)}${sec('Tools', s.tools)}${sec('Training', s.certs)}${sec('Education', s.edu)}
        </aside>
        <div class="r-main">
          ${sec('Profile', s.summary)}${sec('Experience', s.experience)}${sec('Sample Projects', s.projects)}${sec('Transferable Skills', s.transferable)}
        </div>`;
    } else {
      out.innerHTML = `
        <header class="r-head"><h1>${name}</h1><p class="r-title">${head}</p><p class="r-contact">${s.contact.join(' &nbsp;|&nbsp; ')}</p></header>
        ${sec('Professional Summary', s.summary)}${sec('Core Services', s.services)}${sec('Tools & Software', s.tools)}
        ${sec('Experience', s.experience)}${sec('Sample Projects', s.projects)}${sec('Transferable Skills', s.transferable)}
        ${sec('Training & Certifications', s.certs)}${sec('Education', s.edu)}`;
    }
    renderTips();
  }

  function renderTips() {
    const t = [];
    if (!state.fullName) t.push('Add your name in Step 1.');
    if (!state.email) t.push('Add an email address. Use a professional one like firstname.lastname.va@gmail.com.');
    if (state.services.length < 3) t.push('Pick at least 3 services so clients can see what to hire you for.');
    if (!state.experience.some(e => e.role) && !state.projects.some(p => p.title)) t.push('Add some experience or at least one practice project. A resume with neither won\'t get replies.');
    if (state.experience.some(e => e.role) && !state.experience.some(e => /\d/.test(e.bullets))) t.push('Add a number to at least one experience bullet ("50+ emails a day", "12 clients", "3 years").');
    if (state.projects.filter(p => p.title).length < 3) t.push('Aim for 3 sample projects. Each one is proof you can do the work.');
    if (!state.portfolioUrl) t.push('After Step 3, paste your portfolio link back into Step 1 so it shows on your resume.');
    tips.innerHTML = t.length ? `<strong>Make it stronger:</strong><ul>${t.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<strong>Looking great!</strong> Your resume covers everything clients look for.';
    tips.classList.toggle('is-good', !t.length);
  }

  App.onChange(render);
  render();
})();
