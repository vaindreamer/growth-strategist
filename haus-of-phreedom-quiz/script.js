(function () {
  "use strict";

  // ---- Config -----------------------------------------------------------
  // GHL_WEBHOOK_URL: paste the URL from a GoHighLevel workflow that starts
  //   with an "Inbound Webhook" trigger. That trigger auto-generates a URL
  //   you can POST JSON to with no API key needed. See README.md for the
  //   step-by-step setup.
  // DISCOVERY_CALL_URL: your GHL (or Calendly) booking calendar link, used
  //   for the Green and Yellow result CTAs.
  var CONFIG = {
    GHL_WEBHOOK_URL: null, // TODO: paste your GHL Inbound Webhook trigger URL
    DISCOVERY_CALL_URL: "#book-a-call" // TODO: paste your real booking calendar link
  };

  var TIER_RANK = { green: 0, yellow: 1, red: 2 };
  var TOTAL_QUESTIONS = 6;

  var panelLanding = document.getElementById("panel-landing");
  var panelQuiz = document.getElementById("panel-quiz");
  var panelCapture = document.getElementById("panel-capture");
  var panelResults = document.getElementById("panel-results");
  var startBtn = document.getElementById("startBtn");
  var backBtn = document.getElementById("backBtn");
  var restartBtn = document.getElementById("restartBtn");
  var tapeEl = document.getElementById("tape");
  var tapeStatus = document.getElementById("tapeStatus");
  var captureForm = document.getElementById("captureForm");

  var answers = {}; // { "1": "green", ... }
  var step = 1;
  var pendingTier = null;

  // Build the measuring-tape progress segments
  for (var i = 0; i < TOTAL_QUESTIONS; i++) {
    var seg = document.createElement("div");
    seg.className = "tape-seg";
    tapeEl.appendChild(seg);
  }
  var segments = tapeEl.querySelectorAll(".tape-seg");

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function updateTape() {
    segments.forEach(function (seg, idx) {
      var qNum = idx + 1;
      seg.classList.toggle("is-done", qNum < step);
      seg.classList.toggle("is-current", qNum === step);
    });
    tapeStatus.textContent = "Section " + pad(step) + " / " + pad(TOTAL_QUESTIONS);
  }

  function showStep(n) {
    document.querySelectorAll(".q-card[data-step]").forEach(function (card) {
      card.hidden = Number(card.dataset.step) !== n;
    });
    backBtn.hidden = n === 1;
    updateTape();
  }

  function showOnly(panel) {
    [panelLanding, panelQuiz, panelCapture, panelResults].forEach(function (p) {
      p.hidden = p !== panel;
    });
  }

  function startQuiz() {
    answers = {};
    step = 1;
    document.querySelectorAll(".q-option").forEach(function (opt) {
      opt.classList.remove("is-selected");
    });
    showOnly(panelQuiz);
    showStep(1);
  }

  function selectOption(optionEl) {
    var group = optionEl.closest(".q-options");
    var qNum = group.dataset.question;
    group.querySelectorAll(".q-option").forEach(function (opt) {
      opt.classList.remove("is-selected");
    });
    optionEl.classList.add("is-selected");
    answers[qNum] = optionEl.dataset.tier;

    window.setTimeout(function () {
      if (Number(qNum) < TOTAL_QUESTIONS) {
        step = Number(qNum) + 1;
        showStep(step);
      } else {
        pendingTier = computeTier();
        showOnly(panelCapture);
        panelCapture.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 260);
  }

  function computeTier() {
    var worst = "green";
    Object.keys(answers).forEach(function (q) {
      if (TIER_RANK[answers[q]] > TIER_RANK[worst]) worst = answers[q];
    });
    return worst;
  }

  // Sends the full quiz payload to a GHL Inbound Webhook trigger, if one
  // is configured. GHL will surface every top-level key (tier, answers,
  // name, email, ...) as a trigger value your workflow can branch on.
  function sendToGHL(contact, tier) {
    if (!CONFIG.GHL_WEBHOOK_URL) return Promise.resolve();
    var payload = {
      name: contact.name,
      email: contact.email,
      tier: tier, // "green" | "yellow" | "red"
      answers: answers, // { "1": "green", "2": "yellow", ... }
      quiz: "journee-readiness-quiz",
      submittedAt: new Date().toISOString()
    };
    return fetch(CONFIG.GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function (err) {
      console.error("GHL webhook failed", err);
    });
  }

  function revealResults(tier, contact) {
    showOnly(panelResults);
    ["green", "yellow", "red"].forEach(function (t) {
      document.getElementById("result-" + t).hidden = t !== tier;
    });

    document.querySelectorAll('[data-role="book-call"]').forEach(function (link) {
      link.href = CONFIG.DISCOVERY_CALL_URL;
    });

    var redConfirm = document.getElementById("redConfirm");
    if (redConfirm && contact.email) {
      redConfirm.textContent = "A short resource series is on its way to " + contact.email + " — no spam, unsubscribe anytime.";
    }

    var live = document.getElementById("result-" + tier);
    if (live) live.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.querySelectorAll(".q-option").forEach(function (opt) {
    opt.addEventListener("click", function () {
      selectOption(opt);
    });
  });

  backBtn.addEventListener("click", function () {
    if (step > 1) {
      step -= 1;
      showStep(step);
    }
  });

  startBtn.addEventListener("click", startQuiz);

  restartBtn.addEventListener("click", function () {
    answers = {};
    pendingTier = null;
    captureForm.reset();
    showOnly(panelLanding);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  captureForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var contact = {
      name: document.getElementById("captureName").value.trim(),
      email: document.getElementById("captureEmail").value.trim()
    };
    var submitBtn = captureForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    sendToGHL(contact, pendingTier).then(function () {
      revealResults(pendingTier, contact);
      submitBtn.disabled = false;
    });
  });
})();
