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
    teamFee: "Team fees", etiquette: "Debate etiquette",
  };
  const ROLE_PRESENTATION = {
    member: { label: "Team Member", icon: "images/role-icons/member.png" },
    captain: { label: "Captain", icon: "images/role-icons/captain.png" },
    coach: { label: "Coach", icon: "images/role-icons/coach.png" },
    "website-admin": { label: "Website Admin", icon: "images/role-icons/website-admin.png" },
  };
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const timestampMillis = value => value && typeof value.toMillis === "function" ? value.toMillis() : Number(value) || 0;
  const formatDate = value => {
    const date = value && typeof value.toDate === "function" ? value.toDate() : Number(value) ? new Date(Number(value)) : null;
    return date ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Submission time unavailable";
  };
  const status = item => ["accepted", "declined"].includes(item.reviewStatus) ? item.reviewStatus : "pending";
  let currentUser = null;
  let currentRole = "member";
  let applications = [];
  let selectedId = "";
  let unsubscribe = null;
  let captainReviewUnsubscribe = null;
  let captainReviewApplicationId = "";
  let captainReviews = [];
  let captainReviewError = "";
  let captainReviewRenderPending = false;
  const captainReviewDrafts = new Map();
  const coachReviewDrafts = new Map();
  let longAnswers = [];
  let activeDetailTab = "overview";
  const isFinalReviewer = () => isFullAdminRole(currentRole);
  const canSubmitTeamReview = () => ["member", "captain", "website-admin"].includes(currentRole);
  const isReviewEditor = element => element instanceof Element && Boolean(element.closest("#captain-review-note, #review-note, #applicant-rating"));
  function stopCaptainReviewListening() {
    if (captainReviewUnsubscribe) captainReviewUnsubscribe();
    captainReviewUnsubscribe = null;
    captainReviewApplicationId = "";
    captainReviews = [];
    captainReviewError = "";
    captainReviewRenderPending = false;
  }

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
  function updateNotificationState() {
    const indicator = $("app-notif-state");
    if (indicator && "Notification" in window) indicator.classList.toggle("on", Notification.permission === "granted");
  }
  function setMetrics() {
    const metricApplications = $("show-hidden-records")?.checked
      ? applications
      : applications.filter(item => item.hidden !== true);
    const total = metricApplications.length;
    const pendingApplications = metricApplications.filter(item => status(item) === "pending");
    const isReviewed = item => timestampMillis(item.reviewedAt) > 0 || Boolean(item.reviewedBy);
    const pending = pendingApplications.filter(item => !isReviewed(item)).length;
    const hold = pendingApplications.filter(isReviewed).length;
    const accepted = metricApplications.filter(item => status(item) === "accepted").length;
    const declined = metricApplications.filter(item => status(item) === "declined").length;
    $("stat-total").textContent = total;
    $("stat-pending").textContent = pending;
    $("stat-accepted").textContent = accepted;
    $("stat-declined").textContent = declined;
    $("stat-hold").textContent = hold;
  }
  function filteredApplications() {
    const query = $("search").value.trim().toLowerCase();
    const decision = $("decision-filter").value;
    const grade = $("grade-filter").value;
    const sort = $("sort").value;
    const showHidden = $("show-hidden-records").checked;
    const list = applications.filter(item => {
      const searchable = [item.student?.firstName, item.student?.lastName, item.student?.studentId, item.parent?.firstName, item.parent?.lastName].join(" ").toLowerCase();
      return (showHidden || item.hidden !== true) &&
        (!query || searchable.includes(query)) &&
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
  function hiddenBadge() {
    return '<span class="badge hidden-record">Hidden</span>';
  }
  function recommendationLabel(value) {
    return value === "accepted" ? "Accept" : value === "declined" ? "Decline" : "Hold";
  }
  function listenForCaptainReviews(applicationId) {
    if (!currentUser || captainReviewApplicationId === applicationId) return;
    if (captainReviewUnsubscribe) captainReviewUnsubscribe();
    captainReviewApplicationId = applicationId;
    captainReviews = [];
    captainReviewError = "";
    const collection = db.collection("applications").doc(applicationId).collection("captainReviews");
    const source = isFinalReviewer() ? collection : collection.doc(currentUser.uid);
    captainReviewUnsubscribe = source.onSnapshot(snapshot => {
      captainReviews = snapshot.docs
        ? snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        : snapshot.exists ? [{ id: snapshot.id, ...snapshot.data() }] : [];
      captainReviewError = "";
      if (isReviewEditor(document.activeElement)) {
        captainReviewRenderPending = true;
        return;
      }
      renderDetail();
    }, error => {
      captainReviews = [];
      captainReviewError = error.message || "Captain reviews could not be loaded.";
      renderDetail();
    });
  }
  function captainReviewPanel(applicationId, applicantName) {
    if (captainReviewError) {
      return `<section class="captain-reviews-panel"><div class="captain-review-empty" role="alert">${escapeHtml(captainReviewError)}</div></section>`;
    }
    let reviewForm = "";
    if (canSubmitTeamReview()) {
      const ownReview = captainReviews.find(review => review.id === currentUser?.uid) || {};
      const draft = captainReviewDrafts.get(applicationId);
      const savedRecommendation = ownReview.id
        ? (["accepted", "declined"].includes(ownReview.recommendation) ? ownReview.recommendation : "pending")
        : "";
      const recommendation = draft?.decision || savedRecommendation;
      const note = draft?.note ?? ownReview.note ?? "";
      const rating = draft?.rating ?? ownReview.rating ?? "";
      const rubric = { ...(ownReview.rubric || {}), ...(draft?.rubric || {}) };
      const rubricQuestions = [
        ["followThrough", "Does the application show dependable follow-through and readiness to participate consistently?"],
        ["teamContribution", "Does this applicant appear likely to contribute positively to the team environment?"],
        ["growthMindset", "Does the applicant demonstrate openness to coaching, feedback, and continued growth?"],
        ["experienceValue", "Would the applicant’s current experiences or skills add useful value to the team?"],
      ];
      reviewForm = `<button type="button" class="team-review-launch" id="team-review-open">
        <span class="team-review-button-icon" aria-hidden="true">▤</span><span class="team-review-launch-copy"><strong>Internal Team Review</strong><small>${ownReview.id ? `Click to update your review of ${escapeHtml(applicantName)}` : `Click to review ${escapeHtml(applicantName)}`}</small></span><i aria-hidden="true">›</i>
      </button>
      <dialog class="team-review-dialog" id="team-review-dialog" aria-labelledby="team-review-dialog-title">
        <form method="dialog" class="team-review-modal">
          <header class="team-review-modal-head"><div class="team-review-modal-title"><h2 id="team-review-dialog-title">Team Internal Review</h2><p>Your perspective informs the coaching staff while remaining separate from the official decision.</p></div><span class="team-review-modal-divider" aria-hidden="true"></span><div class="team-review-modal-applicant"><small>Reviewing</small><strong>${escapeHtml(applicantName)}</strong></div><button type="button" class="team-review-close" id="team-review-close" aria-label="Close review form">×</button></header>
          <div class="team-review-modal-grid">
            <div class="team-review-main">
              <section class="team-review-rubric"><div class="team-review-section-title"><span>Quick assessment</span><b>Answer all four</b></div>
                ${rubricQuestions.map(([key, question], index) => `<div class="rubric-question"><div><small>0${index + 1}</small><p>${escapeHtml(question)}</p></div><div class="rubric-options" role="group" aria-label="${escapeHtml(question)}" aria-required="true">${["yes", "unsure", "no"].map(value => `<button type="button" class="rubric-option ${value} ${rubric[key] === value ? "selected" : ""}" data-rubric-key="${key}" data-rubric-value="${value}" aria-pressed="${rubric[key] === value}">${value === "yes" ? "Yes" : value === "no" ? "No" : "Not sure"}</button>`).join("")}</div></div>`).join("")}
              </section>
              <section class="team-review-written"><label for="captain-review-note"><span>Written assessment</span><small>Required — enter an assessment</small></label><textarea id="captain-review-note" class="captain-review-note" maxlength="2000" required aria-required="true" placeholder="Summarize the applicant's strengths, concerns, readiness, and any follow-up you recommend…">${escapeHtml(note)}</textarea></section>
            </div>
            <aside class="team-review-recommendation">
              <div class="captain-review-rating"><div class="captain-review-rating-head"><span>Overall rating <em>Required</em></span><strong id="captain-review-rating-preview">${rating || 5}</strong></div><input id="captain-review-rating-value" type="hidden" value="${rating}"><input class="captain-review-rating-slider" id="captain-review-rating" type="range" min="1" max="10" step="0.5" value="${rating || 5}" aria-label="Overall applicant rating from 1 to 10" aria-required="true"><div class="captain-review-rating-labels"><span>1 · Needs growth</span><span>10 · Exceptional</span></div></div>
              <div class="team-review-recommendation-heading"><h3>Your recommendation?</h3></div><input id="captain-review-decision" type="hidden" value="${recommendation}">
              <div class="captain-review-actions">
                <button type="button" class="captain-recommendation accept ${recommendation === "accepted" ? "selected" : ""}" data-captain-decision="accepted"><b>Accept</b><small>Strong fit for the team</small></button>
                <button type="button" class="captain-recommendation hold ${recommendation === "pending" ? "selected" : ""}" data-captain-decision="pending"><b>Hold</b><small>Needs more consideration</small></button>
                <button type="button" class="captain-recommendation decline ${recommendation === "declined" ? "selected" : ""}" data-captain-decision="declined"><b>Decline</b><small>Not the right fit now</small></button>
              </div>
              <button type="button" class="captain-review-save" id="captain-review-save">${ownReview.id ? "Update Internal Review" : "Submit Internal Review"}</button>
              <div class="captain-review-message" id="captain-review-message" aria-live="polite"></div>
            </aside>
          </div>
        </form>
      </dialog>
      <dialog class="team-review-exit-dialog" id="team-review-exit-dialog" aria-labelledby="team-review-exit-title" aria-describedby="team-review-exit-message">
        <div class="team-review-exit-card">
          <div class="team-review-exit-icon" aria-hidden="true">!</div>
          <span>Unsaved internal review</span>
          <h2 id="team-review-exit-title">Leave this review?</h2>
          <p id="team-review-exit-message">Choose whether to continue editing or close this review. Any unsaved changes will be discarded.</p>
          <div><button type="button" class="team-review-keep-editing" id="team-review-keep-editing">Keep Editing</button><button type="button" class="team-review-discard" id="team-review-discard">Discard Changes</button></div>
        </div>
      </dialog>`;
    }
    if (!isFinalReviewer()) return reviewForm;
    const counts = captainReviews.reduce((summary, review) => {
      const key = ["accepted", "declined"].includes(review.recommendation) ? review.recommendation : "pending";
      summary[key] += 1;
      return summary;
    }, { accepted: 0, pending: 0, declined: 0 });
    const rubricLabels = {
      followThrough: "Dependable follow-through",
      teamContribution: "Positive team contribution",
      growthMindset: "Openness to coaching and growth",
      experienceValue: "Useful experience or skills",
    };
    const rubricValueLabel = value => value === "yes" ? "Yes" : value === "no" ? "No" : "Not sure";
    const cards = captainReviews.length
      ? captainReviews.map(review => {
        const reviewerName = review.reviewerName || review.captainName || review.reviewerEmail || review.captainEmail || "Team reviewer";
        const recommendation = ["accepted", "declined"].includes(review.recommendation) ? review.recommendation : "pending";
        const positiveGrades = Object.values(review.rubric || {}).filter(value => value === "yes").length;
        const detailId = `captain-review-detail-${review.id}`;
        return `<tr class="captain-review-grid-row" data-review-grid-row="${escapeHtml(review.id)}" tabindex="0" aria-expanded="false" aria-controls="${escapeHtml(detailId)}">
          <td><strong>${escapeHtml(reviewerName)}</strong><small>${review.updatedAt ? `Updated ${escapeHtml(formatDate(review.updatedAt))}` : "Submission time unavailable"}</small></td>
          <td><b class="captain-review-grid-rating">${Number(review.rating) || "—"}<span>/10</span></b></td>
          <td><p class="captain-review-grid-assessment">${escapeHtml(review.note || "No written assessment provided.")}</p></td>
          <td><span class="captain-review-grade-summary"><b>${positiveGrades}/4</b> marked Yes</span></td>
          <td><span class="captain-review-recommendation ${escapeHtml(recommendation)}">${escapeHtml(recommendationLabel(recommendation))}</span></td>
        </tr>
        <tr class="captain-review-detail-row" id="${escapeHtml(detailId)}" hidden>
          <td colspan="5"><div class="captain-review-detail-panel">
            <div class="captain-review-rubric-detail">${Object.entries(rubricLabels).map(([key, label]) => {
              const value = review.rubric?.[key] || "unsure";
              return `<div><span>${escapeHtml(label)}</span><b class="rubric-mark ${escapeHtml(value)}">${escapeHtml(rubricValueLabel(value))}</b></div>`;
            }).join("")}</div>
            <button type="button" class="captain-review-delete" data-delete-captain-review="${escapeHtml(review.id)}" data-reviewer-name="${escapeHtml(reviewerName)}" aria-label="Delete review by ${escapeHtml(reviewerName)}">${icon("delete")}<span>Delete review</span></button>
          </div></td>
        </tr>`;
      }).join("")
      : '<tr><td colspan="5"><div class="captain-review-empty">No team reviews have been submitted for this applicant.</div></td></tr>';
    return `<div class="captain-review-overview ${reviewForm ? "has-launch" : "heading-only"}">${reviewForm}
      ${reviewForm ? '<span class="captain-review-overview-divider" aria-hidden="true"></span>' : ""}
      <div class="captain-review-heading-copy"><h3>Team recommendations</h3><small>Compare recommendations at a glance, then open any row for the complete assessment.</small></div>
      ${reviewForm ? '<span class="captain-review-overview-divider" aria-hidden="true"></span>' : ""}
      <div class="captain-review-tally"><div class="captain-review-breakdown"><b class="reviews"><span>Reviews</span><strong>${captainReviews.length}</strong></b><b class="accept"><span>Accept</span><strong>${counts.accepted}</strong></b><b class="hold"><span>Hold</span><strong>${counts.pending}</strong></b><b class="decline"><span>Decline</span><strong>${counts.declined}</strong></b></div></div>
    </div><section class="captain-reviews-panel">
      <div class="captain-review-grid-wrap"><table class="captain-review-grid"><thead><tr><th>Reviewer</th><th>Overall rating</th><th>Written assessment</th><th>Quick grades</th><th>Recommendation</th></tr></thead><tbody>${cards}</tbody></table></div>
    </section>`;
  }
  function icon(name, className = "") {
    const assets = {
      applicants: "applicants", pending: "pending", accepted: "accepted", declined: "declined",
      grade: "grade", debate: "debate", calendar: "calendar", commitments: "commitments",
      check: "accepted", hold: "hold", person: "person", guardian: "guardian", phone: "phone",
      clipboard: "clipboard", info: "info", lock: "coach-notes", search: "search", delete: "declined",
      actionAccept: "action-accept", actionHold: "action-hold", actionDecline: "action-decline",
      actionDelete: "action-delete-white",
    };
    const asset = assets[name] || "info";
    return `<img class="icon-art icon-${asset} ${className}" src="images/application-icons/${asset}.png" alt="" aria-hidden="true">`;
  }
  function renderList() {
    const list = filteredApplications();
    $("visible-count").textContent = `${list.length} total`;
    const selectedIndex = list.findIndex(item => item.id === selectedId);
    $("application-first").disabled = selectedIndex <= 0;
    $("application-previous").disabled = selectedIndex <= 0;
    $("application-next").disabled = selectedIndex < 0 || selectedIndex >= list.length - 1;
    $("application-last").disabled = selectedIndex < 0 || selectedIndex >= list.length - 1;
    $("application-list").innerHTML = list.length ? list.map(item => {
      const student = item.student || {};
       return `<button type="button" class="application-row ${item.id === selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="row-main">
           <div class="row-copy"><div class="row-name">${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</div><div class="row-context">${escapeHtml(student.grade || "Grade unavailable")} · ${escapeHtml(student.studentId || "No student ID")}</div><div class="row-submitted">Submitted ${escapeHtml(formatDate(item.createdAt))}</div><div class="row-status">${statusBadge(status(item))}${item.hidden === true ? hiddenBadge() : ""}</div></div>
        </div>
      </button>`;
    }).join("") : '<div class="empty">No applications match these filters.</div>';
    document.querySelectorAll(".application-row").forEach(row => row.addEventListener("click", () => {
      selectedId = row.dataset.id;
      renderList();
      renderDetail();
    }));
  }
  function syncApplicationListHeight() {
    const list = $("application-list");
    const queuePanel = document.querySelector(".queue-panel");
    if (!list) return;
    if (!queuePanel || window.innerWidth <= 760) {
      list.style.removeProperty("max-height");
      return;
    }
    const reviewBar = isFinalReviewer() ? document.querySelector(".review-section") : null;
    const boundary = reviewBar?.getBoundingClientRect().top || queuePanel.getBoundingClientRect().bottom;
    const availableHeight = Math.floor(boundary - list.getBoundingClientRect().top - 8);
    list.style.maxHeight = `${Math.max(140, availableHeight)}px`;
  }
  function navigateApplications(destination) {
    const list = filteredApplications();
    if (!list.length) return;
    const currentIndex = list.findIndex(item => item.id === selectedId);
    let targetIndex = currentIndex;
    if (destination === "first") targetIndex = 0;
    if (destination === "previous") targetIndex = Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
    if (destination === "next") targetIndex = Math.min(list.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
    if (destination === "last") targetIndex = list.length - 1;
    selectedId = list[targetIndex].id;
    renderList();
    renderDetail();
    requestAnimationFrame(() => {
      document.querySelector(`.application-row[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }
  function fact(label, value) {
    return `<div class="fact"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></div>`;
  }
  function answer(label, value, iconName) {
    const text = String(value || "No response provided.");
    const answerIndex = longAnswers.push({ label, text }) - 1;
    return `<div class="answer-box"><span>${icon(iconName, "answer-icon")}${escapeHtml(label)}</span><div class="answer"><span class="answer-preview" data-answer-index="${answerIndex}">${escapeHtml(text)}</span><button type="button" class="answer-full-link" data-answer-index="${answerIndex}" hidden>Click here to read more</button></div></div>`;
  }
  function googleDriveDocument(value) {
    const text = String(value || "").trim();
    const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
    if (!urlMatch) return { error: "No Google Drive document link was provided with this application." };
    let sourceUrl;
    try {
      sourceUrl = new URL(urlMatch[0].replace(/[),.;]+$/, ""));
    } catch {
      return { error: "The submitted essay document link is not a valid URL." };
    }
    const host = sourceUrl.hostname.toLowerCase();
    const pathMatch = sourceUrl.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
    const driveFileMatch = sourceUrl.pathname.match(/^\/file\/d\/([^/]+)/);
    let previewUrl = "";
    if (host === "docs.google.com" && pathMatch) {
      const [, type, id] = pathMatch;
      previewUrl = type === "presentation"
        ? `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/embed`
        : `https://docs.google.com/${type}/d/${encodeURIComponent(id)}/preview`;
    } else if (host === "drive.google.com" && driveFileMatch) {
      previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(driveFileMatch[1])}/preview`;
    } else if (host === "drive.google.com" && sourceUrl.pathname === "/open" && sourceUrl.searchParams.get("id")) {
      previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(sourceUrl.searchParams.get("id"))}/preview`;
    } else if (host === "drive.google.com" || host === "docs.google.com") {
      return { sourceUrl: sourceUrl.href, error: "This Google Drive link format cannot be previewed. Ask the student to submit a direct file, Google Doc, Sheet, or Slides link." };
    } else {
      return { sourceUrl: sourceUrl.href, error: "The submitted essay link is not a Google Drive or Google Docs link." };
    }
    return { sourceUrl: sourceUrl.href, previewUrl };
  }
  function openEssayReader(driveDocument, trigger) {
    const dialog = document.createElement("dialog");
    dialog.className = "essay-reader-dialog";
    dialog.setAttribute("aria-labelledby", "essay-reader-title");
    dialog.innerHTML = `<div class="essay-reader-shell"><header class="essay-reader-header"><div class="essay-reader-heading"><span>Application essay / document</span><h2 id="essay-reader-title">Full document reader</h2></div><button type="button" class="essay-reader-close">Close</button></header><iframe class="essay-reader-frame" title="Submitted essay document in full-screen reader"></iframe></div>`;
    const closeButton = dialog.querySelector(".essay-reader-close");
    const frame = dialog.querySelector(".essay-reader-frame");
    frame.src = driveDocument.previewUrl;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    const closeReader = () => dialog.close();
    closeButton.addEventListener("click", closeReader);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeReader();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      trigger?.focus();
    }, { once: true });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      closeButton.focus();
    } else {
      dialog.setAttribute("open", "");
    }
  }
  function openAnswerDialog(answerDetail, trigger) {
    const dialog = $("answer-dialog");
    $("answer-dialog-title").textContent = answerDetail.label;
    $("answer-dialog-text").textContent = answerDetail.text;
    dialog.style.removeProperty("left");
    dialog.style.removeProperty("top");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.hidden = false;
  }
  function confirmReviewAction({ title, message, confirmLabel, danger = false, singleAction = false }) {
    const dialog = $("review-confirm-dialog");
    $("review-confirm-title").textContent = title;
    $("review-confirm-message").textContent = message;
    const confirmButton = $("review-confirm-submit");
    confirmButton.textContent = confirmLabel;
    confirmButton.classList.toggle("danger", danger);
    $("review-confirm-cancel").hidden = singleAction;
    dialog.returnValue = "";
    return new Promise(resolve => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }
  function quickTile(iconName, label, value, isExpandable = false) {
    const text = String(value || "—");
    if (!isExpandable) {
      return `<div class="quick-tile">${icon(iconName)}<div><span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b></div></div>`;
    }
    const answerIndex = longAnswers.push({ label, text }) - 1;
    return `<div class="quick-tile quick-tile-expandable">${icon(iconName)}<div><span>${escapeHtml(label)}</span><b class="quick-preview" data-answer-index="${answerIndex}">${escapeHtml(text)}</b><button type="button" class="answer-full-link quick-full-link" data-answer-index="${answerIndex}" hidden>Click here to read more</button></div></div>`;
  }
  function renderDetail() {
    const item = applications.find(application => application.id === selectedId);
    if (!item) {
      stopCaptainReviewListening();
      $("detail").innerHTML = '<div class="detail-empty">Select an application from the queue to view private details and record a decision.</div>';
      return;
    }
    listenForCaptainReviews(item.id);
    const student = item.student || {};
    const eventDetails = item.eventDetails || {};
    longAnswers = [];
    const commitmentEntries = Object.entries(COMMITMENT_LABELS).filter(([key]) => item.commitments?.[key]);
    const commitments = commitmentEntries.map(([, label]) => `<span class="commitment">${icon("check", "commitment-icon")} ${escapeHtml(label)}</span>`).join("") || '<span class="answer">No commitments recorded.</span>';
    const decision = status(item);
    const reviewRating = Number.isInteger(Number(item.reviewRating) * 2) && Number(item.reviewRating) >= 1 && Number(item.reviewRating) <= 10 ? Number(item.reviewRating) : 0;
    const reviewDate = item.reviewedAt ? formatDate(item.reviewedAt) : "";
    $("detail").innerHTML = `<div class="detail-content">
      <header class="detail-heading"><div class="detail-title-row"><h2>${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</h2><p class="detail-submission">${icon("clipboard", "detail-meta-icon")}<strong>Submitted:</strong> ${escapeHtml(formatDate(item.createdAt))}</p><div class="detail-inline-status badges">${statusBadge(decision)}${item.hidden === true ? hiddenBadge() : ""}</div></div></header>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Quick profile</h3><div class="quick-profile-grid">${quickTile("grade", "Grade", student.grade)}${quickTile("debate", "Debate experience", student.debateExperience, true)}${quickTile("calendar", "Schedule", item.answers?.scheduleConflicts, true)}${quickTile("commitments", "Commitments", `${commitmentEntries.length} confirmed`)}</div></section>
      <section class="section"><div class="contact-columns"><div class="info-card aligned-info-card"><h3>${icon("person", "card-heading-icon")}Student information</h3><div class="detail-grid">${fact("Student ID", student.studentId)}${fact("School Email", student.schoolEmail)}${fact("Response Email", student.responseEmail || student.personalEmail)}${fact("Debate partner", student.partner)}</div></div><div class="commitments-card aligned-commitments-card"><h3>${icon("commitments", "card-heading-icon")}Commitments</h3><div class="commitments">${commitments}</div></div></div></section>
      <section class="section"><h3 class="section-title">${icon("calendar", "heading-icon")}Event details</h3><div class="info-card"><div class="detail-grid">${fact("QST info session", eventDetails.qstSession)}${fact("September 22", eventDetails.september22Attendance)}${fact("September 23", eventDetails.september23Attendance)}${fact("Tabroom account", eventDetails.tabroomAccount)}${fact("Contract agreement", eventDetails.contractAgreement)}${fact("Contract return", eventDetails.contractReturn)}${fact("Tournament dates", Array.isArray(eventDetails.tournamentDates) ? eventDetails.tournamentDates.join(", ") : "")}</div></div></section>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Application responses</h3><div class="responses-grid">${answer("Why do you want to join?", item.answers?.whyJoin, "info")}${answer("Debate experience", item.answers?.experienceDetail, "debate")}${answer("Required essay / document", item.answers?.requiredEssay, "info")}${answer("Other activities and conflicts", item.answers?.scheduleConflicts, "calendar")}${answer("Anything else", item.answers?.anythingElse, "info")}${answer("Comments or concerns", item.answers?.questionsForCoach, "info")}</div></section>
      <section class="review-section"><div class="review-card"><div class="review-controls"><h3 class="section-title">${icon("lock", "heading-icon")}Coach Notes</h3><div class="review-note-wrap"><textarea class="review-note" id="review-note" maxlength="2000" aria-label="Coach review notes" placeholder="Add observations, strengths, concerns, or follow-up details…">${escapeHtml(item.reviewNote || "")}</textarea></div><div class="applicant-rating" id="applicant-rating"><input id="review-rating" type="hidden" value="${reviewRating || ""}"><button type="button" class="rating-trigger" id="rating-trigger" aria-expanded="false" aria-controls="rating-popover"><span>Rating</span><strong id="rating-value">${reviewRating || "—"}</strong><small>out of 10</small><b aria-hidden="true">▴</b></button><div class="rating-popover" id="rating-popover" hidden><div class="rating-popover-head"><span>Choose a rating</span><strong id="rating-preview">${reviewRating || 5}</strong></div><input class="rating-slider" id="rating-slider" type="range" min="1" max="10" step="1" value="${reviewRating || 5}" aria-label="Applicant rating from 1 to 10"><div class="rating-slider-labels"><span>1 · Needs growth</span><span>10 · Exceptional</span></div></div></div><div class="decision-panel"><input id="review-decision" type="hidden" value="${decision}"><div class="decision-buttons"><button type="button" class="decision-button accept ${decision === "accepted" ? "selected" : ""}" data-decision="accepted"><div class="decision-main">${icon("actionAccept")}<span>Accept</span></div><small>Admit to team</small></button><button type="button" class="decision-button hold" data-decision="pending"><div class="decision-main">${icon("actionHold")}<span>Hold</span></div><small>Consider later</small></button><button type="button" class="decision-button decline ${decision === "declined" ? "selected" : ""}" data-decision="declined"><div class="decision-main">${icon("actionDecline")}<span>Decline</span></div><small>Not a fit</small></button><button type="button" class="decision-button review-action-hide" id="review-hide-application" ${item.hidden === true ? 'disabled aria-disabled="true"' : ""}><div class="decision-main">${icon("info")}<span>${item.hidden === true ? "Hidden" : "Hide"}</span></div><small>${item.hidden === true ? "Record kept" : "Keep record"}</small></button><button type="button" class="decision-button review-action-delete" id="review-delete-application"><div class="decision-main">${icon("actionDelete")}<span>Delete</span></div><small>From database</small></button></div></div></div><div class="save-row"><span class="save-message" id="save-message" aria-live="polite"></span></div>${item.reviewedBy ? `<div class="audit">Last reviewed by <b>${escapeHtml(item.reviewedBy)}</b>${reviewDate ? ` on <b>${escapeHtml(reviewDate)}</b>` : ""}.</div>` : ""}</div></section>
    </div>`;
      const coachDraft = coachReviewDrafts.get(item.id);
      if (coachDraft && isFinalReviewer()) {
        const noteField = $("review-note");
        const ratingField = $("review-rating");
        if (noteField) noteField.value = coachDraft.note;
        if (ratingField) ratingField.value = coachDraft.rating || "";
        const ratingValue = $("rating-value");
        if (ratingValue) ratingValue.textContent = coachDraft.rating || "—";
      }
      // Turn the record into five useful review tabs while keeping the action dock independent.
     const content = $("detail").querySelector(".detail-content");
     const sections = Array.from(content.querySelectorAll(":scope > .section"));
     const tabBar = document.createElement("nav");
     tabBar.className = "detail-tabs";
     tabBar.setAttribute("aria-label", "Application detail sections");
       [["overview","Overview"],["essay","Essay / Document"],["logistics","Logistics"],["review","Review"]].forEach(([key,label]) => {
       const button = document.createElement("button");
        button.type = "button"; button.className = `detail-tab${key === activeDetailTab ? " active" : ""}`;
       button.dataset.tab = key; button.textContent = label;
       tabBar.appendChild(button);
     });
      const heading = content.querySelector(".detail-heading");
      const commandBar = document.createElement("div");
      commandBar.className = "detail-command-bar";
      content.insertBefore(commandBar, content.firstChild);
      commandBar.appendChild(tabBar);
      commandBar.appendChild(heading);
      // The source sections remain intact; only their presentation is reorganized.
      const groups = { overview: sections.slice(0,2), essay: sections.slice(3,4), logistics: sections.slice(2,3), review: [] };
      const responseCards = Array.from(sections[3].querySelectorAll(".answer-box"));
       const overviewResponseCards = responseCards.filter((card, index) => index !== 2 && index !== 3);
       const scheduleCard = sections[0].querySelectorAll(".quick-profile-grid > .quick-tile")[2];
       const activitiesCard = responseCards[3];
     Object.entries(groups).forEach(([key, group]) => {
       const pane = document.createElement("div");
       pane.className = "detail-tab-pane"; pane.dataset.pane = key;
        if (key !== activeDetailTab) pane.hidden = true;
       group.forEach(node => pane.appendChild(node));
        if (key === "overview") {
          const overviewGrid = document.createElement("div");
          overviewGrid.className = "overview-dashboard-grid";
          const quickCards = Array.from(pane.querySelectorAll(".quick-profile-grid > .quick-tile"));
           const gradeCard = quickCards[0];
           const studentInfoCard = pane.querySelector(".contact-columns > .info-card");
           const commitmentsCard = pane.querySelector(".contact-columns > .commitments-card");
           if (studentInfoCard) {
             studentInfoCard.classList.add("profile-with-grade");
             if (gradeCard) studentInfoCard.prepend(gradeCard);
             overviewGrid.appendChild(studentInfoCard);
           }
           if (commitmentsCard) overviewGrid.appendChild(commitmentsCard);
           overviewResponseCards.forEach((card, index) => {
             card.classList.add(index % 2 === 0 ? "overview-left-response" : "overview-right-response");
             card.style.gridRow = String(Math.floor(index / 2) + 2);
             overviewGrid.appendChild(card);
           });
          pane.replaceChildren(overviewGrid);
        }
          if (key === "essay") {
            const sourceCard = pane.querySelector(".answer-box");
            const driveDocument = googleDriveDocument(item.answers?.requiredEssay);
            if (sourceCard) {
              sourceCard.classList.add("essay-source-card");
              const answerContent = sourceCard.querySelector(".answer");
              if (answerContent) {
                answerContent.replaceChildren();
                if (driveDocument.sourceUrl) {
                  const sourceLink = document.createElement("a");
                  sourceLink.className = "essay-source-link";
                  sourceLink.href = driveDocument.sourceUrl;
                  sourceLink.target = "_blank";
                  sourceLink.rel = "noopener noreferrer";
                  sourceLink.textContent = driveDocument.sourceUrl;
                  answerContent.appendChild(sourceLink);
                } else {
                  const missingLink = document.createElement("span");
                  missingLink.className = "essay-source-missing";
                  missingLink.textContent = String(item.answers?.requiredEssay || "No response provided.");
                  answerContent.appendChild(missingLink);
                }
              }
            }
            const previewCard = document.createElement("section");
            previewCard.className = "essay-preview-card";
             previewCard.innerHTML = `<h3>${icon("clipboard", "answer-icon")}Essay document contents</h3><div class="essay-preview-body"></div>`;
            const previewBody = previewCard.querySelector(".essay-preview-body");
            if (driveDocument.error) {
              previewBody.innerHTML = `<div class="essay-preview-error" role="status"><strong>Unable to open the essay document</strong><p>${escapeHtml(driveDocument.error)}</p></div>`;
            } else {
               const fullscreenButton = document.createElement("button");
               fullscreenButton.type = "button";
               fullscreenButton.className = "essay-fullscreen-button";
               fullscreenButton.textContent = "Full screen";
               fullscreenButton.setAttribute("aria-label", "Open essay document in full-screen reader");
               fullscreenButton.addEventListener("click", () => openEssayReader(driveDocument, fullscreenButton));
               previewCard.querySelector("h3").appendChild(fullscreenButton);
              previewBody.innerHTML = '<div class="essay-preview-status" role="status">Opening the submitted Google Drive document…</div>';
              const frame = document.createElement("iframe");
              frame.className = "essay-preview-frame";
              frame.title = "Submitted essay document";
              frame.src = driveDocument.previewUrl;
              frame.loading = "eager";
              frame.referrerPolicy = "strict-origin-when-cross-origin";
              let previewSettled = false;
              const previewTimeout = window.setTimeout(() => {
                if (previewSettled) return;
                frame.remove();
                previewBody.innerHTML = '<div class="essay-preview-error" role="alert"><strong>Unable to open the essay document</strong><p>Google Drive did not respond in time. Verify that the link works and that its sharing permissions allow coaches to view it.</p></div>';
              }, 15000);
              frame.addEventListener("load", () => {
                previewSettled = true;
                window.clearTimeout(previewTimeout);
                previewBody.querySelector(".essay-preview-status")?.remove();
                frame.classList.add("loaded");
              });
              frame.addEventListener("error", () => {
                previewSettled = true;
                window.clearTimeout(previewTimeout);
                frame.remove();
                previewBody.innerHTML = '<div class="essay-preview-error" role="alert"><strong>Unable to open the essay document</strong><p>Google Drive did not load the submitted document. Verify that the link works and that its sharing permissions allow coaches to view it.</p></div>';
              });
              previewBody.appendChild(frame);
            }
            pane.appendChild(previewCard);
          }
         if (key === "logistics") {
            const logisticsSplit = document.createElement("div");
            logisticsSplit.className = "logistics-split";
            if (scheduleCard) logisticsSplit.appendChild(scheduleCard);
            if (activitiesCard) logisticsSplit.appendChild(activitiesCard);
            pane.prepend(logisticsSplit);
         }
         if (key === "review") {
           pane.innerHTML = captainReviewPanel(item.id, [student.firstName, student.lastName].filter(Boolean).join(" ") || "this applicant");
       }
       content.appendChild(pane);
     });
      if (!isFinalReviewer()) content.querySelector(":scope > .review-section")?.remove();
     tabBar.querySelectorAll(".detail-tab").forEach(button => button.addEventListener("click", () => {
        activeDetailTab = button.dataset.tab;
       tabBar.querySelectorAll(".detail-tab").forEach(tab => tab.classList.toggle("active", tab === button));
       Object.entries(groups).forEach(([key]) => { const pane = content.querySelector(`[data-pane="${key}"]`); if (pane) pane.hidden = key !== button.dataset.tab; });
     }));
      const captainDecision = $("captain-review-decision");
      if (captainDecision) {
        const captainNote = $("captain-review-note");
         const captainRating = $("captain-review-rating");
          const captainRatingValue = $("captain-review-rating-value");
         const reviewDialog = $("team-review-dialog");
          const exitDialog = $("team-review-exit-dialog");
          const requestReviewClose = () => {
            if (!exitDialog.open) exitDialog.showModal();
          };
         $("team-review-open").addEventListener("click", () => reviewDialog.showModal());
          $("team-review-close").addEventListener("click", requestReviewClose);
          reviewDialog.addEventListener("click", event => { if (event.target === reviewDialog) requestReviewClose(); });
          reviewDialog.addEventListener("cancel", event => {
            event.preventDefault();
            requestReviewClose();
          });
          $("team-review-keep-editing").addEventListener("click", () => {
            exitDialog.close();
            captainNote.focus();
          });
          $("team-review-discard").addEventListener("click", () => {
            captainReviewDrafts.delete(item.id);
            exitDialog.close();
            reviewDialog.close();
            renderDetail();
          });
         const rubricState = Object.fromEntries([...document.querySelectorAll("[data-rubric-key].selected")].map(button => [button.dataset.rubricKey, button.dataset.rubricValue]));
          const saveReviewDraft = () => captainReviewDrafts.set(item.id, { note: captainNote.value, decision: captainDecision.value, rating: captainRatingValue.value, rubric: { ...rubricState } });
        captainNote.addEventListener("input", () => {
           saveReviewDraft();
        });
          captainRating.addEventListener("input", () => {
            $("captain-review-rating-preview").textContent = captainRating.value;
          });
          captainRating.addEventListener("change", () => {
            captainRatingValue.value = captainRating.value;
            saveReviewDraft();
          });
         document.querySelectorAll("[data-rubric-key]").forEach(button => button.addEventListener("click", () => {
           rubricState[button.dataset.rubricKey] = button.dataset.rubricValue;
           document.querySelectorAll(`[data-rubric-key="${button.dataset.rubricKey}"]`).forEach(control => {
             const selected = control === button;
             control.classList.toggle("selected", selected);
             control.setAttribute("aria-pressed", String(selected));
           });
           saveReviewDraft();
         }));
        document.querySelectorAll("[data-captain-decision]").forEach(button => button.addEventListener("click", () => {
          captainDecision.value = button.dataset.captainDecision;
           saveReviewDraft();
          document.querySelectorAll("[data-captain-decision]").forEach(control => control.classList.toggle("selected", control === button));
        }));
        $("captain-review-save").addEventListener("click", () => saveCaptainReview(item.id));
      }
      if (isFinalReviewer()) {
       document.querySelectorAll("[data-review-grid-row]").forEach(row => {
         const toggleDetails = () => {
           const detail = $(row.getAttribute("aria-controls"));
           const willOpen = Boolean(detail?.hidden);
           if (willOpen) {
             document.querySelectorAll("[data-review-grid-row]").forEach(otherRow => {
               if (otherRow === row) return;
               const otherDetail = $(otherRow.getAttribute("aria-controls"));
               if (otherDetail) otherDetail.hidden = true;
               otherRow.setAttribute("aria-expanded", "false");
               otherRow.classList.remove("expanded");
             });
           }
           if (detail) detail.hidden = !willOpen;
           row.setAttribute("aria-expanded", String(willOpen));
           row.classList.toggle("expanded", willOpen);
         };
         row.addEventListener("click", toggleDetails);
         row.addEventListener("keydown", event => {
           if (event.key !== "Enter" && event.key !== " ") return;
           event.preventDefault();
           toggleDetails();
         });
       });
       document.querySelectorAll("[data-delete-captain-review]").forEach(button => button.addEventListener("click", event => {
         event.stopPropagation();
         deleteCaptainReview(item.id, button.dataset.deleteCaptainReview, button.dataset.reviewerName, button);
       }));
       const ratingTrigger = $("rating-trigger");
      const ratingPopover = $("rating-popover");
      const ratingSlider = $("rating-slider");
       ratingSlider.step = "0.5";
      const closeRating = () => {
       ratingPopover.classList.remove("open");
       ratingTrigger.setAttribute("aria-expanded", "false");
       window.setTimeout(() => { if (!ratingPopover.classList.contains("open")) ratingPopover.hidden = true; }, 220);
      };
       $("review-note").addEventListener("input", () => {
        coachReviewDrafts.set(item.id, { note: $("review-note").value, rating: $("review-rating").value });
       });
      ratingTrigger.addEventListener("click", () => {
       const opening = ratingPopover.hidden;
       if (!opening) return closeRating();
       ratingPopover.hidden = false;
       ratingTrigger.setAttribute("aria-expanded", "true");
       requestAnimationFrame(() => ratingPopover.classList.add("open"));
       ratingSlider.focus();
      });
      ratingSlider.addEventListener("input", () => { $("rating-preview").textContent = ratingSlider.value; });
      ratingSlider.addEventListener("change", () => {
       $("review-rating").value = ratingSlider.value;
       $("rating-value").textContent = ratingSlider.value;
       coachReviewDrafts.set(item.id, { note: $("review-note").value, rating: ratingSlider.value });
       closeRating();
       ratingTrigger.focus();
      });
      $("applicant-rating").addEventListener("focusout", () => {
       window.setTimeout(() => { if (!$("applicant-rating").contains(document.activeElement)) closeRating(); }, 0);
      });
      $("applicant-rating").addEventListener("keydown", event => {
       if (event.key === "Escape") { closeRating(); ratingTrigger.focus(); }
      });
     document.querySelectorAll(".decision-button[data-decision]").forEach(button => button.addEventListener("click", async () => {
       const rating = Number($("review-rating").value);
        const note = $("review-note").value.trim();
        if (!Number.isInteger(rating * 2) || rating < 1 || rating > 10) {
        await confirmReviewAction({
         title: "Rating required",
         message: "Choose an applicant rating from 1 to 10 before recording a decision.",
         confirmLabel: "Close",
         singleAction: true
        });
        ratingTrigger.focus();
        return;
       }
      const decisionLabel = button.dataset.decision === "accepted" ? "Accept" : button.dataset.decision === "declined" ? "Decline" : "Hold";
      if (!(await confirmReviewAction({
       title: `Confirm ${decisionLabel}`,
       message: `Can I write this ${decisionLabel.toLowerCase()} decision, rating, and coach notes to the database?`,
       confirmLabel: `Yes, ${decisionLabel.toLowerCase()}`
      }))) return;
      $("review-decision").value = button.dataset.decision;
       document.querySelectorAll(".decision-button[data-decision]").forEach(control => {
         const selected = control === button && button.dataset.decision !== "pending";
        control.classList.toggle("selected", selected);
        control.setAttribute("aria-pressed", String(selected));
       });
        await saveDecision(item.id, button, { decision: button.dataset.decision, internalNote: note, rating });
        button.blur();
    }));
    requestAnimationFrame(() => document.querySelectorAll(".answer-preview, .quick-preview").forEach(preview => {
      const link = preview.nextElementSibling;
      if (link && (preview.scrollWidth > preview.clientWidth + 1 || preview.scrollHeight > preview.clientHeight + 1)) link.hidden = false;
    }));
    document.querySelectorAll(".answer-full-link").forEach(button => button.addEventListener("click", () => {
      const answerDetail = longAnswers[Number(button.dataset.answerIndex)];
      if (answerDetail) openAnswerDialog(answerDetail, button);
    }));
     $("review-hide-application").addEventListener("click", () => hideApplication(item));
      $("review-delete-application").addEventListener("click", () => deleteApplication(item));
      }
  }
  async function saveCaptainReview(applicationId) {
    const note = $("captain-review-note").value.trim();
    const decision = $("captain-review-decision").value;
    const rating = Number($("captain-review-rating-value").value);
    const rubric = Object.fromEntries([...document.querySelectorAll("[data-rubric-key].selected")].map(button => [button.dataset.rubricKey, button.dataset.rubricValue]));
    const button = $("captain-review-save");
    const message = $("captain-review-message");
    if (!Number.isInteger(rating * 2) || rating < 1 || rating > 10) {
      message.textContent = "Choose an applicant rating from 1 to 10.";
      $("captain-review-rating").focus();
      return;
    }
    if (!["accepted", "pending", "declined"].includes(decision)) {
      message.textContent = "Choose Accept, Hold, or Decline before submitting.";
      document.querySelector("[data-captain-decision]")?.focus();
      return;
    }
    if (["followThrough", "teamContribution", "growthMindset", "experienceValue"].some(key => !rubric[key])) {
      message.textContent = "Complete all four quick assessment questions.";
      document.querySelector(".rubric-question:not(:has(.rubric-option.selected)) .rubric-option")?.focus();
      return;
    }
    if (!note) {
      message.textContent = "Write your review before submitting.";
      $("captain-review-note").focus();
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    message.textContent = "Saving your review…";
    activeDetailTab = "review";
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "captainReview", applicationId, decision, internalNote: note, rating, rubric }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save your review.");
      captainReviewDrafts.delete(applicationId);
      message.textContent = "Your team review was saved.";
      $("team-review-dialog")?.close();
    } catch (error) {
      message.textContent = error.message || "Unable to save your review.";
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
  async function deleteCaptainReview(applicationId, reviewerUid, reviewerName, button) {
    if (!(await confirmReviewAction({
      title: "Delete team review?",
      message: `This permanently removes the review posted by ${reviewerName || "this reviewer"}. The application and all other reviews will remain unchanged.`,
      confirmLabel: "Yes, delete review",
      danger: true
    }))) return;
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Deleting…";
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "deleteCaptainReview", applicationId, reviewerUid }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to delete the team review.");
      button.textContent = "Deleted";
    } catch (error) {
      alert(error.message || "Unable to delete the team review.");
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = originalHtml;
    }
  }
  async function hideApplication(item) {
    if (item.hidden === true) return;
    if (!(await confirmReviewAction({
      title: "Hide application?",
      message: "This keeps the complete record in the database but removes it from the default application queue and summary counts.",
      confirmLabel: "Yes, hide"
    }))) return;
    const button = $("review-hide-application");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "hide", applicationId: item.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to hide the application.");
    } catch (error) {
      alert(error.message || "Unable to hide the application.");
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
  async function deleteApplication(item) {
    if (!(await confirmReviewAction({
      title: "Delete application?",
      message: "This permanently removes the application from the database and cannot be undone.",
      confirmLabel: "Yes, delete",
      danger: true
    }))) return;
    const buttons = [$("delete-application"), $("review-delete-application")].filter(Boolean);
    buttons.forEach(button => {
      button.disabled = true;
      button.textContent = "Deleting…";
    });
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete", applicationId: item.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to delete the application.");
      selectedId = "";
    } catch (error) {
      alert(error.message || "Unable to delete the application.");
      buttons.forEach(button => {
        button.disabled = false;
        button.innerHTML = `${icon("delete")}Delete entry`;
      });
    }
  }
  async function saveDecision(applicationId, button, review) {
    const message = $("save-message");
    const decisionButtons = [...document.querySelectorAll(".decision-button[data-decision]")];
    decisionButtons.forEach(control => { control.disabled = true; });
    button.setAttribute("aria-busy", "true");
    message.textContent = "Saving secure review…";
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId, decision: review.decision, internalNote: review.internalNote, rating: review.rating }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save the review decision.");
      coachReviewDrafts.delete(applicationId);
      message.textContent = "Decision saved. Refreshing the review record…";
    } catch (error) {
      message.textContent = error.message || "Unable to save the review decision.";
      alert(message.textContent);
    } finally {
      decisionButtons.forEach(control => { control.disabled = false; });
      button.removeAttribute("aria-busy");
    }
  }
  function render() {
    setMetrics();
    renderList();
    renderDetail();
    requestAnimationFrame(syncApplicationListHeight);
  }
  function beginListening() {
    if (unsubscribe) unsubscribe();
    if (!isFinalReviewer()) {
      unsubscribe = null;
      currentUser.getIdToken().then(token => fetch(REVIEW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "listCaptainApps" }),
      })).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "Unable to load applications.");
        applications = Array.isArray(result.applications) ? result.applications : [];
        const visible = filteredApplications();
        if (!visible.some(item => item.id === selectedId)) selectedId = visible[0]?.id || "";
        render();
        unsubscribe = db.collection("captain_application_queue").onSnapshot(snapshot => {
          applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const refreshedVisible = filteredApplications();
          if (!refreshedVisible.some(item => item.id === selectedId)) selectedId = refreshedVisible[0]?.id || "";
          if (isReviewEditor(document.activeElement)) {
            setMetrics();
            renderList();
            captainReviewRenderPending = true;
            return;
          }
          render();
        }, error => {
          $("application-list").innerHTML = `<div class="empty">Live application updates are unavailable: ${escapeHtml(error.message || "Permission denied.")}</div>`;
        });
      }).catch(error => {
        $("application-list").innerHTML = `<div class="empty">Unable to load applications: ${escapeHtml(error.message || "Permission denied.")}</div>`;
      });
      return;
    }
    unsubscribe = db.collection("applications").onSnapshot(snapshot => {
      applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const visible = filteredApplications();
      if (selectedId && !visible.some(item => item.id === selectedId)) selectedId = "";
      if (!selectedId && visible.length) selectedId = visible[0].id;
      if (isReviewEditor(document.activeElement)) {
        setMetrics();
        renderList();
        captainReviewRenderPending = true;
        return;
      }
      render();
    }, error => {
      $("application-list").innerHTML = `<div class="empty">Unable to load applications: ${escapeHtml(error.message || "Permission denied.")}</div>`;
    });
  }
  ["search", "decision-filter", "grade-filter", "sort", "show-hidden-records"].forEach(id => $(id).addEventListener(id === "search" ? "input" : "change", () => {
    setMetrics();
    renderList();
    const visible = filteredApplications();
    if (selectedId && !visible.some(item => item.id === selectedId)) {
      selectedId = visible[0]?.id || "";
      renderList();
      renderDetail();
    }
  }));
  $("clear-filters").addEventListener("click", () => {
    $("search").value = "";
    $("decision-filter").value = "all";
    $("grade-filter").value = "all";
    $("sort").value = "newest";
    $("show-hidden-records").checked = false;
    setMetrics();
    renderList();
    const visible = filteredApplications();
    if (!visible.some(item => item.id === selectedId)) {
      selectedId = visible[0]?.id || "";
      renderList();
      renderDetail();
    }
  });
  ["first", "previous", "next", "last"].forEach(destination => {
    $(`application-${destination}`).addEventListener("click", () => navigateApplications(destination));
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const target = event.target;
    if (target instanceof Element && (
      target.matches("input, textarea, select, [contenteditable='true']") ||
      target.closest("input, textarea, select, [contenteditable='true']")
    )) return;
    if (!$("dashboard") || $("dashboard").hidden || !filteredApplications().length) return;
    event.preventDefault();
    navigateApplications(event.key === "ArrowUp" ? "previous" : "next");
  });
  document.addEventListener("focusout", event => {
    if (!isReviewEditor(event.target) || !captainReviewRenderPending) return;
    window.setTimeout(() => {
      if (isReviewEditor(document.activeElement)) return;
      captainReviewRenderPending = false;
      renderDetail();
    }, 0);
  });
  window.addEventListener("resize", syncApplicationListHeight);
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    if (!user) {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      stopCaptainReviewListening();
      applications = [];
      selectedId = "";
      show("auth-required");
      return;
    }
    $("app-userbar").classList.add("visible");
    $("app-name").textContent = portalWelcomeLabel(user.displayName, user.email);
    const access = await getPortalMemberAccess(user, db);
    const role = normalizePortalRole(access.role);
    currentRole = role;
    stopCaptainReviewListening();
    const rosterLink = $("applications-roster-link");
    if (rosterLink) rosterLink.hidden = !isFullAdminRole(role);
    $("app-name").textContent = portalWelcomeLabel(access.displayName || user.displayName, user.email);
    const rolePresentation = ROLE_PRESENTATION[role] || ROLE_PRESENTATION.member;
    $("app-role-badge").dataset.role = role;
    $("app-role-badge").querySelector(".mub-role-label").textContent = rolePresentation.label;
    if (!access.approved) { show("access-denied"); return; }
    show("dashboard");
    beginListening();
  });
  document.addEventListener("DOMContentLoaded", updateNotificationState);
})();
