/* Cooper Debate Team — in-page browser-only tryout signup */
(function () {
  "use strict";

  var STORAGE_KEY = "cooper_tryout_signups_v1";
  var ACTIVE_KEY = "cooper_tryout_active_student_v1";
  var WRITE_LOCK = "cooper-tryout-signups-write";
  var FALLBACK_LOCK_KEY = "cooper_tryout_signups_write_lock_v1";
  var VERSION = 1;
  var DATES = {
    sep22: { weekday: "Tuesday", date: "September 22", shortDate: "Sept 22", location: "Cafeteria" },
    sep23: { weekday: "Wednesday", date: "September 23", shortDate: "Sept 23", location: "Lecture Hall" }
  };
  var DEMO_RECORDS = [
    { id: "demo-alex", name: "Alex Rivera", grade: "8", dates: ["sep22", "sep23"], selectedDate: "sep22", mode: "partner", partnerId: "demo-maya", tint: "gold", isDemo: true },
    { id: "demo-maya", name: "Maya Johnson", grade: "8", dates: ["sep22"], selectedDate: "sep22", mode: "partner", partnerId: "demo-alex", tint: "blue", isDemo: true },
    { id: "demo-sam", name: "Sam Kim", grade: "7", dates: ["sep22", "sep23"], selectedDate: "sep23", mode: "partner", partnerId: null, tint: "violet", isDemo: true },
    { id: "demo-noah", name: "Noah Carter", grade: "7", dates: ["sep23"], selectedDate: "sep23", mode: "assign", partnerId: null, tint: "teal", isDemo: true }
  ];
  var state = { data: null, activeId: null, date: "sep22", mode: "partner", partnerId: null, step: 1, editing: false };
  var dom = {};

  function $(id) { return document.getElementById(id); }
  function now() { return new Date().toISOString(); }
  function makeId() { return "student-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function normalized(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function displayName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + "." : parts[0] || "Student";
  }
  function initials(name) { return displayName(name).replace(".", "").split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
  function gradeLabel(grade) { return grade + "th grade"; }
  function safeRecord(record) {
    if (!record || !record.id || !record.name || !["6", "7", "8"].includes(String(record.grade))) return null;
    var dates = Array.isArray(record.dates) ? record.dates.filter(function (key) { return DATES[key]; }) : [];
    if (!dates.length) return null;
    return {
      id: String(record.id), name: String(record.name).trim().slice(0, 80), grade: String(record.grade),
      dates: dates, selectedDate: DATES[record.selectedDate] ? record.selectedDate : dates[0],
      mode: record.mode === "assign" ? "assign" : "partner", partnerId: record.partnerId ? String(record.partnerId) : null,
      assignedPartnerId: record.assignedPartnerId ? String(record.assignedPartnerId) : null,
      tint: ["gold", "blue", "violet", "teal"].includes(record.tint) ? record.tint : "blue",
      isDemo: Boolean(record.isDemo), withdrawn: Boolean(record.withdrawn),
      createdAt: record.createdAt || now(), updatedAt: record.updatedAt || now()
    };
  }
  function defaultData() {
    return { version: VERSION, revision: 0, records: DEMO_RECORDS.map(function (record) {
      return safeRecord(Object.assign({}, record, { createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }));
    }).filter(Boolean) };
  }
  function loadData() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "");
      if (parsed && parsed.version === VERSION && Array.isArray(parsed.records)) return { version: VERSION, revision: Number(parsed.revision) || 0, records: parsed.records.map(safeRecord).filter(Boolean) };
    } catch (ignore) {}
    return defaultData();
  }
  function syncData() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "");
      if (parsed && parsed.version === VERSION && Array.isArray(parsed.records)) state.data = { version: VERSION, revision: Number(parsed.revision) || 0, records: parsed.records.map(safeRecord).filter(Boolean) };
    } catch (ignore) {}
  }
  function saveData() {
    try { state.data.revision = (Number(state.data.revision) || 0) + 1; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); return true; }
    catch (ignore) { showMessage("Your browser blocked local storage, so this sign-up could not be saved.", true); return false; }
  }
  function withWriteLock(callback) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request(WRITE_LOCK, callback);
    var owner = makeId(), deadline = Date.now() + 2500;
    return new Promise(function (resolve, reject) {
      function release() {
        try {
          var held = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) || "null");
          if (held && held.owner === owner) window.localStorage.removeItem(FALLBACK_LOCK_KEY);
        } catch (ignore) {}
      }
      function attempt() {
        try {
          var timestamp = Date.now();
          var held = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) || "null");
          if (!held || !held.owner || Number(held.expires) < timestamp) {
            window.localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify({ owner: owner, expires: timestamp + 4000 }));
            held = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) || "null");
            if (held && held.owner === owner) {
              try { resolve(callback()); } catch (error) { reject(error); } finally { release(); }
              return;
            }
          }
          if (timestamp >= deadline) {
            showMessage("Another tryout update is still being saved. Please try again.", true);
            reject(new Error("Tryout write lock timed out."));
            return;
          }
          window.setTimeout(attempt, 35);
        } catch (error) {
          reject(error);
        }
      }
      attempt();
    });
  }
  function activeRecord() { return state.data.records.find(function (record) { return record.id === state.activeId; }) || null; }
  function recordById(id) { return state.data.records.find(function (record) { return record.id === id; }) || null; }
  function active(record) { return record && !record.withdrawn; }
  function mutual(record) {
    if (!record || !record.partnerId || record.assignedPartnerId) return null;
    var partner = recordById(record.partnerId);
    return partner && active(partner) && !partner.assignedPartnerId && partner.partnerId === record.id ? partner : null;
  }
  function statusFor(record) {
    if (!record) return "new";
    if (record.assignedPartnerId) return "assigned";
    if (record.mode === "assign") return "waiting";
    return mutual(record) ? "mutual" : "pending";
  }
  function currentCandidates() {
    var current = activeRecord();
    return state.data.records.filter(function (record) {
      return active(record) && record.id !== (current && current.id) && record.mode === "partner" &&
        record.dates.includes(state.date) && !record.assignedPartnerId && !mutual(record);
    });
  }
  function showMessage(message, error) {
    dom.status.hidden = !message; dom.status.textContent = message || "";
    dom.status.className = "tourney-tryout-status" + (error ? " is-error" : "");
  }
  function formMessage(message, error) {
    dom.error.hidden = !message; dom.error.textContent = message || "";
    dom.error.className = "tourney-tryout-message " + (error ? "is-error" : "is-success");
  }
  function renderProgress() {
    dom.screens.forEach(function (screen) { var current = Number(screen.dataset.tryoutStep) === state.step; screen.hidden = !current; screen.classList.toggle("is-current", current); });
    dom.progress.forEach(function (item) {
      var number = Number(item.dataset.tryoutProgress);
      item.classList.toggle("is-current", number === state.step);
      item.classList.toggle("is-active", number <= state.step);
    });
    dom.back.hidden = state.step === 1;
    dom.continue.textContent = state.step === 3 ? (state.editing ? "Save changes →" : "Submit my sign-up →") : "Continue →";
    if (state.step === 3) renderReview();
  }
  function renderDates() {
    dom.dates.innerHTML = Object.keys(DATES).map(function (key) {
      var option = DATES[key], selected = key === state.date;
      return '<button class="tourney-tryout-date-card' + (selected ? " is-selected" : "") + '" data-date="' + key + '" type="button" aria-pressed="' + selected + '">' +
        "<b>" + option.weekday + "</b><strong>" + option.date + '</strong><span>' + option.location + ' · 2:30–4:30 PM</span><em aria-hidden="true">' + (selected ? "✓" : "") + "</em></button>";
    }).join("");
  }
  function renderPairing() {
    dom.modePartner.classList.toggle("is-selected", state.mode === "partner");
    dom.modeAssign.classList.toggle("is-selected", state.mode === "assign");
    dom.modePartner.setAttribute("aria-pressed", state.mode === "partner");
    dom.modeAssign.setAttribute("aria-pressed", state.mode === "assign");
    if (state.mode === "assign") {
      dom.picker.innerHTML = '<div class="tourney-tryout-callout is-teal"><strong>Waiting for Coach</strong><br>You’ll be matched with a teammate who can attend ' + DATES[state.date].shortDate + ".</div>";
      return;
    }
    var candidates = currentCandidates();
    var list = candidates.length ? candidates.map(function (record) {
      var selected = record.id === state.partnerId;
      var availability = record.dates.length > 1 ? "Available either day" : "Available " + DATES[record.dates[0]].shortDate;
      return '<button class="tourney-tryout-student' + (selected ? " is-selected" : "") + '" data-partner="' + escapeHtml(record.id) + '" type="button" aria-pressed="' + selected + '">' +
        '<span class="tourney-tryout-avatar ' + record.tint + '">' + escapeHtml(initials(record.name)) + '</span><span class="tourney-tryout-student-copy"><strong>' +
        escapeHtml(displayName(record.name)) + "</strong><small>" + escapeHtml(gradeLabel(record.grade) + " · " + availability) + '</small></span><span class="tourney-tryout-student-status">✓ Opted in</span><span class="tourney-tryout-chevron" aria-hidden="true">›</span></button>';
    }).join("") : '<div class="tourney-tryout-empty">No opted-in students are available for this date yet. You can let Coach pair you instead.</div>';
    dom.picker.innerHTML = '<div class="tourney-tryout-list-label"><span>Students open to pairing</span><span>' + candidates.length + " available for " + DATES[state.date].shortDate + "</span></div>" +
      '<div class="tourney-tryout-students">' + list + '</div><div class="tourney-tryout-callout">Your choice sends a request, not a final pairing. The other student must choose you back.</div>';
  }
  function renderReview() {
    var partner = state.partnerId && recordById(state.partnerId);
    var target = state.mode === "partner" && partner ? displayName(partner.name) : "Waiting for Coach";
    dom.review.innerHTML = '<div><span>Tryout session</span><strong>' + DATES[state.date].shortDate + " · " + DATES[state.date].location + "</strong></div>" +
      '<div><span>Pairing preference</span><strong>' + escapeHtml(target) + "</strong></div>";
  }
  function renderResult() {
    var record = activeRecord();
    if (!record) { dom.result.hidden = true; return; }
    var status = statusFor(record);
    var partner = record.assignedPartnerId ? recordById(record.assignedPartnerId) : (mutual(record) || recordById(record.partnerId));
    var partnerName = partner ? displayName(partner.name) : "your requested partner";
    var copy = {
      pending: ["Request saved", "Your request for " + partnerName + " is pending. They must choose you back before Coach confirms the pair."],
      mutual: ["Mutual request", "You and " + partnerName + " chose each other. Coach will make the final pairing decision."],
      assigned: ["Coach assigned your pairing", "Your tryout pairing is with " + partnerName + ". Please arrive at the session shown above."],
      waiting: ["Waiting for Coach", "You asked Coach to pair you with a teammate who can attend " + DATES[record.selectedDate].shortDate + "."]
    }[status];
    dom.result.className = "tourney-tryout-result is-" + status;
    dom.result.innerHTML = "<h3>" + copy[0] + "</h3><p>" + copy[1] + "</p>" +
      ((status === "pending" || status === "waiting") ? '<div class="tourney-tryout-result-actions"><button type="button" data-tryout-edit>Change my sign-up</button><button type="button" data-tryout-withdraw>Withdraw</button></div>' : "") +
      '<div class="tourney-tryout-result-actions"><button type="button" data-tryout-new>Sign up another student</button></div>';
    dom.result.hidden = false;
  }
  function renderAll() { renderDates(); renderPairing(); renderProgress(); renderResult(); }
  function fillRecord(record) {
    if (!record) return;
    state.date = record.selectedDate; state.mode = record.mode; state.partnerId = record.partnerId;
    dom.name.value = record.name; dom.grade.value = record.grade;
  }
  function chooseDate(date) {
    if (!DATES[date]) return;
    state.date = date;
    if (state.partnerId && !currentCandidates().some(function (record) { return record.id === state.partnerId; })) state.partnerId = null;
    formMessage(""); renderAll();
  }
  function chooseMode(mode) { state.mode = mode === "assign" ? "assign" : "partner"; if (state.mode === "assign") state.partnerId = null; formMessage(""); renderPairing(); }
  function validateStep() {
    if (state.step === 2 && state.mode === "partner" && !state.partnerId) return "Choose an opted-in partner or select “Let Coach pair me.”";
    if (state.step === 3) {
      if (dom.name.value.trim().split(/\s+/).length < 2) return "Please enter the student's first and last name.";
      if (!["6", "7", "8"].includes(dom.grade.value)) return "Please select the student's grade.";
    }
    return "";
  }
  function submit() {
    var error = validateStep();
    if (error) { formMessage(error, true); dom.error.focus(); return; }
    return withWriteLock(function () {
      syncData();
      var name = dom.name.value.trim().replace(/\s+/g, " "), grade = dom.grade.value;
      var duplicate = state.data.records.find(function (record) { return active(record) && normalized(record.name) === normalized(name) && record.id !== state.activeId; });
      if (duplicate) { formMessage("A sign-up for this name is already saved in this browser. Use “Sign up another student” only for a different student.", true); dom.error.focus(); return; }
      if (state.mode === "partner") {
        var partner = recordById(state.partnerId);
        if (!partner || !active(partner) || partner.mode !== "partner" || !partner.dates.includes(state.date) || partner.assignedPartnerId || mutual(partner)) {
          state.partnerId = null; renderPairing(); formMessage("That partner is no longer available for this date. Please choose another option.", true); dom.error.focus(); return;
        }
      }
      var record = activeRecord();
      if (record && !state.editing && ["mutual", "assigned"].includes(statusFor(record))) return;
      if (!record) {
        record = { id: makeId(), name: name, grade: grade, dates: [state.date], selectedDate: state.date, mode: state.mode, partnerId: state.partnerId, assignedPartnerId: null, tint: "blue", isDemo: false, createdAt: now(), updatedAt: now() };
        state.data.records.push(record); state.activeId = record.id;
        try { window.localStorage.setItem(ACTIVE_KEY, state.activeId); } catch (ignore) {}
      } else {
        record.name = name; record.grade = grade; record.dates = [state.date]; record.selectedDate = state.date; record.mode = state.mode; record.partnerId = state.partnerId; record.updatedAt = now();
      }
      if (!saveData()) return;
      state.editing = false; state.step = 1; formMessage("Your sign-up is saved. Return to this page in this browser to review your status.");
      renderAll(); dom.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  function edit() { var record = activeRecord(); if (!record || ["mutual", "assigned"].includes(statusFor(record))) return; state.editing = true; fillRecord(record); state.step = 1; formMessage(""); renderAll(); dom.name.focus(); }
  function withdraw() {
    if (!window.confirm("Withdraw this tryout sign-up?")) return;
    return withWriteLock(function () {
      syncData(); var record = activeRecord(); if (!record || ["mutual", "assigned"].includes(statusFor(record))) return;
      record.withdrawn = true; record.updatedAt = now();
      if (saveData()) { state.activeId = null; state.editing = false; try { window.localStorage.removeItem(ACTIVE_KEY); } catch (ignore) {} formMessage("Your sign-up was withdrawn. You can submit a new choice from this page."); renderAll(); }
    });
  }
  function newStudent() {
    state.activeId = null; state.editing = false; state.step = 1; state.date = "sep22"; state.mode = "partner"; state.partnerId = null;
    try { window.localStorage.removeItem(ACTIVE_KEY); } catch (ignore) {}
    dom.name.value = ""; dom.grade.value = ""; formMessage("Ready for another student’s sign-up."); renderAll(); dom.name.focus();
  }
  function init() {
    dom = { status: $("tourney-tryout-status"), dates: $("tourney-tryout-date-options"), picker: $("tourney-tryout-partner-picker"), modePartner: $("tourney-tryout-mode-partner"), modeAssign: $("tourney-tryout-mode-assign"), name: $("tourney-tryout-name"), grade: $("tourney-tryout-grade"), review: $("tourney-tryout-review"), form: $("tourney-tryout-form"), error: $("tourney-tryout-error"), message: $("tourney-tryout-message"), back: $("tourney-tryout-back"), continue: $("tourney-tryout-continue"), result: $("tourney-tryout-student-status"), screens: Array.from(document.querySelectorAll("[data-tryout-step]")), progress: Array.from(document.querySelectorAll("[data-tryout-progress]")) };
    state.data = loadData();
    try { state.activeId = window.localStorage.getItem(ACTIVE_KEY); } catch (ignore) {}
    fillRecord(activeRecord());
    dom.dates.addEventListener("click", function (event) { var button = event.target.closest("[data-date]"); if (button) chooseDate(button.dataset.date); });
    dom.picker.addEventListener("click", function (event) { var button = event.target.closest("[data-partner]"); if (button) { state.partnerId = button.dataset.partner; formMessage(""); renderPairing(); } });
    dom.modePartner.addEventListener("click", function () { chooseMode("partner"); }); dom.modeAssign.addEventListener("click", function () { chooseMode("assign"); });
    dom.form.addEventListener("submit", function (event) { event.preventDefault(); submit(); });
    dom.continue.addEventListener("click", function () { if (state.step < 3) { var error = validateStep(); if (error) { formMessage(error, true); dom.error.focus(); return; } state.step += 1; formMessage(""); renderAll(); } else submit(); });
    dom.back.addEventListener("click", function () { if (state.step > 1) { state.step -= 1; formMessage(""); renderAll(); } });
    dom.name.addEventListener("input", function () { formMessage(""); }); dom.grade.addEventListener("change", function () { formMessage(""); });
    dom.result.addEventListener("click", function (event) { if (event.target.closest("[data-tryout-edit]")) edit(); if (event.target.closest("[data-tryout-withdraw]")) withdraw(); if (event.target.closest("[data-tryout-new]")) newStudent(); });
    window.addEventListener("storage", function (event) { if (event.key !== STORAGE_KEY) return; syncData(); fillRecord(activeRecord()); showMessage("Tryout data changed in another tab. This view has been refreshed."); renderAll(); });
    renderAll();
  }
  document.addEventListener("DOMContentLoaded", function () { if ($("tourney-tryout-form")) init(); });
}());