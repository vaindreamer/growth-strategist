(function () {
  "use strict";

  // ---- Config: swap these for your real booking + CRM endpoints ----
  var CONFIG = {
    DISCOVERY_CALL_URL: "#book-a-call", // TODO: replace with real Calendly / GHL calendar link
    NURTURE_WEBHOOK_URL: null            // TODO: replace with real CRM/webhook endpoint, or leave null
  };

  var TIER_RANK = { green: 0, yellow: 1, red: 2 };
  var TOTAL_QUESTIONS = 6;

  var panelLanding = document.getElementById("panel-landing");
  var panelQuiz = document.getElementById("panel-quiz");
  var panelResults = document.getElementById("panel-results");
  var startBtn = document.getElementById("startBtn");
  var backBtn = document.getElementById("backBtn");
  var restartBtn = document.getElementById("restartBtn");
  var tapeEl = document.getElementById("tape");
  var tapeStatus = document.getElementById("tapeStatus");
  var nurtureForm = document.getElementById("nurtureForm");
  var nurtureNote = document.getElementById("nurtureNote");

  var answers = {}; // { "1": "green", ... }
  var step = 1;

  // Build the measuring-tape progress segments
  for (var i = 0; i < TOTAL_QUESTIONS; i++) {
    var seg = document.createElement("div");
    seg.className = "tape-seg";
    tapeEl.appendChild(seg);
  }
  var segments = tapeEl.querySelectorAll(".tape-seg");

  function updateTape() {
    segments.forEach(function (seg, idx) {
      var qNum = idx + 1;
      seg.classList.toggle("is-done", qNum < step);
      seg.classList.toggle("is-current", qNum === step);
    });
    tapeStatus.textContent = "Section " + pad(step) + " / " + pad(TOTAL_QUESTIONS);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function showStep(n) {
    document.querySelectorAll(".q-card").forEach(function (card) {
      card.hidden = Number(card.dataset.step) !== n;
    });
    backBtn.hidden = n === 1;
    updateTape();
  }

  function goToLanding() {
    panelLanding.hidden = false;
    panelQuiz.hidden = true;
    panelResults.hidden = true;
  }

  function startQuiz() {
    answers = {};
    step = 1;
    document.querySelectorAll(".q-option").forEach(function (opt) {
      opt.classList.remove("is-selected");
    });
    panelLanding.hidden = true;
    panelResults.hidden = true;
    panelQuiz.hidden = false;
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
        finishQuiz();
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

  function finishQuiz() {
    var tier = computeTier();
    panelQuiz.hidden = true;
    panelResults.hidden = false;
    ["green", "yellow", "red"].forEach(function (t) {
      document.getElementById("result-" + t).hidden = t !== tier;
    });

    var bookLinks = document.querySelectorAll('[data-role="book-call"]');
    bookLinks.forEach(function (link) {
      link.href = CONFIG.DISCOVERY_CALL_URL;
    });

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
    goToLanding();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  if (nurtureForm) {
    nurtureForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (CONFIG.NURTURE_WEBHOOK_URL) {
        fetch(CONFIG.NURTURE_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: document.getElementById("nurtureEmail").value })
        }).catch(function () {});
      }
      nurtureForm.hidden = true;
      nurtureNote.textContent = "Thanks — check your inbox. Your readiness resources are on the way.";
    });
  }
})();
