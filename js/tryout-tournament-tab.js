/* Cooper Debate Team — shared FCPS-ID tryout signup */
(function () {
  "use strict";

  var ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/tryoutBoard";
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    storageBucket: "cooper-debate-team.firebasestorage.app",
    messagingSenderId: "112813790184",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d"
  };
  var DATES = {
    sep22: { weekday: "Tuesday", date: "September 22", shortDate: "Sept 22", location: "Cafeteria" },
    sep23: { weekday: "Wednesday", date: "September 23", shortDate: "Sept 23", location: "Lecture Hall" }
  };
  var state = { data: { records: [] }, publicRecords: [], self: null, fcpsId: "", activeId: null, date: "sep22", partnerId: null, boardRow: null, selfPlaced: false, boardVisible: false, editing: false, loading: false, unsubscribe: null, pollTimer: null };
  var dom = {};

  function $(id) { return document.getElementById(id); }
  function normalized(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function displayName(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + "." : parts[0] || "Student";
  }
  function initials(name) { return displayName(name).replace(".", "").split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
  function gradeLabel(grade) { return grade + "th grade"; }
  function projectionRecord(record) {
    return {
      id: String(record.id), name: String(record.displayName || "Student"), grade: String(record.grade),
      dates: [record.session], selectedDate: record.session, mode: "partner", partnerId: record.partnerId || null,
      assignedPartnerId: null,
      tint: ["gold", "blue", "violet", "teal"][String(record.id).charCodeAt(0) % 4],
      piece: "boy", isDemo: false, withdrawn: false, releasedReason: ""
    };
  }
  function refreshRecords() {
    var records = state.publicRecords.map(projectionRecord);
    if (state.self) {
      var selfRecord = {
        id: state.self.id, name: state.self.name, grade: state.self.grade, dates: [state.self.session],
        selectedDate: state.self.session, mode: "partner", partnerId: state.self.partnerId,
        assignedPartnerId: null, tint: "teal", piece: "girl", isDemo: false, withdrawn: false,
        releasedReason: state.self.releasedReason || "", relationshipStatus: state.self.status, isYou: true
      };
      records = records.filter(function (record) { return record.id !== selfRecord.id; });
      records.push(selfRecord);
    }
    state.data = { records: records };
  }
  async function api(action, extra) {
    var response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action, fcpsId: state.fcpsId }, extra || {}))
    });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "The shared tryout board is temporarily unavailable.");
    return result;
  }
  function applySelf(self) {
    state.self = self || null;
    state.activeId = self ? self.id : null;
    state.partnerId = self ? self.partnerId : null;
    if (self) state.date = self.session;
    refreshRecords();
  }
  async function refreshStatus() {
    if (!state.fcpsId || state.loading) return;
    try {
      var result = await api("status");
      var previousRevision = state.self && state.self.revision;
      applySelf(result.self);
      if (state.boardVisible) {
        renderAll();
        if (previousRevision !== state.self.revision) showMessage("The shared board changed. Your view is up to date.");
      }
    } catch (ignore) {}
  }
  function startStatusPolling() {
    stopStatusPolling();
    state.pollTimer = window.setInterval(refreshStatus, 10000);
  }
  function stopStatusPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  function startPublicSubscription() {
    if (!window.firebase || !firebase.firestore) {
      showMessage("The shared board could not connect. Please refresh and try again.", true);
      return;
    }
    var app = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
    state.unsubscribe = app.firestore().collection("public_tryout_students")
      .where("season", "==", "2026-2027")
      .onSnapshot(function (snapshot) {
        state.publicRecords = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        refreshRecords();
        if (state.boardVisible) renderAll();
      }, function () {
        if (state.boardVisible) showMessage("Live board updates are temporarily unavailable. Your actions are still saved safely.", true);
      });
  }
  function activeRecord() { return state.data.records.find(function (record) { return record.id === state.activeId && active(record); }) || null; }
  function recordById(id) { return state.data.records.find(function (record) { return record.id === id; }) || null; }
  function active(record) { return record && !record.withdrawn; }
  function relationshipSignature(record) {
    return record ? [record.partnerId || "", record.assignedPartnerId || "", record.selectedDate || "", record.updatedAt || ""].join("|") : "";
  }
  function mutual(record) {
    if (record && record.id === state.activeId && record.relationshipStatus === "mutual") return recordById(record.partnerId);
    if (!record || !record.partnerId || record.assignedPartnerId) return null;
    var partner = recordById(record.partnerId);
    return partner && active(partner) && !partner.assignedPartnerId && partner.partnerId === record.id ? partner : null;
  }
  function statusFor(record) {
    if (!record) return "new";
    if (record.id === state.activeId && record.relationshipStatus) return record.relationshipStatus;
    if (record.assignedPartnerId) return "assigned";
    if (record.mode === "assign") return "waiting";
    if (!record.partnerId) return "open";
    return mutual(record) ? "mutual" : "pending";
  }
  function currentCandidates() {
    var current = activeRecord();
    return state.data.records.filter(function (record) {
      return active(record) && ["7", "8"].includes(record.grade) && record.id !== (current && current.id) && record.mode === "partner" &&
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
  function renderDates() {
    dom.dates.innerHTML = Object.keys(DATES).map(function (key) {
      var option = DATES[key], selected = key === state.date;
      return '<button class="tourney-tryout-date-card' + (selected ? " is-selected" : "") + '" data-date="' + key + '" type="button" aria-pressed="' + selected + '">' +
        "<b>" + option.weekday + "</b><strong>" + option.date + '</strong><span>' + option.location + ' · 2:30–4:30 PM</span><em aria-hidden="true">' + (selected ? "✓" : "") + "</em></button>";
    }).join("");
  }
  function renderPairing() {
    var candidates = currentCandidates();
    var current = activeRecord();
    var allActive = state.data.records.filter(function (record) {
      return active(record) && ["7", "8"].includes(record.grade) && record.dates.includes(state.date);
    });
    var boardRecords = allActive;
    var rows = [];
    var seen = {};
    function addRow(left, right, status) {
      if (!left && !right) return;
      var ids = [left && left.id, right && right.id].filter(Boolean).sort().join("|");
      if (ids && seen[ids]) return;
      if (ids) seen[ids] = true;
      rows.push({ left: left, right: right, status: status });
    }
    boardRecords.forEach(function (record) {
      if (seen[record.id] || record.mode === "assign") return;
      var partner = record.partnerId && recordById(record.partnerId);
      var mutualPartner = mutual(record);
      if (mutualPartner) {
        addRow(record, mutualPartner, "locked");
        seen[record.id] = true; seen[mutualPartner.id] = true;
      } else if (partner && active(partner) && partner.dates.includes(state.date) && !mutual(partner)) {
        addRow(record, partner, "pending");
        seen[record.id] = true; seen[partner.id] = true;
      }
    });
    if (state.partnerId || state.selfPlaced) {
      var selectedPartner = recordById(state.partnerId);
      var selfName = state.self ? state.self.name : (dom.name.value.trim() || "Student");
      var hasYourRequest = rows.some(function (row) { return row.left && row.left.isYou; });
      if (selectedPartner && !hasYourRequest) {
        var requestRow = { left: { id: "your-piece", name: selfName, grade: "", piece: "girl", tint: "teal", isYou: true }, right: selectedPartner, status: "your-request" };
        if (Number.isInteger(state.boardRow) && state.boardRow >= rows.length && state.boardRow < 8) {
          while (rows.length <= state.boardRow) rows.push({ left: null, right: null, status: "open" });
          rows[state.boardRow] = requestRow;
        } else {
          rows.push(requestRow);
        }
      } else if (state.selfPlaced && !hasYourRequest) {
        var openRequestRow = { left: { id: "your-piece", name: selfName, grade: "", piece: "girl", tint: "teal", isYou: true }, right: null, status: "your-request" };
        if (Number.isInteger(state.boardRow) && state.boardRow >= rows.length && state.boardRow < 8) {
          while (rows.length <= state.boardRow) rows.push({ left: null, right: null, status: "open" });
          rows[state.boardRow] = openRequestRow;
        } else {
          rows.push(openRequestRow);
        }
      }
    }
    var maxRows = Math.max(8, rows.length);
    function pieceSvg(record) {
      var pieceType = record && record.piece === "girl" ? "girl" : "boy";
      var paths = pieceType === "girl"
        ? '<circle cx="24" cy="13" r="6"/><path d="M14 35c.8-7 4-11 10-11s9.2 4 10 11"/><path d="M18 12c1-6 11-8 14 1"/>'
        : '<circle cx="24" cy="13" r="6"/><path d="M14 35c.8-7 4-11 10-11s9.2 4 10 11"/><path d="M16 11c3-5 13-5 16 0"/>';
      return '<svg viewBox="0 0 48 48" aria-hidden="true"><g>' + paths + '</g></svg>';
    }
    function piece(record, extra, rowIndex) {
       if (!record) return '<button class="tourney-tryout-drop-slot ' + (extra || "") + '" data-drop-slot data-drop-row="' + rowIndex + '" type="button"><span aria-hidden="true">+</span><small>' + (state.selfPlaced && state.partnerId ? "Choose partner" : state.selfPlaced ? "Choose a partner" : "Add me here") + '</small></button>';
      return '<div class="tourney-tryout-piece ' + (record.isYou ? "is-you " : "") + (record.tint || "blue") + '" ' + (record.isYou ? "" : 'data-piece-id="' + escapeHtml(record.id) + '"') + '>' +
        '<span class="tourney-tryout-piece-art">' + pieceSvg(record) + '</span><span class="tourney-tryout-piece-name">' + escapeHtml(record.isYou ? "You (" + record.name + ")" : displayName(record.name)) + '</span>' +
        (record.isYou ? '<span class="tourney-tryout-piece-tag">Your move</span>' : "") + '</div>';
    }
    function rowMarkup(row, index) {
      var indicator = row.status === "locked"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/></svg>'
        : row.status === "pending" || row.status === "your-request"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
       var label = row.status === "locked" ? "Both agreed · Locked" : row.status === "your-request" ? (row.right ? "Your request · Pending" : "You · Choose a partner") : row.status === "pending" ? "One agreed · Pending" : "Open row";
      return '<div class="tourney-tryout-board-row is-' + row.status + '" data-board-row="' + index + '">' +
        '<span class="tourney-tryout-row-number">' + (index + 1) + '</span><div class="tourney-tryout-board-slot">' + piece(row.left, row.left ? "" : "is-open", index) + '</div>' +
        '<span class="tourney-tryout-row-state" aria-label="' + label + '">' + indicator + '</span><div class="tourney-tryout-board-slot">' + piece(row.right, row.right ? "" : "is-open", index) + '</div></div>';
    }
    while (rows.length < maxRows) rows.push({ left: null, right: null, status: "open" });
    var boardRows = rows.slice(0, 8).map(rowMarkup).join("");
    var list = candidates.length ? candidates.map(function (record) {
      var selected = record.id === state.partnerId;
      var availability = record.dates.length > 1 ? "Available either day" : "Available " + DATES[record.dates[0]].shortDate;
      return '<button class="tourney-tryout-roster-piece ' + (selected ? "is-selected " : "") + record.tint + '" data-partner="' + escapeHtml(record.id) + '" draggable="true" type="button" aria-pressed="' + selected + '">' +
        '<span class="tourney-tryout-piece-art">' + pieceSvg(record) + '</span><span class="tourney-tryout-roster-copy"><strong>' +
        escapeHtml(displayName(record.name)) + "</strong><small>" + escapeHtml(gradeLabel(record.grade) + " · " + availability) + '</small></span><span class="tourney-tryout-roster-check">' + (selected ? "✓" : "↗") + '</span></button>';
    }).join("") : '<div class="tourney-tryout-empty">No students are available for this session yet. Check back after more students open the board.</div>';
    var lockedCount = rows.filter(function (row) { return row.status === "locked"; }).length;
    var pendingCount = rows.filter(function (row) { return row.status === "pending" || row.status === "your-request"; }).length;
    var openCount = rows.filter(function (row) { return row.status === "open"; }).length;
    var currentStatus = current ? statusFor(current) : state.partnerId ? "pending" : "new";
    var statusText = currentStatus === "mutual" || currentStatus === "assigned" ? "You are paired" : currentStatus === "pending" ? "Request pending" : state.partnerId ? "Ready to request" : state.selfPlaced ? "Choose a partner" : "Place your piece";
    var statusDetail = selectedPartner ? "Your piece is beside " + escapeHtml(displayName(selectedPartner.name)) + "." : state.selfPlaced ? "Your piece is on the board. Choose an available student." : "Click “Add me here,” then choose an available student.";
    dom.picker.innerHTML =
      '<div class="tourney-tryout-board-layout">' +
        '<aside class="tourney-tryout-roster"><div class="tourney-tryout-board-panel-title"><span class="tourney-tryout-board-icon">♟</span><div><h4>Available students</h4><p>Drag a piece to request a pairing.</p></div></div>' +
          '<div class="tourney-tryout-filter-row"><span class="is-active">All open pieces</span><span>' + candidates.length + ' available</span></div><label class="tourney-tryout-search"><span aria-hidden="true">⌕</span><input data-tryout-search type="search" placeholder="Search students" aria-label="Search students"></label>' +
          '<div class="tourney-tryout-roster-list">' + list + '</div></aside>' +
        '<section class="tourney-tryout-board"><div class="tourney-tryout-board-heading"><div><span class="tourney-tryout-board-icon">♜</span><h4>All pairings</h4></div><span>' + escapeHtml(DATES[state.date].shortDate) + ' · ' + escapeHtml(DATES[state.date].location) + '</span></div><div class="tourney-tryout-board-grid">' + boardRows + '</div></section>' +
        '<aside class="tourney-tryout-side"><section class="tourney-tryout-my-status"><div class="tourney-tryout-side-title">My status</div><div class="tourney-tryout-your-status"><span class="tourney-tryout-your-piece teal">' + pieceSvg({ piece: "girl" }) + '</span><div><strong>' + statusText + '</strong><small>' + statusDetail + '</small></div></div><div class="tourney-tryout-side-fact">▣ <span>Session</span><strong>' + escapeHtml(DATES[state.date].shortDate) + '</strong></div></section>' +
          '<section class="tourney-tryout-instructions"><div class="tourney-tryout-side-title">How it works</div><ol><li><b>1</b><span><strong>Move your piece</strong>Drag or tap to choose.</span></li><li><b>2</b><span><strong>Partner responds</strong>They choose you back.</span></li><li><b>3</b><span><strong>Both agree = paired</strong>Either student can later unpair.</span></li></ol></section>' +
          '<section class="tourney-tryout-legend"><div class="tourney-tryout-side-title">Status legend</div><p><i class="locked"></i> Both agreed · Paired</p><p><i class="pending"></i> One agreed · Pending</p><p><i class="open"></i> Available</p></section>' +
          '<section class="tourney-tryout-stats"><div class="tourney-tryout-side-title">Visible board</div><div><span><strong>' + lockedCount + '</strong>Paired</span><span><strong>' + pendingCount + '</strong>Pending</span><span><strong>' + openCount + '</strong>Open</span></div></section></aside>' +
        '</div><div class="tourney-tryout-callout">Confirmed pairings are visible to everyone, like a shared pairing sheet. Pending requests stay private until both students choose each other.</div>';
  }
  function renderResult() {
    var record = activeRecord();
    if (!record) { dom.result.hidden = true; return; }
    var status = statusFor(record);
    var partner = record.assignedPartnerId ? recordById(record.assignedPartnerId) : (mutual(record) || recordById(record.partnerId));
    var partnerName = partner ? displayName(partner.name) : "your requested partner";
    var copy = {
      pending: ["Request saved", "Your request for " + partnerName + " is pending. They must choose you back before the row locks."],
      mutual: ["You are paired", "You and " + partnerName + " chose each other. Either of you can use Change My Signup to unpair and choose again."],
      assigned: ["You are paired", "Your tryout pairing is with " + partnerName + ". You can use Change My Signup to choose again."],
      waiting: ["Choose a partner", "Move a student piece onto the board to send a request."],
      open: ["Your piece is available", record.releasedReason === "partner-locked" ? "That student completed another pairing first. Move your piece again to request someone who is still open." : "Move your piece to request an available student."]
    }[status];
    dom.result.className = "tourney-tryout-result is-" + status;
    dom.result.innerHTML = "<h3>" + copy[0] + "</h3><p>" + copy[1] + "</p>";
    dom.result.hidden = false;
  }
  function renderIdentity() {
    var record = activeRecord();
    dom.gate.hidden = state.boardVisible && !state.editing;
    dom.identity.hidden = !state.boardVisible;
    dom.workspace.hidden = !state.boardVisible;
    if (!state.boardVisible) return;
    dom.identityName.textContent = dom.name.value.trim() || (record && record.name) || "Student";
    dom.identityMeta.textContent = gradeLabel(dom.grade.value || (record && record.grade) || "7") + " · " + DATES[state.date].date + " · " + DATES[state.date].location;
    dom.submit.textContent = state.editing ? "Save new pairing request →" : "Submit pairing request →";
  }
  function renderAll() { renderDates(); if (state.boardVisible) renderPairing(); renderIdentity(); renderResult(); }
  function fillRecord(record) {
    if (!record) return;
    state.date = record.selectedDate; state.partnerId = record.partnerId; state.selfPlaced = Boolean(record.partnerId);
    state.baseRelationship = relationshipSignature(record);
    dom.name.value = record.name; dom.grade.value = record.grade;
  }
  function chooseDate(date) {
    if (!DATES[date]) return;
    state.date = date;
    if (state.partnerId && !currentCandidates().some(function (record) { return record.id === state.partnerId; })) state.partnerId = null;
    state.boardRow = null;
    state.selfPlaced = false;
    formMessage(""); renderAll();
  }
  function validateIdentity() {
    if (!/^\d{7}$/.test(dom.fcpsId.value.trim())) return "Please enter the student’s seven-digit FCPS ID.";
    if (dom.name.value.trim().split(/\s+/).length < 2) return "Please enter the student's first and last name.";
    if (!["7", "8"].includes(dom.grade.value)) return "Please select seventh or eighth grade.";
    return "";
  }
  async function showBoard() {
    var error = validateIdentity();
    if (error) { formMessage(error, true); dom.error.focus(); return; }
    state.loading = true; dom.showBoard.disabled = true; formMessage("Connecting to the shared board…");
    try {
      state.fcpsId = dom.fcpsId.value.trim();
      var result = await api("open", {
        name: dom.name.value.trim(),
        grade: dom.grade.value,
        session: state.date
      });
      applySelf(result.self);
      dom.name.value = state.self.name;
      dom.grade.value = state.self.grade;
      state.boardVisible = true;
      state.editing = false;
      formMessage("Shared board loaded. Row numbers may move as other students make choices.");
      renderAll();
      startStatusPolling();
      dom.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (apiError) {
      state.fcpsId = "";
      formMessage(apiError.message, true);
      dom.error.focus();
    } finally {
      state.loading = false; dom.showBoard.disabled = false;
    }
  }
  async function submit() {
    var error = validateIdentity();
    if (!error && !state.partnerId) error = "Choose an available student before submitting your pairing request.";
    if (error) { formMessage(error, true); dom.error.focus(); return; }
    state.loading = true; dom.submit.disabled = true;
    try {
      var result = await api("request", { partnerId: state.partnerId, expectedRevision: state.self.revision });
      applySelf(result.self);
      state.editing = false;
      formMessage(state.self.status === "mutual" ? "You are paired. Either student can change the pairing from this board." : "Pairing request saved. It will pair automatically if the other student chooses you.");
      renderAll(); dom.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (apiError) {
      await refreshStatus();
      formMessage(apiError.message, true);
    } finally {
      state.loading = false; dom.submit.disabled = false;
    }
  }
  async function edit() {
    var record = activeRecord();
    if (!record) { state.editing = true; renderAll(); dom.name.focus(); return; }
    if (!window.confirm("Change this signup? Any current request or pairing will be released so both students can choose again.")) return;
    try {
      var result = await api("release", { expectedRevision: state.self.revision });
      applySelf(result.self);
      state.partnerId = null;
      state.boardRow = null;
      state.selfPlaced = false;
      state.editing = true;
      formMessage("Your previous pairing was released. Update your details or choose a new partner.");
      renderAll();
      dom.name.focus();
    } catch (apiError) { await refreshStatus(); formMessage(apiError.message, true); }
  }
  async function withdraw() {
    if (!window.confirm("Withdraw from tryouts? Any current partner will become available to choose again.")) return;
    try {
      await api("withdraw", { expectedRevision: state.self.revision });
      stopStatusPolling();
      state.self = null; state.activeId = null; state.fcpsId = ""; state.editing = false; state.boardVisible = false; state.partnerId = null; state.selfPlaced = false;
      dom.fcpsId.value = ""; dom.name.value = ""; dom.grade.value = "";
      refreshRecords(); formMessage("Your sign-up was withdrawn. Your former partner is available again."); renderAll();
    } catch (apiError) { await refreshStatus(); formMessage(apiError.message, true); }
  }
  function newStudent() {
    state.activeId = null; state.editing = false; state.boardVisible = false; state.date = "sep22"; state.partnerId = null; state.boardRow = null; state.selfPlaced = false; state.baseRelationship = "";
    stopStatusPolling(); state.self = null; state.fcpsId = ""; refreshRecords();
    dom.fcpsId.value = ""; dom.name.value = ""; dom.grade.value = ""; formMessage("Ready for another student’s sign-up."); renderAll(); dom.fcpsId.focus();
  }
  function init() {
    dom = {
      status: $("tourney-tryout-status"), dates: $("tourney-tryout-date-options"), picker: $("tourney-tryout-partner-picker"),
      fcpsId: $("tourney-tryout-fcps-id"), name: $("tourney-tryout-name"), grade: $("tourney-tryout-grade"), form: $("tourney-tryout-form"),
      error: $("tourney-tryout-error"), message: $("tourney-tryout-message"), gate: $("tourney-tryout-gate"),
      showBoard: $("tourney-tryout-show-board"), workspace: $("tourney-tryout-workspace"), submit: $("tourney-tryout-submit"),
      identity: $("tourney-tryout-identity"), identityName: $("tourney-tryout-identity-name"),
      identityMeta: $("tourney-tryout-identity-meta"), result: $("tourney-tryout-student-status")
    };
    startPublicSubscription();
    dom.dates.addEventListener("click", function (event) { var button = event.target.closest("[data-date]"); if (button) chooseDate(button.dataset.date); });
    dom.picker.addEventListener("click", function (event) {
      var button = event.target.closest("[data-partner]");
      if (button) {
        state.partnerId = button.dataset.partner;
        if (!state.selfPlaced) state.boardRow = null;
        formMessage(state.selfPlaced ? "Partner selected. Submit to send this request." : "Student selected. Tap an open square to place your piece, or submit this request.");
        renderPairing();
        return;
      }
      var slot = event.target.closest("[data-drop-slot]");
      if (slot) {
        state.boardRow = Number(slot.dataset.dropRow);
        state.selfPlaced = true;
        formMessage(state.partnerId ? "Piece placed. Submit to send this pending request." : "Your piece is on the board. Now choose an available student.");
        renderPairing();
      }
    });
    dom.picker.addEventListener("input", function (event) {
      if (!event.target.matches("[data-tryout-search]")) return;
      var query = normalized(event.target.value);
      dom.picker.querySelectorAll("[data-partner]").forEach(function (button) {
        button.hidden = Boolean(query) && normalized(button.textContent).indexOf(query) === -1;
      });
    });
    dom.picker.addEventListener("dragstart", function (event) {
      var piece = event.target.closest("[data-partner]");
      if (!piece || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", piece.dataset.partner);
      piece.classList.add("is-dragging");
    });
    dom.picker.addEventListener("dragend", function (event) {
      var piece = event.target.closest("[data-partner]");
      if (piece) piece.classList.remove("is-dragging");
    });
    dom.picker.addEventListener("dragover", function (event) {
      if (event.target.closest("[data-drop-slot]")) event.preventDefault();
    });
    dom.picker.addEventListener("drop", function (event) {
      var target = event.target.closest("[data-drop-slot]");
      if (!target || !event.dataTransfer) return;
      event.preventDefault();
      var partnerId = event.dataTransfer.getData("text/plain");
      if (!currentCandidates().some(function (record) { return record.id === partnerId; })) {
        formMessage("That student is no longer available. Choose another open piece.", true);
        return;
      }
      state.partnerId = partnerId;
      state.boardRow = Number(target.dataset.dropRow);
      state.selfPlaced = true;
      formMessage("Piece moved. Submit to send this pending request.");
      renderPairing();
    });
    dom.form.addEventListener("submit", function (event) { event.preventDefault(); submit(); });
    dom.showBoard.addEventListener("click", showBoard);
    dom.fcpsId.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 7); formMessage(""); });
    dom.name.addEventListener("input", function () { formMessage(""); }); dom.grade.addEventListener("change", function () { formMessage(""); });
    dom.identity.addEventListener("click", function (event) { if (event.target.closest("[data-tryout-edit]")) edit(); if (event.target.closest("[data-tryout-withdraw]")) withdraw(); if (event.target.closest("[data-tryout-new]")) newStudent(); });
    window.addEventListener("beforeunload", function () { stopStatusPolling(); if (state.unsubscribe) state.unsubscribe(); });
    renderAll();
  }
  document.addEventListener("DOMContentLoaded", function () { if ($("tourney-tryout-form")) init(); });
}());