/* Cooper Debate Team — private coach application review workspace */
(function () {
  "use strict";

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    storageBucket: "cooper-debate-team.firebasestorage.app",
    messagingSenderId: "112813790184",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d",
  };
  const REVIEW_ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageApplicationReview";
  const COMMITMENT_LABELS = {
    tuesdayMeetings: "Tuesday meetings", saturdayTournaments: "Saturday tournaments",
    partnerCommitment: "Partner commitment", researchPreparation: "Research & preparation",
    judgeVolunteer: "Judge courtesy", transportation: "Transportation", googleMeets: "Google Meets",
    teamFee: "Team fees",
  };
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const timestampMillis = value => value && typeof value.toMillis === "function" ? value.toMillis() : 0;
  const formatDate = value => {
    const date = value && typeof value.toDate === "function" ? value.toDate() : null;
    return date ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Submission time unavailable";
  };
  const status = item => ["accepted", "declined"].includes(item.reviewStatus) ? item.reviewStatus : "pending";
  let currentUser = null;
  let applications = [];
  let selectedId = "";
  let unsubscribe = null;

  window.memberSignOut = () => auth.signOut().finally(() => { window.location.href = "index.html"; });
  window.appToggleNotif = () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") {
      alert("Notifications are blocked. Enable them from your browser settings.");
      return;
    }
    Notification.requestPermission().then(updateNotificationState);
  };

  function show(id) {
    ["auth-loading", "auth-required", "access-denied", "dashboard"].forEach(section => $(section).hidden = section !== id);
  }
  function isCoach(user) {
    return user && typeof getAdminRole === "function" && getAdminRole(user.email) === "coach";
  }
  function updateNotificationState() {
    const indicator = $("app-notif-state");
    if (indicator && "Notification" in window) indicator.classList.toggle("on", Notification.permission === "granted");
  }
  function setMetrics() {
    const total = applications.length;
    const pending = applications.filter(item => status(item) === "pending").length;
    const accepted = applications.filter(item => status(item) === "accepted").length;
    const declined = applications.filter(item => status(item) === "declined").length;
    $("stat-total").textContent = total;
    $("stat-pending").textContent = pending;
    $("stat-accepted").textContent = accepted;
    $("stat-declined").textContent = declined;
  }
  function filteredApplications() {
    const query = $("search").value.trim().toLowerCase();
    const decision = $("decision-filter").value;
    const grade = $("grade-filter").value;
    const sort = $("sort").value;
    const list = applications.filter(item => {
      const searchable = [item.student?.firstName, item.student?.lastName, item.student?.studentId, item.parent?.firstName, item.parent?.lastName].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) &&
        (decision === "all" || status(item) === decision) &&
        (grade === "all" || item.student?.grade === grade);
    });
    return list.sort((left, right) => {
      if (sort === "name") return `${left.student?.lastName || ""} ${left.student?.firstName || ""}`.localeCompare(`${right.student?.lastName || ""} ${right.student?.firstName || ""}`);
      return sort === "oldest" ? timestampMillis(left.createdAt) - timestampMillis(right.createdAt) : timestampMillis(right.createdAt) - timestampMillis(left.createdAt);
    });
  }
  function statusBadge(value) {
    const labels = { pending: "Pending", accepted: "Accepted", declined: "Declined" };
    return `<span class="badge ${value}">${icon(value, "badge-icon")} ${labels[value]}</span>`;
  }
  function icon(name, className = "") {
    const assets = {
      applicants: "applicants", pending: "pending", accepted: "accepted", declined: "declined",
      grade: "grade", debate: "debate", calendar: "calendar", commitments: "commitments",
      check: "accepted", hold: "hold", person: "person", guardian: "guardian", phone: "phone",
      clipboard: "clipboard", info: "info", lock: "lock", search: "search",
    };
    const asset = assets[name] || "info";
    return `<img class="icon-art icon-${asset} ${className}" src="images/application-icons/${asset}.png" alt="" aria-hidden="true">`;
  }
  function renderList() {
    const list = filteredApplications();
    $("visible-count").textContent = `${list.length} visible`;
    $("application-list").innerHTML = list.length ? list.map(item => {
      const student = item.student || {};
      const parent = item.parent || {};
      return `<button type="button" class="application-row ${item.id === selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="row-main">
          <div><div class="row-name">${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</div><div class="row-context">${escapeHtml(student.grade || "Grade not listed")} · ${escapeHtml([parent.firstName, parent.lastName].filter(Boolean).join(" ") || "Parent / guardian")}</div></div>
          <div class="row-status">${statusBadge(status(item))}</div>
        </div>
        <div class="row-submitted">${escapeHtml(formatDate(item.createdAt))}</div>
      </button>`;
    }).join("") : '<div class="empty">No applications match these filters.</div>';
    document.querySelectorAll(".application-row").forEach(row => row.addEventListener("click", () => {
      selectedId = row.dataset.id;
      renderList();
      renderDetail();
    }));
  }
  function fact(label, value) {
    return `<div class="fact"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></div>`;
  }
  function answer(label, value, iconName) {
    return `<div class="answer-box"><span>${icon(iconName, "answer-icon")}${escapeHtml(label)}</span><div class="answer">${escapeHtml(value || "No response provided.")}</div></div>`;
  }
  function quickTile(iconName, label, value) {
    return `<div class="quick-tile">${icon(iconName)}<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></div></div>`;
  }
  function renderDetail() {
    const item = applications.find(application => application.id === selectedId);
    if (!item) {
      $("detail").innerHTML = '<div class="detail-empty">Select an application from the queue to view private details and record a decision.</div>';
      return;
    }
    const student = item.student || {};
    const parent = item.parent || {};
    const commitmentEntries = Object.entries(COMMITMENT_LABELS).filter(([key]) => item.commitments?.[key]);
    const commitments = commitmentEntries.map(([, label]) => `<span class="commitment">${icon("check", "commitment-icon")} ${escapeHtml(label)}</span>`).join("") || '<span class="answer">No commitments recorded.</span>';
    const decision = status(item);
    const reviewDate = item.reviewedAt ? formatDate(item.reviewedAt) : "";
    $("detail").innerHTML = `<div class="detail-content">
      <header class="detail-heading"><div><h2>${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</h2><p>${icon("clipboard", "detail-meta-icon")}Submitted ${escapeHtml(formatDate(item.createdAt))} · Application ID ${escapeHtml(item.id)}</p></div><div class="detail-status"><div class="badges">${statusBadge(decision)}</div></div></header>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Quick profile</h3><div class="quick-profile-grid">${quickTile("grade", "Grade", student.grade)}${quickTile("debate", "Debate experience", student.debateExperience)}${quickTile("calendar", "Schedule", item.answers?.scheduleConflicts)}${quickTile("commitments", "Commitments", `${commitmentEntries.length} confirmed`)}</div></section>
      <section class="section"><div class="contact-columns"><div class="info-card aligned-info-card"><h3>Student information</h3><div class="detail-grid">${fact("Student ID", student.studentId)}${fact("School Email", student.schoolEmail)}${fact("Personal Email", student.personalEmail)}${fact("Phone", student.phone)}</div></div><div class="info-card aligned-info-card"><h3>Parent / guardian</h3><div class="detail-grid">${fact("Name", [parent.firstName, parent.lastName].filter(Boolean).join(" "))}${fact("Relationship", parent.relationship)}${fact("Email", parent.email)}${fact("Phone", parent.phone)}</div></div><div class="commitments-card aligned-commitments-card"><h3>Commitments confirmed</h3><div class="commitments">${commitments}</div></div></div></section>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Application responses</h3><div class="responses-grid">${answer("Why do you want to join?", item.answers?.whyJoin, "info")}${answer("Debate experience", item.answers?.experienceDetail, "debate")}${answer("Schedule conflicts", item.answers?.scheduleConflicts, "calendar")}${answer("Anything else", item.answers?.anythingElse, "info")}</div></section>
      <section class="review-section"><h3 class="section-title">${icon("lock", "heading-icon")}Coach review · internal</h3><div class="review-card"><div class="review-controls"><div class="review-note-wrap"><label for="review-note">${icon("clipboard", "label-icon")}Internal notes (optional)</label><textarea class="review-note" id="review-note" maxlength="2000" placeholder="Private context for coaches only">${escapeHtml(item.reviewNote || "")}</textarea></div><div class="decision-panel"><label>${icon("info", "label-icon")}Decision</label><input id="review-decision" type="hidden" value="${decision}"><div class="decision-buttons"><button type="button" class="decision-button accept ${decision === "accepted" ? "selected" : ""}" data-decision="accepted">${icon("accepted")}<span>Accept</span><small>Admit to team</small></button><button type="button" class="decision-button hold ${decision === "pending" ? "selected" : ""}" data-decision="pending">${icon("hold")}<span>Hold</span><small>Consider later</small></button><button type="button" class="decision-button decline ${decision === "declined" ? "selected" : ""}" data-decision="declined">${icon("declined")}<span>Decline</span><small>Not a fit</small></button></div></div></div><div class="save-row"><span class="save-message" id="save-message">This stores the decision, reviewing coach, date, and optional internal note.</span><button type="button" class="save-decision" id="save-decision">Save decision ${icon("check")}</button></div>${item.reviewedBy ? `<div class="audit">Last reviewed by <b>${escapeHtml(item.reviewedBy)}</b>${reviewDate ? ` on <b>${escapeHtml(reviewDate)}</b>` : ""}.</div>` : ""}</div></section>
    </div>`;
    document.querySelectorAll(".decision-button").forEach(button => button.addEventListener("click", () => {
      $("review-decision").value = button.dataset.decision;
      document.querySelectorAll(".decision-button").forEach(control => control.classList.toggle("selected", control === button));
    }));
    $("save-decision").addEventListener("click", () => saveDecision(item.id));
  }
  async function saveDecision(applicationId) {
    const button = $("save-decision");
    const message = $("save-message");
    button.disabled = true;
    message.textContent = "Saving secure review…";
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId, decision: $("review-decision").value, internalNote: $("review-note").value.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save the review decision.");
      message.textContent = "Decision saved. Refreshing the review record…";
    } catch (error) {
      message.textContent = error.message || "Unable to save the review decision.";
      button.disabled = false;
    }
  }
  function render() {
    setMetrics();
    renderList();
    renderDetail();
  }
  function beginListening() {
    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection("applications").onSnapshot(snapshot => {
      applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (selectedId && !applications.some(item => item.id === selectedId)) selectedId = "";
      if (!selectedId && applications.length) selectedId = applications[0].id;
      render();
    }, error => {
      $("application-list").innerHTML = `<div class="empty">Unable to load applications: ${escapeHtml(error.message || "Permission denied.")}</div>`;
    });
  }
  ["search", "decision-filter", "grade-filter", "sort"].forEach(id => $(id).addEventListener(id === "search" ? "input" : "change", () => {
    renderList();
    const visible = filteredApplications();
    if (selectedId && !visible.some(item => item.id === selectedId)) { selectedId = visible[0]?.id || ""; renderDetail(); }
  }));
  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (!user) { show("auth-required"); return; }
    $("app-userbar").classList.add("visible");
    $("app-name").textContent = user.displayName || (user.email || "").split("@")[0] || "Member";
    $("app-user-email").textContent = user.email || "";
    if (!isCoach(user)) { show("access-denied"); return; }
    $("app-role-badge").textContent = "★ Coach";
    show("dashboard");
    beginListening();
  });
  document.addEventListener("DOMContentLoaded", updateNotificationState);
})();