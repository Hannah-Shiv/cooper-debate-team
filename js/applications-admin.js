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
  let longAnswers = [];

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
    const total = applications.length;
    const pendingApplications = applications.filter(item => status(item) === "pending");
    const isReviewed = item => timestampMillis(item.reviewedAt) > 0 || Boolean(item.reviewedBy);
    const pending = pendingApplications.filter(item => !isReviewed(item)).length;
    const hold = pendingApplications.filter(isReviewed).length;
    const accepted = applications.filter(item => status(item) === "accepted").length;
    const declined = applications.filter(item => status(item) === "declined").length;
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
      clipboard: "clipboard", info: "info", lock: "lock", search: "search", delete: "declined",
      actionAccept: "action-accept", actionHold: "action-hold", actionDecline: "action-decline",
      actionDelete: "action-delete",
    };
    const asset = assets[name] || "info";
    return `<img class="icon-art icon-${asset} ${className}" src="images/application-icons/${asset}.png" alt="" aria-hidden="true">`;
  }
  function renderList() {
    const list = filteredApplications();
    $("visible-count").textContent = `${list.length} total`;
    $("application-list").innerHTML = list.length ? list.map(item => {
      const student = item.student || {};
       return `<button type="button" class="application-row ${item.id === selectedId ? "active" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="row-main">
           <div class="row-copy"><div class="row-name">${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</div><div class="row-context">${escapeHtml(student.grade || "Grade unavailable")} · ${escapeHtml(student.studentId || "No student ID")}</div><div class="row-submitted">Submitted ${escapeHtml(formatDate(item.createdAt))}</div><div class="row-status">${statusBadge(status(item))}</div></div>
        </div>
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
    const text = String(value || "No response provided.");
    const answerIndex = longAnswers.push({ label, text }) - 1;
    return `<div class="answer-box"><span>${icon(iconName, "answer-icon")}${escapeHtml(label)}</span><div class="answer"><span class="answer-preview" data-answer-index="${answerIndex}">${escapeHtml(text)}</span><button type="button" class="answer-full-link" data-answer-index="${answerIndex}" hidden>Click here to read more</button></div></div>`;
  }
  function openAnswerDialog(answerDetail, trigger) {
    const dialog = $("answer-dialog");
    $("answer-dialog-title").textContent = answerDetail.label;
    $("answer-dialog-text").textContent = answerDetail.text;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.hidden = false;
    requestAnimationFrame(() => {
      const anchor = trigger.closest(".answer-box") || trigger;
      const anchorRect = anchor.getBoundingClientRect();
      const padding = 16;
      const left = Math.min(
        Math.max(padding, anchorRect.left + (anchorRect.width - dialog.offsetWidth) / 2),
        window.innerWidth - dialog.offsetWidth - padding
      );
      const top = Math.min(
        Math.max(padding, anchorRect.top + (anchorRect.height - dialog.offsetHeight) / 2),
        window.innerHeight - dialog.offsetHeight - padding
      );
      dialog.style.left = `${left}px`;
      dialog.style.top = `${top}px`;
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
      $("detail").innerHTML = '<div class="detail-empty">Select an application from the queue to view private details and record a decision.</div>';
      return;
    }
    const student = item.student || {};
    const eventDetails = item.eventDetails || {};
    longAnswers = [];
    const commitmentEntries = Object.entries(COMMITMENT_LABELS).filter(([key]) => item.commitments?.[key]);
    const commitments = commitmentEntries.map(([, label]) => `<span class="commitment">${icon("check", "commitment-icon")} ${escapeHtml(label)}</span>`).join("") || '<span class="answer">No commitments recorded.</span>';
    const decision = status(item);
    const reviewRating = Number.isInteger(Number(item.reviewRating)) && Number(item.reviewRating) >= 1 && Number(item.reviewRating) <= 10 ? Number(item.reviewRating) : 0;
    const reviewDate = item.reviewedAt ? formatDate(item.reviewedAt) : "";
    $("detail").innerHTML = `<div class="detail-content">
      <header class="detail-heading"><div class="detail-title-row"><h2>${escapeHtml([student.firstName, student.lastName].filter(Boolean).join(" ") || "Unnamed applicant")}</h2><p class="detail-submission">${icon("clipboard", "detail-meta-icon")}<strong>Submitted:</strong> ${escapeHtml(formatDate(item.createdAt))}</p><div class="detail-inline-status badges">${statusBadge(decision)}</div></div></header>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Quick profile</h3><div class="quick-profile-grid">${quickTile("grade", "Grade", student.grade)}${quickTile("debate", "Debate experience", student.debateExperience, true)}${quickTile("calendar", "Schedule", item.answers?.scheduleConflicts, true)}${quickTile("commitments", "Commitments", `${commitmentEntries.length} confirmed`)}</div></section>
      <section class="section"><div class="contact-columns"><div class="info-card aligned-info-card"><h3>${icon("person", "card-heading-icon")}Student information</h3><div class="detail-grid">${fact("Student ID", student.studentId)}${fact("School Email", student.schoolEmail)}${fact("Response Email", student.responseEmail || student.personalEmail)}${fact("Debate partner", student.partner)}</div></div><div class="commitments-card aligned-commitments-card"><h3>${icon("commitments", "card-heading-icon")}Commitments</h3><div class="commitments">${commitments}</div></div></div></section>
      <section class="section"><h3 class="section-title">${icon("calendar", "heading-icon")}Event details</h3><div class="info-card"><div class="detail-grid">${fact("QST info session", eventDetails.qstSession)}${fact("September 22", eventDetails.september22Attendance)}${fact("September 23", eventDetails.september23Attendance)}${fact("Tabroom account", eventDetails.tabroomAccount)}${fact("Contract agreement", eventDetails.contractAgreement)}${fact("Contract return", eventDetails.contractReturn)}${fact("Tournament dates", Array.isArray(eventDetails.tournamentDates) ? eventDetails.tournamentDates.join(", ") : "")}</div></div></section>
      <section class="section"><h3 class="section-title">${icon("info", "heading-icon")}Application responses</h3><div class="responses-grid">${answer("Why do you want to join?", item.answers?.whyJoin, "info")}${answer("Debate experience", item.answers?.experienceDetail, "debate")}${answer("Required essay / document", item.answers?.requiredEssay, "info")}${answer("Other activities and conflicts", item.answers?.scheduleConflicts, "calendar")}${answer("Anything else", item.answers?.anythingElse, "info")}${answer("Comments or concerns", item.answers?.questionsForCoach, "info")}</div></section>
        <section class="review-section"><h3 class="section-title">${icon("lock", "heading-icon")}Administrative review · internal</h3><div class="review-card"><div class="review-controls"><div class="review-note-wrap"><div class="review-note-head"><label for="review-note">${icon("clipboard", "label-icon")}Coach review notes</label><div class="applicant-rating" id="applicant-rating"><span class="rating-caption">Applicant rating</span><input id="review-rating" type="hidden" value="${reviewRating || ""}"><div class="rating-roller" id="rating-roller" role="spinbutton" tabindex="0" aria-label="Applicant rating from 1 to 10" aria-valuemin="1" aria-valuemax="10"${reviewRating ? ` aria-valuenow="${reviewRating}"` : ""}><button type="button" class="roller-arrow" data-rating-delta="1" aria-label="Increase rating">▲</button><div class="roller-window"><span id="rating-value">${reviewRating || "—"}</span></div><button type="button" class="roller-arrow" data-rating-delta="-1" aria-label="Decrease rating">▼</button><small>/10</small></div></div></div><textarea class="review-note" id="review-note" maxlength="2000" placeholder="Add observations, strengths, concerns, or follow-up details…">${escapeHtml(item.reviewNote || "")}</textarea></div><div class="decision-panel"><input id="review-decision" type="hidden" value="${decision}"><div class="decision-buttons"><button type="button" class="decision-button accept ${decision === "accepted" ? "selected" : ""}" data-decision="accepted"><div class="decision-main">${icon("actionAccept")}<span>Accept</span></div><small>Admit to team</small></button><button type="button" class="decision-button hold ${decision === "pending" ? "selected" : ""}" data-decision="pending"><div class="decision-main">${icon("actionHold")}<span>Hold</span></div><small>Consider later</small></button><button type="button" class="decision-button decline ${decision === "declined" ? "selected" : ""}" data-decision="declined"><div class="decision-main">${icon("actionDecline")}<span>Decline</span></div><small>Not a fit</small></button><button type="button" class="decision-button review-action-delete" id="review-delete-application"><div class="decision-main">${icon("actionDelete")}<span>Delete entry</span></div><small>From database</small></button></div></div></div><div class="save-row"><span class="save-message" id="save-message" aria-live="polite"></span></div>${item.reviewedBy ? `<div class="audit">Last reviewed by <b>${escapeHtml(item.reviewedBy)}</b>${reviewDate ? ` on <b>${escapeHtml(reviewDate)}</b>` : ""}.</div>` : ""}</div></section>
    </div>`;
      // Turn the record into five useful review tabs while keeping the action dock independent.
     const content = $("detail").querySelector(".detail-content");
     const sections = Array.from(content.querySelectorAll(":scope > .section"));
     const tabBar = document.createElement("nav");
     tabBar.className = "detail-tabs";
     tabBar.setAttribute("aria-label", "Application detail sections");
      [["overview","Overview"],["essay","Essay / Document"],["logistics","Logistics"],["review","Review"]].forEach(([key,label], index) => {
       const button = document.createElement("button");
       button.type = "button"; button.className = `detail-tab${index === 0 ? " active" : ""}`;
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
       if (key !== "overview") pane.hidden = true;
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
         if (key === "logistics") {
            const logisticsSplit = document.createElement("div");
            logisticsSplit.className = "logistics-split";
            if (scheduleCard) logisticsSplit.appendChild(scheduleCard);
            if (activitiesCard) logisticsSplit.appendChild(activitiesCard);
            pane.prepend(logisticsSplit);
         }
        if (key === "review") {
         pane.innerHTML = `<div class="review-summary">
            <div class="review-summary-card"><span>Current decision</span><strong>${escapeHtml(status(item).replace(/^./, letter => letter.toUpperCase()))}</strong><p>Use the administrative action bar below to record a secure decision and internal note.</p></div>
            <div class="review-summary-card"><span>Review history</span><strong>${item.reviewedBy ? escapeHtml(item.reviewedBy) : "Not reviewed yet"}</strong><p>${reviewDate ? `Last updated ${escapeHtml(reviewDate)}.` : "No administrative decision has been recorded."}</p></div>
         </div>`;
       }
       content.appendChild(pane);
     });
     tabBar.querySelectorAll(".detail-tab").forEach(button => button.addEventListener("click", () => {
       tabBar.querySelectorAll(".detail-tab").forEach(tab => tab.classList.toggle("active", tab === button));
       Object.entries(groups).forEach(([key]) => { const pane = content.querySelector(`[data-pane="${key}"]`); if (pane) pane.hidden = key !== button.dataset.tab; });
     }));
      const setRating = (nextValue, direction = 1) => {
       const value = Math.max(1, Math.min(10, Number(nextValue) || 5));
       const roller = $("rating-roller");
       $("review-rating").value = String(value);
       $("rating-value").textContent = String(value);
       roller.setAttribute("aria-valuenow", String(value));
       roller.classList.remove("roll-up", "roll-down");
       void roller.offsetWidth;
       roller.classList.add(direction >= 0 ? "roll-up" : "roll-down");
      };
      document.querySelectorAll(".roller-arrow").forEach(button => button.addEventListener("click", () => {
       const delta = Number(button.dataset.ratingDelta);
       const current = Number($("review-rating").value);
       setRating(current ? current + delta : 5, delta);
      }));
      $("rating-roller").addEventListener("keydown", event => {
       if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
       event.preventDefault();
       const delta = event.key === "ArrowUp" ? 1 : -1;
       const current = Number($("review-rating").value);
       setRating(current ? current + delta : 5, delta);
      });
      $("rating-roller").addEventListener("wheel", event => {
       event.preventDefault();
       const delta = event.deltaY < 0 ? 1 : -1;
       const current = Number($("review-rating").value);
       setRating(current ? current + delta : 5, delta);
      }, { passive: false });
     document.querySelectorAll(".decision-button[data-decision]").forEach(button => button.addEventListener("click", async () => {
       const rating = Number($("review-rating").value);
       if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        alert("Choose an applicant rating from 1 to 10 before recording a decision.");
        return;
       }
      if (!window.confirm("Can I write this to the database?")) return;
      $("review-decision").value = button.dataset.decision;
       document.querySelectorAll(".decision-button[data-decision]").forEach(control => {
        const selected = control === button;
        control.classList.toggle("selected", selected);
        control.setAttribute("aria-pressed", String(selected));
       });
       await saveDecision(item.id, button);
    }));
    requestAnimationFrame(() => document.querySelectorAll(".answer-preview, .quick-preview").forEach(preview => {
      const link = preview.nextElementSibling;
      if (link && (preview.scrollWidth > preview.clientWidth + 1 || preview.scrollHeight > preview.clientHeight + 1)) link.hidden = false;
    }));
    document.querySelectorAll(".answer-full-link").forEach(button => button.addEventListener("click", () => {
      const answerDetail = longAnswers[Number(button.dataset.answerIndex)];
      if (answerDetail) openAnswerDialog(answerDetail, button);
    }));
     $("review-delete-application").addEventListener("click", () => deleteApplication(item));
  }
  async function deleteApplication(item) {
    if (!window.confirm("Can I write this to the database?")) return;
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
  async function saveDecision(applicationId, button) {
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
        body: JSON.stringify({ applicationId, decision: $("review-decision").value, internalNote: $("review-note").value.trim(), rating: Number($("review-rating").value) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save the review decision.");
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
  $("clear-filters").addEventListener("click", () => {
    $("search").value = "";
    $("decision-filter").value = "all";
    $("grade-filter").value = "all";
    $("sort").value = "newest";
    renderList();
    const visible = filteredApplications();
    if (!visible.some(item => item.id === selectedId)) { selectedId = visible[0]?.id || ""; renderDetail(); }
  });
  auth.onAuthStateChanged(async user => {
    currentUser = user;
    if (!user) { show("auth-required"); return; }
    $("app-userbar").classList.add("visible");
    $("app-name").textContent = portalWelcomeLabel(user.displayName, user.email);
    const access = await getPortalMemberAccess(user, db);
    const role = normalizePortalRole(access.role);
    $("app-name").textContent = portalWelcomeLabel(access.displayName || user.displayName, user.email);
    const rolePresentation = ROLE_PRESENTATION[role] || ROLE_PRESENTATION.member;
    $("app-role-badge").dataset.role = role;
    $("app-role-badge").querySelector(".mub-role-label").textContent = rolePresentation.label;
    if (!access.approved || !isFullAdminRole(role)) { show("access-denied"); return; }
    show("dashboard");
    beginListening();
  });
  document.addEventListener("DOMContentLoaded", updateNotificationState);
})();
