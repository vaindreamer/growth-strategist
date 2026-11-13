/* Step 4: Upwork / OnlineJobs.ph profile scorer + proposal builder.
   Scores are heuristics based on common client-hiring advice, not platform algorithms. */
(function () {
  const { state, gen, esc } = App;
  const $ = id => document.getElementById(id);
  const title = $('optTitle'), overview = $('optOverview'), skills = $('optSkills'), rate = $('optRate');

  const PLATFORM = {
    upwork: {
      titleMax: 70, titleLabel: 'Profile title (max 70 characters)', overviewLabel: 'Overview', overviewMin: 600, overviewIdeal: [1000, 3000], overviewMax: 5000, snippet: 230, skillsMax: 15,
      checks: [
        ['photo', 'Clear, smiling headshot: face fills most of the frame, plain background, good light', 8],
        ['verified', 'Identity verified and payment method / tax info complete', 6],
        ['portfolio', 'At least 3 portfolio items uploaded (your sample projects)', 8],
        ['video', 'A 60-second intro video recorded (say who you help and how)', 4],
        ['availability', 'Availability badge turned on, and the hours/week set', 3],
        ['employment', 'Employment history and education filled in', 3]
      ]
    },
    olj: {
      titleMax: 80, titleLabel: 'Profile title / headline', overviewLabel: 'Profile description ("About me")', overviewMin: 500, overviewIdeal: [800, 2500], overviewMax: 6000, snippet: 200, skillsMax: 25,
      checks: [
        ['photo', 'Professional, smiling photo (no selfies, group shots or filters)', 8],
        ['idproof', 'ID Proof done: verified ID and complete contact details to raise your ID Proof score', 8],
        ['skillsRated', 'Skills rated honestly in the Skills section (3–5 stars only where it\'s true)', 5],
        ['portfolio', 'Portfolio / sample-work links added', 6],
        ['salary', 'Expected salary and employment type (full-time / part-time) set', 4],
        ['resume', 'Resume uploaded (download it from Step 2)', 3]
      ]
    }
  };
  const P = () => PLATFORM[state.ui.platform];

  const WEAK = [
    [/\bno experience\b/i, '"No experience". Talk about your practice projects and transferable skills instead.'],
    [/\b(newbie|beginner|fresh(er)?\b)/i, '"Newbie" / "beginner". Say "new to freelancing" or skip it. Lead with what you CAN do.'],
    [/please (hire|give me a chance|consider)/i, '"Please hire me". It sounds desperate. Offer value instead: "Here\'s how I can help…"'],
    [/\bhard[- ]?working\b/i, '"Hardworking" is on every profile. Show it with a number or a result.'],
    [/\b(jack of all trades|anything and everything|any task)\b/i, '"I can do anything". Clients trust specialists more. Name your top services.'],
    [/\b(single mom|need (the )?money|financial(ly)? struggl)/i, 'Personal hardship. Keep the profile about the client\'s needs. Save your story for when you\'re asked.'],
    [/!!+/, 'Multiple exclamation marks. One is plenty.']
  ];

  /* ---------- wire up ---------- */
  function setPlatform(p) {
    state.ui.platform = p;
    document.querySelectorAll('.seg-btn').forEach(b => { const on = b.dataset.platform === p; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on); });
    App.changed();
  }
  document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setPlatform(b.dataset.platform)));

  // Optimizer drafts are stored per platform so switching doesn't wipe your work.
  const draft = () => (state.ui.drafts = state.ui.drafts || {})[state.ui.platform] || (state.ui.drafts[state.ui.platform] = { title: '', overview: '', skills: '', rate: '' });
  function fillInputs() { const d = draft(); title.value = d.title; overview.value = d.overview; skills.value = d.skills; rate.value = d.rate; }
  [[title, 'title'], [overview, 'overview'], [skills, 'skills'], [rate, 'rate']].forEach(([el, k]) => el.addEventListener('input', () => { draft()[k] = el.value; App.changed(); }));

  $('loadDrafts').addEventListener('click', () => {
    const d = draft();
    if ((d.title || d.overview) && !confirm('Replace what\'s in the boxes with drafts made from your Step 1 answers?')) return;
    const opts = gen.titleOptions(P().titleMax);
    d.title = opts[0] || gen.headline();
    d.overview = gen.overview(state.ui.platform);
    d.skills = gen.skills(state.ui.platform).join(', ');
    d.rate = state.rate || '';
    fillInputs(); App.changed();
  });

  /* ---------- scoring ---------- */
  function analyze() {
    const p = P(), d = draft();
    const T = d.title.trim(), O = d.overview.trim(), first = O.slice(0, p.snippet);
    const S = d.skills.split(',').map(s => s.trim()).filter(Boolean);
    const lowerO = O.toLowerCase(), lowerT = T.toLowerCase();
    const fixes = [], wins = [];
    let score = 0;
    const add = (ok, pts, win, fix, impact) => { if (ok) { score += pts; wins.push(win); } else fixes.push({ text: fix, impact: impact || pts }); };

    // TITLE (20)
    add(T.length >= 25 && T.length <= p.titleMax, 5, `Title length is good (${T.length}/${p.titleMax}).`,
      T.length > p.titleMax ? `Your title is too long (${T.length}/${p.titleMax}). It will get cut off.` : 'Write a specific title of 25+ characters: role + who you help + 1–2 top skills.');
    add(T && !/^(general )?virtual assistant\.?$/i.test(T) && /\b(for|\||&|,)\b|\||&|,/.test(T), 6, 'Title is specific, not just "Virtual Assistant".',
      'Make the title specific. "Virtual Assistant" alone gets lost among thousands. Try "Executive Assistant for Busy Coaches | Inbox & Calendar".');
    const kwHits = [...state.services, ...state.tools].filter(k => lowerT.includes(k.toLowerCase().split(/[ &/]/)[0]));
    add(kwHits.length >= 1 || /email|calendar|social|canva|admin|support|shopify|bookkeep|data|lead|executive|e-?commerce/i.test(T), 5, 'Title includes searchable keywords.',
      'Add a keyword clients actually search: a service (e.g. "Email Management") or a tool (e.g. "Canva", "Shopify").');
    add(T && T !== T.toUpperCase() && (T.match(/\p{Extended_Pictographic}/gu) || []).length <= 1, 4, 'Title is clean and professional.',
      'Avoid ALL CAPS and emojis in your title.');

    // OVERVIEW (40)
    add(O.length >= p.overviewMin, 6, `Overview has enough detail (${O.length} characters).`,
      `Your overview is short (${O.length} characters). Aim for ${p.overviewIdeal[0]}–${p.overviewIdeal[1]}. Clients want to see how you work.`);
    if (O.length > p.overviewMax) fixes.push({ text: `Overview is over the ${p.overviewMax}-character limit. Trim it down.`, impact: 6 });
    const startsWithMe = /^(hi|hello|good day|greetings|my name|i am|i'm|i have)\b/i.test(first);
    const youFirst = /\byou(r)?\b/i.test(first);
    add(O && !startsWithMe && youFirst, 9, 'The opening talks about the client and their problem. That\'s great for the search preview.',
      'Rewrite your first 2 lines to be about the CLIENT. Clients see only the first ~' + p.snippet + ' characters in search. Start with their problem: "Drowning in emails and admin? I help…" instead of "Hi, my name is…".', 9);
    const you = (lowerO.match(/\byou(r|rs)?\b/g) || []).length, me = (lowerO.match(/\b(i|i'm|i've|my|me)\b/g) || []).length;
    add(O && you >= me * 0.5, 5, `Good balance of "you" (${you}) vs "I/my" (${me}).`,
      `Your overview says "I/my" ${me} times and "you/your" only ${you} times. Rephrase some sentences around what the client gets.`);
    const bulletLines = O.split('\n').filter(l => /^\s*([-•✔✓*▪➤>]|\d+[.)])\s*/.test(l)).length;
    add(bulletLines >= 3, 5, 'Services are listed so they\'re easy to skim.',
      'Add a short bullet list of your services. Busy clients skim before they read.');
    add(/\d/.test(O.replace(/\b(20\d\d|19\d\d)\b/g, '')), 5, 'Includes numbers and proof.',
      'Add proof with a number: "answered 60+ emails/day", "3 years in customer service", "organized 200+ files".');
    add(/(message|invite|contact|reach out|let's|lets|book|send me|hire me|click)/i.test(O.slice(-400)), 5, 'Ends with a clear call to action.',
      'End with a call to action: "Send me a message and tell me what\'s on your plate this week."');
    add(/(available|availability|hours|time ?zone|est|pst|cst|aest|gmt|full[- ]time|part[- ]time)/i.test(O), 5, 'Mentions availability or time zone.',
      'Mention your hours and time zone overlap. It\'s one of the first things clients worry about.');
    const toolHits = state.tools.filter(t => lowerO.includes(t.toLowerCase().split(' ')[0]));
    if (state.tools.length) add(toolHits.length >= Math.min(3, state.tools.length), 0, `Mentions your tools (${toolHits.length}).`, 'Name the tools you know (Canva, Google Workspace, Trello…). Clients search for them.', 3);

    WEAK.forEach(([re, msg]) => { if (re.test(O) || re.test(T)) { fixes.push({ text: 'Replace ' + msg, impact: 4 }); score -= 2; } });

    // SKILLS (10)
    add(S.length >= 5, 5, `${S.length} skills listed.`, 'List at least 5–10 skills. These are how clients filter search results.');
    if (S.length > p.skillsMax) fixes.push({ text: `${state.ui.platform === 'upwork' ? 'Upwork allows' : 'Keep it to about'} ${p.skillsMax} skills. You have ${S.length}. Keep the most relevant ones.`, impact: 3 });
    const svcCovered = state.services.filter(s => S.some(k => k.toLowerCase() === s.toLowerCase()));
    add(state.services.length === 0 || svcCovered.length >= Math.min(3, state.services.length), 5, 'Skills match the services you offer.',
      'Your skills don\'t match your services. Add the exact service names from Step 1.');

    // RATE (5)
    const r = parseFloat(d.rate);
    add(r >= 4, 5, `Rate is set ($${r}/hr).`,
      !d.rate ? 'Set an hourly rate. A blank or $3/hr rate can make clients think you\'re not serious.' : `$${r}/hr is very low. Many new VAs start at $4–$8/hr and raise it after 2–3 good reviews.`);

    // CHECKLIST (up to 32 → normalized)
    const checks = p.checks, totalCk = checks.reduce((a, c) => a + c[2], 0);
    let ck = 0;
    checks.forEach(([id, label, pts]) => { if (state.ui.checks[state.ui.platform + ':' + id]) { ck += pts; } else fixes.push({ text: label, impact: pts * 25 / totalCk }); });
    score += Math.round(ck * 25 / totalCk);

    score = Math.max(0, Math.min(100, Math.round(score)));
    fixes.sort((a, b) => b.impact - a.impact);
    return { score, fixes, wins, snippet: first };
  }

  /* ---------- render ---------- */
  function renderChecklist() {
    const box = $('checklist');
    box.innerHTML = P().checks.map(([id, label]) => {
      const key = state.ui.platform + ':' + id;
      return `<label class="check ${state.ui.checks[key] ? 'is-on' : ''}"><input type="checkbox" data-key="${key}" ${state.ui.checks[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`;
    }).join('');
    box.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => { state.ui.checks[cb.dataset.key] = cb.checked; App.changed(); }));
  }

  let lastPlatform;
  function render() {
    if (!$('tab-optimizer').classList.contains('is-active')) return;
    const p = P();
    if (lastPlatform !== state.ui.platform) { lastPlatform = state.ui.platform; fillInputs(); renderChecklist(); }
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.platform === state.ui.platform));
    $('titleLabel').textContent = p.titleLabel;
    $('overviewLabel').textContent = p.overviewLabel;
    const d = draft();
    setCount('titleCount', d.title.length, p.titleMax);
    setCount('overviewCount', d.overview.length, p.overviewMax, p.overviewIdeal);
    const sk = d.skills.split(',').filter(s => s.trim()).length;
    setCount('skillsCount', sk, p.skillsMax);

    const ideas = gen.titleOptions(p.titleMax).filter(o => o !== d.title).slice(0, 4);
    $('titleIdeas').innerHTML = ideas.length ? '<span>Try:</span>' + ideas.map(o => `<button type="button" class="idea">${esc(o)}</button>`).join('') : '';
    $('titleIdeas').querySelectorAll('.idea').forEach(b => b.addEventListener('click', () => { draft().title = b.textContent; title.value = b.textContent; App.changed(); }));

    const a = analyze();
    $('snippet').textContent = a.snippet ? a.snippet + (d.overview.length > p.snippet ? '…' : '') : '(your overview preview shows here)';
    $('scoreNum').textContent = a.score;
    const arc = $('gaugeArc'), C = 2 * Math.PI * 52;
    arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C * (1 - a.score / 100);
    const tier = a.score >= 85 ? ['Client-ready! Now send 5–10 good proposals a day.', 'great'] : a.score >= 65 ? ['Almost there. Fix the top items below.', 'good'] : a.score >= 40 ? ['Good start. Work through the list.', 'ok'] : ['Let\'s build this up together.', 'low'];
    $('scoreLabel').textContent = tier[0];
    $('gauge').dataset.tier = tier[1];
    $('fixList').innerHTML = a.fixes.slice(0, 8).map(f => `<li>${esc(f.text)}</li>`).join('') || '<li class="none">Nothing major. Nice work!</li>';
    $('winList').innerHTML = a.wins.map(w => `<li>${esc(w)}</li>`).join('') || '<li class="none">Your wins will show up here.</li>';
    renderProposal();
  }
  function setCount(id, n, max, ideal) {
    const el = $(id);
    el.textContent = ideal ? `${n} chars (aim for ${ideal[0]}–${ideal[1]})` : `${n}/${max}`;
    el.classList.toggle('over', n > max);
  }

  /* ---------- proposal builder ---------- */
  const jobPost = $('jobPost'), proposalOut = $('proposalOut');
  jobPost.value = state.ui.jobPost || '';
  jobPost.addEventListener('input', () => { state.ui.jobPost = jobPost.value; state.ui.proposalEdited = false; App.changed(); });
  proposalOut.addEventListener('input', () => { state.ui.proposalEdited = true; state.ui.proposal = proposalOut.value; App.save(); });
  $('copyProposal').addEventListener('click', () => {
    proposalOut.select();
    (navigator.clipboard ? navigator.clipboard.writeText(proposalOut.value) : Promise.reject()).catch(() => document.execCommand('copy'));
    $('copyProposal').textContent = 'Copied ✓'; setTimeout(() => { $('copyProposal').textContent = 'Copy'; }, 1500);
  });

  function renderProposal() {
    const job = (state.ui.jobPost || '').trim();
    if (state.ui.proposalEdited) { proposalOut.value = state.ui.proposal || ''; return; }
    if (!job) { proposalOut.value = ''; $('jobMatch').textContent = ''; return; }
    const lj = job.toLowerCase();
    const matched = Object.entries(KIT.serviceKeywords).filter(([, kws]) => kws.some(k => lj.includes(k))).map(([s]) => s);
    const mine = matched.filter(s => state.services.includes(s));
    const gaps = matched.filter(s => !state.services.includes(s));
    const toolsHit = [...KIT.tools, ...state.customTools].filter(t => lj.includes(t.toLowerCase().split(/[ /]/)[0])).filter(t => state.tools.includes(t));
    const nameMatch = job.match(/\b(?:[Mm]y name is|[Tt]hanks,?|[Tt]hank you,?|[Rr]egards,?|[Cc]heers,?|[Bb]est,)\s*\n?\s*([A-Z][a-z]+)\b/);
    const hello = nameMatch ? `Hi ${nameMatch[1]},` : 'Hi there,';
    const proof = state.projects.find(p => p.title && (mine.length ? mine.some(m => (p.title + p.desc).toLowerCase().includes(m.split(/[ &/]/)[0].toLowerCase())) : true)) || state.projects.find(p => p.title);
    const exp = state.experience.find(e => e.role);
    const focus = mine.length ? App.listJoin(mine.slice(0, 2).map(App.lc)) : 'the tasks in your post';
    const sentence = (job.split(/(?<=[.!?])\s+/).find(s => /need|looking|help|want|require/i.test(s)) || '').trim().slice(0, 140);

    const parts = [
      hello,
      mine.length ? `I read your post. It sounds like you need help with ${focus}, and that is exactly what I do. I can start this week.`
        : sentence ? `You mentioned: "${sentence.replace(/[.!?]+$/, '')}." I can take that off your plate starting this week.` : `I read your post and I'd love to help. I can start this week.`,
      `Here's how I'd help:\n` + (mine.length ? mine.slice(0, 3) : state.services.slice(0, 2)).map(s => `• ${s}`).join('\n') + (toolsHit.length ? `\n• Already comfortable with ${App.listJoin(toolsHit)}` : ''),
      [exp ? `I've worked as ${/^[aeiou]/i.test(exp.role) ? 'an' : 'a'} ${App.lc(exp.role)}${exp.org ? ' at ' + exp.org : ''}` : '', proof ? `${exp ? ', and ' : ''}here's a relevant sample: ${proof.title}${proof.result ? ` (${proof.result})` : ''}${App.safeUrl(proof.link) ? ' – ' + App.safeUrl(proof.link) : ''}` : ''].join('').trim() + (exp || proof ? '.' : ''),
      state.availability ? `I'm available ${state.availability}.` : '',
      `Quick question: [ask ONE specific question about their business or the task, e.g. "How many emails come in each day?"]`,
      `Would you be open to a 10-minute call this week? Happy to start with a small paid trial task.`,
      `${gen.firstName()}`
    ].filter(Boolean);
    proposalOut.value = parts.join('\n\n');
    $('jobMatch').innerHTML = matched.length
      ? `<strong>This job wants:</strong> ${matched.map(esc).join(', ')}.` + (gaps.length ? ` <span class="warn">Not in your services yet: ${gaps.map(esc).join(', ')}. Only apply if you can really do these.</span>` : ' <span class="ok">You offer all of these. Great fit!</span>')
      : 'Tip: answer the job post\'s exact questions first. Many clients hide a keyword in the post to see who read it.';
  }

  App.onChange(render);
  render();
})();
