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
    teamFee: "Team fee", judgeVolunteer: "Judge volunteer", transportation: "Transportation",
    googleMeets: "Google Meets",
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
  const emailAccepted = item => item.emailStatus === "accepted";
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
    const emailOk = applications.filter(emailAccepted).length;
    const grade7 = applications.filter(item => item.student?.grade === "7th Grade").length;
    const grade8 = applications.filter(item => item.student?.grade === "8th Grade").length;
    $("stat-total").textContent = total;
    $("stat-pending").textContent = pending;
    $("stat-accepted").textContent = accepted;
    $("stat-declined").textContent = declined;
    $("stat-email").textContent = `${emailOk}/${total}`;
    $("stat-email-note").textContent = total ? `${total - emailOk} need attention` : "provider acceptance";
    $("grade-breakdown").textContent = total ? `Grade breakdown: ${grade7} seventh-grade · ${grade8} eighth-grade applicant${total === 1 ? "" : "s"}.` : "No applications have been received yet.";
  }
  function filteredApplications() {
    const query = $("search").value.trim().toLowerCase();
    const decision = $("decision-filter").value;
    const delivery = $("delivery-filter").value;
    const sort = $("sort").value;
    const list = applications.filter(item => {
      const searchable = [item.student?.firstName, item.student?.lastName, item.student?.studentId, item.student?.personalEmail, item.parent?.firstName, item.parent?.lastName, item.parent?.email].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) &&
        (decision === "all" || status(item) === decision) &&
        (delivery === "all" || (delivery === "accepted" ? emailAccepted(item) : !emailAccepted(item)));
    });
    return list.sort((left, right) => {
      if (sort === "name") return `${left.student?.lastName || ""} ${left.student?.firstName || ""}`.localeCompare(`${right.student?.lastName || ""} ${right.student?.firstName || ""}`);
      return sort === "oldest" ? timestampMillis(left.createdAt) - timestampMillis(right.createdAt) : timestampMillis(right.createdAt) - timestampMillis(left.createdAt);
    });
  }
  function statusBadge(value) {
    const labels = { pending: "Awaiting review", accepted: "Accepted", declined: "Declined" };
    return `<span class="badge ${value}">${labels[value]}</span>`;
  }
  function deliveryBadge(item) {
    return emailAccepted(item)
      ? '<span class="badge email-ok">Copies accepted</span>'
      : `<span class="badge email-issue">${escapeHtml(item.emailStatus || "Email pending")}</span>`;
  }
  function renderList() {
    const list = filteredApplications();
    $("visible-count").textContent = `${list.length} visible`;
    $("application-list").innerHTML = list.length ? list.map(item => {
      const student = item.student || {};
      const parent = item.parent || {};
      return `<button type="button" class="application-row ${item.id === selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="row-top"><span class="row-name">${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</span><span class="badges">${statusBadge(status(item))}</span></div>
        <div class="row-meta">${escapeHtml(student.grade || "Grade not listed")} · ${escapeHtml(parent.firstName || "")} ${escapeHtml(parent.lastName || "")}<br>${escapeHtml(formatDate(item.createdAt))}</div>
        <div class="badges" style="margin-top:8px">${deliveryBadge(item)}</div>
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
  function answer(label, value) {
    return `<div class="answer-box"><span>${escapeHtml(label)}</span><div class="answer">${escapeHtml(value || "No response provided.")}</div></div>`;
  }
  function renderDetail() {
    const item = applications.find(application => application.id === selectedId);
    if (!item) {
      $("detail").innerHTML = '<div class="detail-empty">Select an application from the queue to view private details and record a decision.</div>';
      return;
    }
    const student = item.student || {};
    const parent = item.parent || {};
    const commitments = Object.entries(COMMITMENT_LABELS).filter(([key]) => item.commitments?.[key]).map(([, label]) => `<span class="commitment">✓ ${escapeHtml(label)}</span>`).join("") || '<span class="answer">No commitments recorded.</span>';
    const decision = status(item);
    const reviewDate = item.reviewedAt ? formatDate(item.reviewedAt) : "";
    $("detail").innerHTML = `<div class="detail-content">
      <header class="detail-heading"><div class="badges" style="margin-bottom:10px">${statusBadge(decision)} ${deliveryBadge(item)}</div><h2>${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</h2><p>Submitted ${escapeHtml(formatDate(item.createdAt))} · Application ID ${escapeHtml(item.id)}</p></header>
      <section class="section"><h3>Student contact</h3><div class="detail-grid">${fact("Grade", student.grade)}${fact("Student ID", student.studentId)}${fact("School email", student.schoolEmail)}${fact("Personal email", student.personalEmail)}${fact("Prior debate experience", student.debateExperience)}</div></section>
      <section class="section"><h3>Parent / guardian</h3><div class="detail-grid">${fact("Name", [parent.firstName, parent.lastName].filter(Boolean).join(" "))}${fact("Relationship", parent.relationship)}${fact("Email", parent.email)}${fact("Phone", parent.phone)}${fact("Signed agreement", item.parentSignature ? `${item.parentSignature}${item.parentAgreement ? " · agreed" : ""}` : "—")}</div></section>
      <section class="section"><h3>Commitments confirmed</h3><div class="commitments">${commitments}</div></section>
      <section class="section"><h3>Written answers</h3><div class="answer-wrap">${answer("Why do you want to join?", item.answers?.whyJoin)}${answer("Debate experience", item.answers?.experienceDetail)}${answer("Schedule conflicts", item.answers?.scheduleConflicts)}${answer("Anything else", item.answers?.anythingElse)}</div></section>
      <section class="section"><h3>Admissions review · internal only</h3><div class="review-card"><div class="review-controls"><div class="field"><label for="review-decision">Decision</label><select id="review-decision"><option value="accepted" ${decision === "accepted" ? "selected" : ""}>Accept</option><option value="declined" ${decision === "declined" ? "selected" : ""}>Decline</option></select></div><div class="field"><label>Current state</label><div class="delivery-row" style="padding:9px 0">${statusBadge(decision)}<p>No applicant email is sent.</p></div></div><textarea class="review-note" id="review-note" maxlength="2000" placeholder="Optional internal note for coaches only">${escapeHtml(item.reviewNote || "")}</textarea></div><div class="save-row"><span class="save-message" id="save-message">This stores the decision, reviewing coach, date, and optional internal note.</span><button type="button" class="save-decision" id="save-decision">Save decision</button></div>${item.reviewedBy ? `<div class="audit">Last reviewed by <b>${escapeHtml(item.reviewedBy)}</b>${reviewDate ? ` on <b>${escapeHtml(reviewDate)}</b>` : ""}.</div>` : ""}</div></section>
    </div>`;
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
  ["search", "decision-filter", "delivery-filter", "sort"].forEach(id => $(id).addEventListener(id === "search" ? "input" : "change", () => {
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