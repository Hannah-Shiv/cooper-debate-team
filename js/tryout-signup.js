(function () {
  "use strict";

  var STORAGE_KEY = "cooper_tryout_signups_v1";
  var ACTIVE_KEY = "cooper_tryout_active_student_v1";
  var STORAGE_VERSION = 1;
  var DEMO_RECORDS = [
    { id: "demo-alex", name: "Alex Rivera", grade: "8", dates: ["sep22", "sep23"], selectedDate: "sep22", mode: "partner", partnerId: "demo-maya", tint: "gold", isDemo: true },
    { id: "demo-maya", name: "Maya Johnson", grade: "8", dates: ["sep22"], selectedDate: "sep22", mode: "partner", partnerId: "demo-alex", tint: "blue", isDemo: true },
    { id: "demo-sam", name: "Sam Kim", grade: "7", dates: ["sep22", "sep23"], selectedDate: "sep23", mode: "partner", partnerId: null, tint: "violet", isDemo: true },
    { id: "demo-noah", name: "Noah Carter", grade: "7", dates: ["sep23"], selectedDate: "sep23", mode: "assign", partnerId: null, tint: "teal", isDemo: true }
  ];
  var DATES = {
    sep22: { weekday: "Tuesday", date: "September 22", shortDate: "Sept 22", location: "Cafeteria" },
    sep23: { weekday: "Wednesday", date: "September 23", shortDate: "Sept 23", location: "Lecture Hall" }
  };
  var state = {
    data: null,
    activeId: null,
    date: "sep22",
    mode: "partner",
    partnerId: null,
    editing: false
  };
  var dom = {};

  function now() { return new Date().toISOString(); }
  function makeId() { return "student-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function normalizeName(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function displayName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts[0] || "Student";
    return parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + ".";
  }
  function initials(name) {
    var parts = displayName(name).replace(".", "").split(/\s+/);
    return parts.map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
  }
  function gradeLabel(grade) { return grade + (grade === "6" ? "th" : grade === "7" ? "th" : "th") + " grade"; }
  function safeRecord(record) {
    if (!record || !record.id || !record.name || !["6", "7", "8"].includes(String(record.grade))) return null;
    var dates = Array.isArray(record.dates) ? record.dates.filter(function (date) { return DATES[date]; }) : [];
    if (!dates.length) return null;
    var mode = record.mode === "assign" ? "assign" : "partner";
    return {
      id: String(record.id), name: String(record.name).trim().slice(0, 80), grade: String(record.grade),
      dates: dates, selectedDate: DATES[record.selectedDate] ? record.selectedDate : dates[0],
      mode: mode, partnerId: record.partnerId ? String(record.partnerId) : null,
      assignedPartnerId: record.assignedPartnerId ? String(record.assignedPartnerId) : null,
      tint: ["gold", "blue", "violet", "teal"].includes(record.tint) ? record.tint : "blue",
      isDemo: Boolean(record.isDemo), withdrawn: Boolean(record.withdrawn),
      createdAt: record.createdAt || now(), updatedAt: record.updatedAt || now()
    };
  }
  function defaultData() {
    return { version: STORAGE_VERSION, records: DEMO_RECORDS.map(function (record) {
      return safeRecord(Object.assign({}, record, { createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }));
    }).filter(Boolean) };
  }
  function loadData() {
    var fallback = defaultData();
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.records)) return fallback;
      return { version: STORAGE_VERSION, records: parsed.records.map(safeRecord).filter(Boolean) };
    } catch (error) {
      showStatus("Local sign-up data could not be read. The demo roster is being used instead.", true);
      return fallback;
    }
  }
  function saveData() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      return true;
    } catch (error) {
      showStatus("This browser is not allowing local storage, so your sign-up could not be saved.", true);
      return false;
    }
  }
  function syncFromStorage() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.records)) return;
      state.data = { version: STORAGE_VERSION, records: parsed.records.map(safeRecord).filter(Boolean) };
    } catch (ignore) {}
  }
  function isDevelopmentHost() {
    var host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".replit.dev");
  }
  function activeRecord() {
    return state.data.records.find(function (record) { return record.id === state.activeId; }) || null;
  }
  function recordById(id) {
    return state.data.records.find(function (record) { return record.id === id; }) || null;
  }
  function isActive(record) { return record && !record.withdrawn; }
  function mutualPartner(record) {
    if (!record || !record.partnerId || record.assignedPartnerId) return null;
    var partner = recordById(record.partnerId);
    return partner && isActive(partner) && !partner.assignedPartnerId && partner.partnerId === record.id ? partner : null;
  }
  function statusFor(record) {
    if (!record) return "new";
    if (record.assignedPartnerId) return "assigned";
    if (record.mode === "assign") return "waiting";
    return mutualPartner(record) ? "mutual" : "pending";
  }
  function statusLabel(status) {
    return { pending: "Pending request", mutual: "Mutual request", assigned: "Coach assigned", waiting: "Waiting for Coach" }[status] || "Ready";
  }
  function publicCandidates() {
    var current = activeRecord();
    return state.data.records.filter(function (record) {
      return isActive(record) && record.id !== (current && current.id) &&
        record.mode === "partner" && record.dates.includes(state.date) &&
        !record.assignedPartnerId && !mutualPartner(record);
    });
  }
  function showStatus(message, isError) {
    dom.status.hidden = !message;
    dom.status.classList.toggle("is-error", Boolean(isError));
    dom.status.innerHTML = message || "";
  }
  function setMessage(element, message) {
    element.hidden = !message;
    element.textContent = message || "";
  }
  function renderDates() {
    dom.dateOptions.innerHTML = Object.keys(DATES).map(function (key) {
      var option = DATES[key];
      var selected = state.date === key;
      return '<button class="tryout-date-card' + (selected ? " is-selected" : "") + '" data-date="' + key + '" type="button" aria-pressed="' + selected + '">' +
        '<span class="tryout-date-check" aria-hidden="true">' + (selected ? "✓" : "") + "</span>" +
        '<span class="tryout-date-weekday">' + option.weekday + "</span>" +
        '<span class="tryout-date-title">' + option.date + "</span>" +
        '<span class="tryout-date-meta"><span aria-hidden="true">●</span>' + option.location + "</span></button>";
    }).join("");
  }
  function renderPartnerPicker() {
    if (state.mode === "assign") {
      dom.partnerPicker.innerHTML = '<div class="tryout-callout is-teal"><span class="tryout-callout-icon" aria-hidden="true">✦</span><span>You’ll be listed as <strong>Waiting to be paired</strong>. Coach will match you with a teammate who fits the same tryout date.</span></div>';
      return;
    }
    var candidates = publicCandidates();
    var list = candidates.length ? candidates.map(function (record) {
      var selected = state.partnerId === record.id;
      var availability = record.dates.length > 1 ? "Available either day" : "Available " + DATES[record.dates[0]].shortDate;
      return '<button class="tryout-student-option' + (selected ? " is-selected" : "") + '" data-partner="' + escapeHtml(record.id) + '" type="button" aria-pressed="' + selected + '">' +
        '<span class="tryout-avatar ' + record.tint + '">' + escapeHtml(initials(record.name)) + "</span>" +
        '<span class="tryout-student-copy"><strong>' + escapeHtml(displayName(record.name)) + "</strong><span>" + escapeHtml(gradeLabel(record.grade) + " · " + availability) + "</span></span>" +
        '<span class="tryout-student-state" aria-label="Opted in">✓ Opted in</span><span class="tryout-student-chevron" aria-hidden="true">›</span></button>';
    }).join("") : '<div class="tryout-no-students">No opted-in students are available for this date yet. You can let Coach pair you instead.</div>';
    dom.partnerPicker.innerHTML = '<div class="tryout-list-label"><span>Students open to pairing</span><span>' + candidates.length + " available for " + DATES[state.date].shortDate + "</span></div>" +
      '<div class="tryout-student-list">' + list + '</div>' +
      '<div class="tryout-callout"><span class="tryout-callout-icon" aria-hidden="true">ⓘ</span><span>Your choice sends a request—not a final pairing. The other student must choose you back, and Coach confirms the final pair.</span></div>';
  }
  function renderSummary() {
    var partner = state.partnerId ? recordById(state.partnerId) : null;
    var target = state.mode === "partner" && partner ? displayName(partner.name) : "Waiting for Coach";
    dom.selectionSummary.innerHTML = '<div><div class="tryout-selection-label">Your selection</div><div class="tryout-selection-value">' +
      DATES[state.date].shortDate + ' <span>· ' + escapeHtml(target) + "</span></div></div><span class=\"tryout-selection-status\">✓ Ready</span>";
  }
  function fillFromRecord(record) {
    if (!record) return;
    state.date = record.selectedDate;
    state.mode = record.mode;
    state.partnerId = record.partnerId;
    dom.studentName.value = record.name;
    dom.studentGrade.value = record.grade;
  }
  function renderMode() {
    dom.modePartner.classList.toggle("is-active", state.mode === "partner");
    dom.modeAssign.classList.toggle("is-active", state.mode === "assign");
    dom.modePartner.setAttribute("aria-pressed", state.mode === "partner");
    dom.modeAssign.setAttribute("aria-pressed", state.mode === "assign");
  }
  function renderStudentStatus() {
    var record = activeRecord();
    if (!record) {
      dom.studentStatus.hidden = true;
      return;
    }
    var status = statusFor(record);
    var partner = record.assignedPartnerId ? recordById(record.assignedPartnerId) : (mutualPartner(record) || recordById(record.partnerId));
    var partnerName = partner ? displayName(partner.name) : "your requested partner";
    var copy = {
      pending: ["Your request is pending", "We’ll show a confirmed pairing here if " + partnerName + " chooses you back. You can change or withdraw this request while it is pending."],
      mutual: ["You have a mutual request", "You and " + partnerName + " chose each other. Coach will make the final pairing decision."],
      assigned: ["Coach assigned your pairing", "Your tryout pairing is with " + partnerName + ". Please arrive at the date shown above."],
      waiting: ["You are waiting for Coach", "You asked Coach to pair you with a teammate who can attend " + DATES[record.selectedDate].shortDate + "."]
    }[status];
    dom.studentStatus.className = "tryout-status-card is-" + status;
    dom.studentStatus.innerHTML = '<h2 id="student-status-heading">' + copy[0] + "</h2><p>" + copy[1] + "</p>" +
      (status === "pending" || status === "waiting" ? '<button class="tryout-secondary-button" data-edit-signup type="button">Change my sign-up</button> <button class="tryout-secondary-button" data-withdraw-signup type="button">Withdraw</button>' : "") +
      '<button class="tryout-secondary-button" data-new-student type="button">Sign up another student</button>';
    dom.studentStatus.hidden = false;
  }
  function renderAll() {
    renderDates();
    renderMode();
    renderPartnerPicker();
    renderSummary();
    renderStudentStatus();
    renderCoach();
    var record = activeRecord();
    var locked = record && (statusFor(record) === "mutual" || statusFor(record) === "assigned") && !state.editing;
    dom.submitSignup.textContent = locked ? "Sign-up received ✓" : (state.editing ? "Save my changes →" : "Submit my sign-up →");
    dom.submitSignup.disabled = Boolean(locked);
    dom.submitSignup.classList.toggle("is-success", Boolean(locked));
  }
  function chooseDate(date) {
    if (!DATES[date]) return;
    state.date = date;
    if (state.partnerId && !publicCandidates().some(function (record) { return record.id === state.partnerId; })) state.partnerId = null;
    setMessage(dom.formError, "");
    renderAll();
  }
  function chooseMode(mode) {
    state.mode = mode === "assign" ? "assign" : "partner";
    if (state.mode === "assign") state.partnerId = null;
    setMessage(dom.formError, "");
    renderAll();
  }
  function validate() {
    var name = dom.studentName.value.trim();
    var grade = dom.studentGrade.value;
    if (name.length < 2) return "Please enter your first and last name.";
    if (name.split(/\s+/).length < 2) return "Please enter both a first and last name.";
    if (!["6", "7", "8"].includes(grade)) return "Please select your grade.";
    if (state.mode === "partner" && !state.partnerId) return "Choose an opted-in partner or select “Let Coach pair me.”";
    return "";
  }
  function submitSignup() {
    var error = validate();
    if (error) { setMessage(dom.formError, error); dom.formError.focus(); return; }
    syncFromStorage();
    var name = dom.studentName.value.trim().replace(/\s+/g, " ");
    var grade = dom.studentGrade.value;
    var existing = state.data.records.find(function (record) { return isActive(record) && normalizeName(record.name) === normalizeName(name) && record.id !== state.activeId; });
    if (existing) {
      setMessage(dom.formError, "A sign-up for this name is already saved in this browser. If this is you, use “Sign up another student” only for a different student.");
      return;
    }
    if (state.mode === "partner") {
      var latestPartner = recordById(state.partnerId);
      if (!latestPartner || !isActive(latestPartner) || latestPartner.mode !== "partner" ||
          !latestPartner.dates.includes(state.date) || latestPartner.assignedPartnerId ||
          mutualPartner(latestPartner)) {
        state.partnerId = null;
        setMessage(dom.formError, "That partner is no longer available for this date. Please choose another option.");
        renderAll();
        return;
      }
    }
    var record = activeRecord();
    if (record && !state.editing && (statusFor(record) === "mutual" || statusFor(record) === "assigned")) return;
    if (!record || !state.editing) {
      record = {
        id: makeId(), name: name, grade: grade, dates: [state.date], selectedDate: state.date,
        mode: state.mode, partnerId: state.partnerId, assignedPartnerId: null, tint: "blue", isDemo: false, createdAt: now(), updatedAt: now()
      };
      state.data.records.push(record);
      state.activeId = record.id;
      state.editing = false;
      try { window.localStorage.setItem(ACTIVE_KEY, state.activeId); } catch (ignore) {}
    } else {
      record.name = name; record.grade = grade; record.dates = [state.date]; record.selectedDate = state.date;
      record.mode = state.mode; record.partnerId = state.partnerId; record.updatedAt = now();
    }
    if (!saveData()) return;
    setMessage(dom.formError, "");
    var mutual = mutualPartner(record);
    setMessage(dom.formMessage, mutual ? "Your sign-up is saved and your request is mutual. Coach will confirm the final pair." : "Your sign-up is saved. You can return to this page in this browser to review your status.");
    state.editing = false;
    renderAll();
    dom.studentStatus.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function editSignup() {
    var record = activeRecord();
    if (!record || ["mutual", "assigned"].includes(statusFor(record))) return;
    state.editing = true;
    fillFromRecord(record);
    setMessage(dom.formMessage, "");
    dom.studentName.focus();
    renderAll();
  }
  function withdrawSignup() {
    syncFromStorage();
    var record = activeRecord();
    if (!record || ["mutual", "assigned"].includes(statusFor(record))) return;
    record.withdrawn = true;
    record.updatedAt = now();
    if (saveData()) {
      state.activeId = null;
      try { window.localStorage.removeItem(ACTIVE_KEY); } catch (ignore) {}
      setMessage(dom.formMessage, "Your sign-up was withdrawn. You can submit a new choice from this page.");
      state.editing = false;
      renderAll();
    }
  }
  function newStudent() {
    state.activeId = null; state.editing = false; state.date = "sep22"; state.mode = "partner"; state.partnerId = null;
    try { window.localStorage.removeItem(ACTIVE_KEY); } catch (ignore) {}
    dom.studentName.value = ""; dom.studentGrade.value = "";
    setMessage(dom.formMessage, "Ready for another student’s sign-up.");
    renderAll();
    dom.studentName.focus();
  }
  function assignPair(studentId, partnerId) {
    if (!studentId || !partnerId || studentId === partnerId) return;
    syncFromStorage();
    var student = recordById(studentId), partner = recordById(partnerId);
    if (!student || !partner || !isActive(student) || !isActive(partner)) return;
    if (student.assignedPartnerId || partner.assignedPartnerId) {
      showStatus("That student already has a confirmed assignment. Remove the existing assignment before changing it.", true);
      return;
    }
    if (student.selectedDate !== partner.selectedDate) {
      showStatus("Both students must have the same selected tryout date.", true);
      return;
    }
    state.data.records.forEach(function (record) {
      if (record.partnerId === student.id || record.partnerId === partner.id || record.id === student.id || record.id === partner.id) {
        record.partnerId = null;
        record.updatedAt = now();
      }
    });
    student.assignedPartnerId = partner.id; partner.assignedPartnerId = student.id;
    student.updatedAt = now(); partner.updatedAt = now();
    if (saveData()) { showStatus("Coach assignment saved for " + displayName(student.name) + " and " + displayName(partner.name) + "."); renderAll(); }
  }
  function unassignPair(studentId) {
    syncFromStorage();
    var student = recordById(studentId);
    if (!student || !student.assignedPartnerId) return;
    var partner = recordById(student.assignedPartnerId);
    student.assignedPartnerId = null;
    student.mode = "assign";
    student.updatedAt = now();
    if (partner && partner.assignedPartnerId === student.id) {
      partner.assignedPartnerId = null;
      partner.mode = "assign";
      partner.updatedAt = now();
    }
    if (saveData()) {
      showStatus("Coach assignment removed. Both students are available for a new decision.");
      renderAll();
    }
  }
  function renderCoach() {
    if (!dom.coachPanel || !isDevelopmentHost() || !new URLSearchParams(window.location.search).has("coach")) return;
    var records = state.data.records.filter(isActive);
    var mutual = records.filter(function (record) { return statusFor(record) === "mutual"; });
    var assigned = records.filter(function (record) { return statusFor(record) === "assigned"; });
    var unmatched = records.filter(function (record) { return statusFor(record) === "pending" || statusFor(record) === "waiting"; });
    dom.coachSummary.innerHTML = [
      ["total", records.length], ["mutual pairs", mutual.length / 2], ["waiting", unmatched.length], ["assigned pairs", assigned.length / 2]
    ].map(function (stat) { return '<div class="tryout-coach-stat"><strong>' + stat[1] + '</strong><span>' + stat[0] + "</span></div>"; }).join("");
    function studentMeta(record) { return escapeHtml(gradeLabel(record.grade) + " · " + DATES[record.selectedDate].shortDate + " · " + (record.mode === "assign" ? "Coach assignment" : "partner request")); }
    function card(record, controls) {
      return '<div class="tryout-coach-card"><div><strong>' + escapeHtml(record.name) + '</strong><small>' + studentMeta(record) + "</small></div>" + controls + "</div>";
    }
    var mutualHtml = mutual.filter(function (record) { return record.id < (record.partnerId || ""); }).map(function (record) {
      var partner = recordById(record.partnerId);
      return card(record, '<span class="tryout-coach-action" aria-label="Mutual with ' + escapeHtml(displayName(partner.name)) + '">↔ ' + escapeHtml(displayName(partner.name)) + '</span><button class="tryout-coach-action" data-confirm-student="' + escapeHtml(record.id) + '" data-confirm-partner="' + escapeHtml(partner.id) + '" type="button">Confirm</button>');
    }).join("");
    var waitingHtml = unmatched.map(function (record) {
      var options = records.filter(function (candidate) { return candidate.id !== record.id && candidate.selectedDate === record.selectedDate && !candidate.assignedPartnerId; });
      var select = '<select data-assign-for="' + escapeHtml(record.id) + '" aria-label="Choose a partner for ' + escapeHtml(record.name) + '"><option value="">Choose partner…</option>' +
        options.map(function (candidate) { return '<option value="' + escapeHtml(candidate.id) + '">' + escapeHtml(displayName(candidate.name)) + " · " + gradeLabel(candidate.grade) + "</option>"; }).join("") + "</select>";
      return card(record, select + '<button class="tryout-coach-action" data-assign-student="' + escapeHtml(record.id) + '" type="button">Assign</button>');
    }).join("");
    var assignedHtml = assigned.filter(function (record) { return record.id < (record.assignedPartnerId || ""); }).map(function (record) {
      var partner = recordById(record.assignedPartnerId);
      return card(record, '<span class="tryout-coach-action">✓ ' + escapeHtml(partner ? displayName(partner.name) : "Partner") + '</span><button class="tryout-coach-action" data-unassign-student="' + escapeHtml(record.id) + '" type="button">Remove</button>');
    }).join("");
    dom.coachQueues.innerHTML =
      '<section class="tryout-coach-queue"><h3>Mutual requests</h3><p>Both students chose each other. Coach still confirms the final pair.</p>' + (mutualHtml || '<div class="tryout-coach-empty">No mutual requests yet.</div>') + "</section>" +
      '<section class="tryout-coach-queue"><h3>Needs a pairing decision</h3><p>Private Coach view only. Choose a same-date partner to assign both students at once.</p>' + (waitingHtml || '<div class="tryout-coach-empty">Everyone currently has a pairing decision.</div>') + "</section>" +
      '<section class="tryout-coach-queue"><h3>Confirmed assignments</h3><p>Remove an assignment before selecting a different partner for either student.</p>' + (assignedHtml || '<div class="tryout-coach-empty">No Coach-confirmed assignments yet.</div>') + "</section>";
  }
  function resetDemo() {
    if (!window.confirm("Reset local tryout sign-up data to the sample roster?")) return;
    state.data = defaultData(); state.activeId = null; state.editing = false; state.date = "sep22"; state.mode = "partner"; state.partnerId = null;
    try { window.localStorage.removeItem(ACTIVE_KEY); } catch (ignore) {}
    saveData(); dom.studentName.value = ""; dom.studentGrade.value = "";
    showStatus("Demo data reset. Four sample students are available again.");
    renderAll();
  }
  function init() {
    dom = {
      status: document.getElementById("tryout-status"), dateOptions: document.getElementById("date-options"),
      form: document.getElementById("tryout-form"), coachLink: document.getElementById("coach-link"),
      partnerPicker: document.getElementById("partner-picker"), modePartner: document.getElementById("mode-partner"),
      modeAssign: document.getElementById("mode-assign"), studentName: document.getElementById("student-name"),
      studentGrade: document.getElementById("student-grade"), selectionSummary: document.getElementById("selection-summary"),
      formError: document.getElementById("form-error"), formMessage: document.getElementById("form-message"),
      submitSignup: document.getElementById("submit-signup"), studentStatus: document.getElementById("student-status"),
      coachPanel: document.getElementById("coach-panel"), coachSummary: document.getElementById("coach-summary"),
      coachQueues: document.getElementById("coach-queues"), resetDemo: document.getElementById("reset-demo")
    };
    state.data = loadData();
    try { state.activeId = window.localStorage.getItem(ACTIVE_KEY); } catch (ignore) {}
    var record = activeRecord();
    if (record) fillFromRecord(record);
    if (isDevelopmentHost()) {
      dom.coachLink.hidden = false;
      if (new URLSearchParams(window.location.search).has("coach")) dom.coachPanel.hidden = false;
    }
    dom.dateOptions.addEventListener("click", function (event) { var button = event.target.closest("[data-date]"); if (button) chooseDate(button.dataset.date); });
    dom.partnerPicker.addEventListener("click", function (event) { var button = event.target.closest("[data-partner]"); if (button) { state.partnerId = button.dataset.partner; setMessage(dom.formError, ""); renderAll(); } });
    dom.modePartner.addEventListener("click", function () { chooseMode("partner"); });
    dom.modeAssign.addEventListener("click", function () { chooseMode("assign"); });
    dom.form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitSignup();
    });
    dom.studentName.addEventListener("input", function () { setMessage(dom.formError, ""); });
    dom.studentGrade.addEventListener("change", function () { setMessage(dom.formError, ""); });
    dom.studentStatus.addEventListener("click", function (event) {
      if (event.target.closest("[data-edit-signup]")) editSignup();
      if (event.target.closest("[data-withdraw-signup]")) withdrawSignup();
      if (event.target.closest("[data-new-student]")) newStudent();
    });
    dom.coachQueues.addEventListener("click", function (event) {
      var confirmButton = event.target.closest("[data-confirm-student]");
      if (confirmButton) {
        assignPair(confirmButton.dataset.confirmStudent, confirmButton.dataset.confirmPartner);
        return;
      }
      var removeButton = event.target.closest("[data-unassign-student]");
      if (removeButton) {
        unassignPair(removeButton.dataset.unassignStudent);
        return;
      }
      var button = event.target.closest("[data-assign-student]");
      if (!button) return;
      var select = dom.coachQueues.querySelector('[data-assign-for="' + button.dataset.assignStudent + '"]');
      if (select) assignPair(button.dataset.assignStudent, select.value);
    });
    dom.resetDemo.addEventListener("click", resetDemo);
    window.addEventListener("storage", function (event) {
      if (event.key !== STORAGE_KEY) return;
      syncFromStorage();
      if (!state.editing) {
        var latestActive = activeRecord();
        if (latestActive) fillFromRecord(latestActive);
      }
      showStatus("Tryout data changed in another tab. This view has been refreshed.");
      renderAll();
    });
    renderAll();
  }
  document.addEventListener("DOMContentLoaded", init);
}());