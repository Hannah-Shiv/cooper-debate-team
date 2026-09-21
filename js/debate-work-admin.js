/* Coach and Website Admin Debate Work review surface. The endpoint remains the security
   boundary; this file only provides defense-in-depth presentation checks. */
(function () {
  "use strict";
  const CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    storageBucket: "cooper-debate-team.firebasestorage.app",
    messagingSenderId: "112813790184",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d",
  };
  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/debateWork";
  const TOPIC_ID = "2026-data-centers";
  const STAGES = [
    ["constructive", "Constructive"],
    ["crossfire", "Crossfire"],
    ["rebuttal", "Rebuttal"],
    ["summary", "Summary"],
    ["finalFocus", "Final Focus"],
  ];
  if (!firebase.apps.length) firebase.initializeApp(CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  let role = "member";
  let works = [];
  let selected = null;
  let selectedSide = "PRO";
  let selectedStage = "constructive";
  let authReady = false;

  function show(id) {
    ["auth-loading", "auth-required", "access-denied", "dashboard"].forEach(name => {
      const element = $(name);
      if (element) element.hidden = name !== id;
    });
  }
  function pageMessage(text, kind) {
    const element = $("page-message");
    if (!element) return;
    element.hidden = !text;
    element.className = `message${kind ? ` ${kind}` : ""}`;
    element.textContent = text || "";
  }
  function dateLabel(value) {
    const millis = typeof value?.toMillis === "function" ? value.toMillis() : Number(value);
    return millis ? new Date(millis).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not available";
  }
  function workFor(item, side) {
    if (!item) return null;
    if (item.works && item.works[side]) return item.works[side];
    if (item[side]) return item[side];
    if (Array.isArray(item.works)) return item.works.find(work => work.side === side) || null;
    return null;
  }
  function workStatus(work) {
    if (!work) return "not-started";
    if (work.submittedAt || work.status === "submitted") return "submitted";
    return work.status || "started";
  }
  function isInProgressStatus(status) {
    return status !== "submitted" && status !== "not-started";
  }
  function hasStageContent(stage) {
    if (stage == null) return false;
    if (typeof stage === "string") return stage.trim().length > 0;
    if (typeof stage === "number" || typeof stage === "boolean") return stage === true;
    if (Array.isArray(stage)) return stage.some(hasStageContent);
    if (typeof stage === "object") {
      if (stage.completed === true) return true;
      return Object.entries(stage).some(([key, value]) =>
        !["completed", "updatedAt", "createdAt", "status"].includes(key) && hasStageContent(value)
      );
    }
    return false;
  }
  function progress(work) {
    return work ? STAGES.filter(([key]) => hasStageContent(work.stages?.[key] || work[key])).length : 0;
  }
  function studentName(item) {
    return item.name || [item.firstName, item.lastName].filter(Boolean).join(" ") || item.displayName || "Unnamed student";
  }
  function normalizeList(data) {
    const list = data.students || data.works || data.items || [];
    return Array.isArray(list) ? list : Object.entries(list).map(([id, value]) => ({ id, ...value }));
  }
  async function request(action, body = {}) {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, topicId: TOPIC_ID, ...body }),
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || data.ok === false) throw new Error(data.error || `The debate-work service returned ${response.status}.`);
    return data;
  }
  function matches(item) {
    const query = $("search").value.trim().toLowerCase();
    const side = $("side-filter").value;
    const status = $("status-filter").value;
    const haystack = `${studentName(item)} ${item.fcpsId || item.studentId || ""}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (side !== "all" && !workFor(item, side)) return false;
    if (status !== "all") {
      const statuses = [workStatus(workFor(item, "PRO")), workStatus(workFor(item, "CON"))];
      if (status === "started" ? !statuses.some(isInProgressStatus) : !statuses.includes(status)) return false;
    }
    return true;
  }
  function studentProgress(item) {
    return progress(workFor(item, "PRO")) + progress(workFor(item, "CON"));
  }
  function activityTime(item) {
    const value = item.updatedAt;
    if (typeof value?.toMillis === "function") return value.toMillis();
    return Number(value) || Date.parse(value || "") || 0;
  }
  function sortedList(list) {
    const sort = $("sort").value;
    return [...list].sort((a, b) => {
      if (sort === "activity") return activityTime(b) - activityTime(a) || studentName(a).localeCompare(studentName(b));
      if (sort === "progress") return studentProgress(b) - studentProgress(a) || studentName(a).localeCompare(studentName(b));
      return studentName(a).localeCompare(studentName(b));
    });
  }
  function renderStats() {
    let inProgress = 0;
    let submitted = 0;
    let notStarted = 0;
    works.forEach(item => {
      const statuses = ["PRO", "CON"].map(side => workStatus(workFor(item, side)));
      if (statuses.includes("submitted")) submitted += 1;
      else if (statuses.some(isInProgressStatus)) inProgress += 1;
      else notStarted += 1;
    });
    $("stat-eligible").textContent = works.length;
    $("stat-progress").textContent = inProgress;
    $("stat-submitted").textContent = submitted;
    $("stat-not-started").textContent = notStarted;
  }
  function renderList() {
    const list = sortedList(works.filter(matches));
    $("student-count").textContent = `${list.length} total`;
    const selectedKey = selected && String(selected.id || selected.studentKey || selected.fcpsId || "");
    const selectedIndex = list.findIndex(item => String(item.id || item.studentKey || item.fcpsId || "") === selectedKey);
    $("student-first").disabled = selectedIndex <= 0;
    $("student-previous").disabled = selectedIndex <= 0;
    $("student-next").disabled = selectedIndex < 0 || selectedIndex >= list.length - 1;
    $("student-last").disabled = selectedIndex < 0 || selectedIndex >= list.length - 1;
    $("student-list").innerHTML = list.length ? list.map(item => {
      const pro = workFor(item, "PRO"), con = workFor(item, "CON");
      const id = item.id || item.studentKey || item.fcpsId || "";
      const pill = (side, work) => `<span class="pill ${work ? side.toLowerCase() : "none"}">${side} ${work ? `${progress(work)}/5 · ${escapeHtml(workStatus(work))}` : "not started"}</span>`;
      const isActive = selectedKey === String(id);
      return `<button class="student-row ${isActive ? "active" : ""}" type="button" data-id="${escapeHtml(id)}"><div class="student-name">${escapeHtml(studentName(item))}</div><div class="student-meta">${escapeHtml(item.fcpsId || item.studentId || "FCPS ID hidden")}</div><div class="side-pills">${pill("PRO", pro)}${pill("CON", con)}</div></button>`;
    }).join("") : '<div class="empty">No students match these filters.</div>';
    document.querySelectorAll(".student-row").forEach(row => row.addEventListener("click", () => selectStudent(
      works.find(item => String(item.id || item.studentKey || item.fcpsId || "") === row.dataset.id) || null
    )));
  }
  function selectStudent(item) {
    selected = item;
    selectedSide = "PRO";
    selectedStage = "constructive";
    renderList();
    renderDetail();
    if (!selected) return;
    pageMessage("Loading the selected student's saved stages…");
    Promise.all(["PRO", "CON"].map(side => openWork(side))).finally(() => pageMessage(""));
  }
  function navigateStudents(position) {
    const list = sortedList(works.filter(matches));
    if (!list.length) return;
    const key = selected && String(selected.id || selected.studentKey || selected.fcpsId || "");
    const current = list.findIndex(item => String(item.id || item.studentKey || item.fcpsId || "") === key);
    const index = position === "first" ? 0 : position === "last" ? list.length - 1 :
      position === "previous" ? Math.max(0, current - 1) : Math.min(list.length - 1, current + 1);
    selectStudent(list[index]);
  }
  function plainText(value) {
    const container = document.createElement("div");
    container.innerHTML = String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    return (container.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function readableContent(content, stageKey) {
    if (!content) return '<p class="content-copy">No speech content recorded.</p>';
    if (stageKey === "crossfire") {
      try {
        const pairs = JSON.parse(content);
        if (Array.isArray(pairs) && pairs.length) return `<div class="crossfire-list">${pairs.map((pair, index) =>
          `<div class="crossfire-pair"><div><b>Question ${index + 1}</b><span class="content-copy">${escapeHtml(pair?.q || "No question recorded.")}</span></div><div><b>Answer ${index + 1}</b><span class="content-copy">${escapeHtml(pair?.a || "No answer recorded.")}</span></div></div>`
        ).join("")}</div>`;
      } catch (_) {}
    }
    return `<p class="content-copy">${escapeHtml(plainText(content)) || "No speech content recorded."}</p>`;
  }
  function stageContent(stage) {
    const value = stage && typeof stage === "object" ? stage : { content: stage || "" };
    const sources = Array.isArray(value.sources) ? value.sources.filter(Boolean) : [];
    const sourceItem = source => {
      const text = String(source);
      const isWebLink = /^https?:\/\//i.test(text);
      return isWebLink
        ? `<li><a href="${escapeHtml(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a></li>`
        : `<li class="content-copy">${escapeHtml(text)}</li>`;
    };
    return `<div class="content-block"><label>Speech content</label>${readableContent(value.content, selectedStage)}</div>
      ${value.notes ? `<div class="content-block"><label>Student notes</label><p class="content-copy">${escapeHtml(plainText(value.notes))}</p></div>` : ""}
      <div class="content-block"><label>Sources</label>${sources.length ? `<ul class="source-list">${sources.map(sourceItem).join("")}</ul>` : '<p class="content-copy">No sources recorded.</p>'}</div>`;
  }
  function workPanel(side, work) {
    const feedback = work?.feedback || {};
    const stageTiles = STAGES.map(([key, label]) => {
      const stage = work?.stages?.[key] || work?.[key];
      const complete = hasStageContent(stage);
      return `<button type="button" class="stage ${complete ? "complete" : ""} ${selectedStage === key ? "active" : ""}" data-stage="${key}"><div class="stage-name">${label}</div><span class="stage-status">${complete ? "Content saved" : "Not started"}</span></button>`;
    }).join("");
    const stageLabel = STAGES.find(([key]) => key === selectedStage)?.[1] || "Stage";
    return `<section class="work-card side-panel"><div class="side-heading"><h3 class="side-label ${side.toLowerCase()}">${side}</h3><span class="count">${progress(work)}/5 stages · ${escapeHtml(workStatus(work))}</span></div><div class="stage-grid">${stageTiles}</div><div class="stage-content"><h4 class="stage-pane-title">${stageLabel}</h4>${stageContent(work?.stages?.[selectedStage] || work?.[selectedStage])}</div><div class="work-card feedback-card"><h3>Coach feedback</h3><div class="feedback-grid"><div><label for="feedback-${side.toLowerCase()}">Private feedback</label><textarea id="feedback-${side.toLowerCase()}" maxlength="4000" data-feedback-side="${side}" placeholder="Feedback for this side…">${escapeHtml(feedback.note || "")}</textarea></div><div><label for="next-${side.toLowerCase()}">Next coaching focus</label><textarea id="next-${side.toLowerCase()}" maxlength="2000" data-feedback-side="${side}" data-feedback-field="nextStep" placeholder="What should the student work on next?">${escapeHtml(feedback.nextStep || "")}</textarea><label for="status-${side.toLowerCase()}">Review status</label><select id="status-${side.toLowerCase()}" data-feedback-side="${side}" aria-label="${side} review status"><option value="pending" ${feedback.status === "pending" || !feedback.status ? "selected" : ""}>Pending review</option><option value="needs-revision" ${feedback.status === "needs-revision" ? "selected" : ""}>Needs revision</option><option value="reviewed" ${feedback.status === "reviewed" ? "selected" : ""}>Reviewed</option></select></div></div><div class="feedback-actions"><span class="feedback-status" id="feedback-status-${side.toLowerCase()}"></span><button class="btn save-feedback" type="button" data-side="${side}">Save ${side} feedback</button></div></div></section>`;
  }
  function renderDetail() {
    if (!selected) {
      $("detail").innerHTML = '<div class="empty">Select a student to review their PRO and CON work.</div>';
      return;
    }
    const id = selected.id || selected.studentKey || selected.fcpsId;
    $("detail").innerHTML = `<div class="detail-content"><div class="detail-heading"><div class="detail-identity-line"><div class="eyebrow">Current topic · ${TOPIC_ID}</div><span class="detail-identity-divider" aria-hidden="true"></span><h2>${escapeHtml(studentName(selected))}</h2><span class="detail-identity-divider" aria-hidden="true"></span><p>${escapeHtml(selected.fcpsId || selected.studentId || "Student ID protected")} · Last activity ${escapeHtml(dateLabel(selected.updatedAt))}</p></div></div><div class="side-tabs" role="tablist" aria-label="Debate side"><button class="side-tab ${selectedSide === "PRO" ? "active" : ""}" data-side="PRO" type="button">PRO</button><button class="side-tab ${selectedSide === "CON" ? "active" : ""}" data-side="CON" type="button">CON</button></div>${workPanel(selectedSide, workFor(selected, selectedSide))}</div>`;
    document.querySelectorAll(".side-tab").forEach(button => button.addEventListener("click", () => { selectedSide = button.dataset.side; selectedStage = "constructive"; renderDetail(); }));
    document.querySelectorAll(".stage").forEach(button => button.addEventListener("click", () => { selectedStage = button.dataset.stage; renderDetail(); }));
    document.querySelectorAll(".save-feedback").forEach(button => button.addEventListener("click", () => saveFeedback(button.dataset.side)));
  }
  async function loadWorks() {
    pageMessage("Loading student debate work…");
    $("student-list").innerHTML = '<div class="empty">Loading students…</div>';
    try {
      const data = await request("listCoachWorks", { topicId: TOPIC_ID });
      works = normalizeList(data);
      if (selected) {
        const selectedKey = selected.id || selected.studentKey || selected.fcpsId;
        selected = works.find(item => String(item.id || item.studentKey || item.fcpsId || "") === String(selectedKey)) || null;
      }
      renderStats(); renderList(); renderDetail(); pageMessage("");
    } catch (error) {
      works = []; renderStats(); renderList(); pageMessage(error.message || "Student debate work could not be loaded.", "error");
    }
  }
  async function openWork(side) {
    const summary = workFor(selected, side);
    const workId = summary?.workId || summary?.id;
    if (!workId) return;
    try {
      const data = await request("getCoachWork", { workId });
      const key = side === "PRO" ? "pro" : "con";
      selected.works = selected.works || {};
      selected.works[side] = data.work || data[key] || data;
      renderDetail();
    } catch (error) { pageMessage(error.message || "This work could not be opened.", "error"); }
  }
  async function saveFeedback(side) {
    const work = workFor(selected, side);
    if (!work) return pageMessage(`There is no ${side} work to review yet.`, "error");
    const note = $(`feedback-${side.toLowerCase()}`).value;
    const nextStep = $(`next-${side.toLowerCase()}`).value;
    const statusValue = $(`status-${side.toLowerCase()}`).value;
    const button = document.querySelector(`.save-feedback[data-side="${side}"]`);
    const status = $(`feedback-status-${side.toLowerCase()}`);
    button.disabled = true; status.textContent = "Saving…";
    try {
      const data = await request("saveCoachFeedback", { workId: work.workId || work.id, expectedRevision: Number(work.revision || 0), feedback: { note, nextStep, status: statusValue } });
      const saved = data.work || data;
      selected.works[side] = { ...work, ...saved, feedback: saved.feedback || { note, nextStep, status: statusValue } };
      status.textContent = "Saved.";
    } catch (error) { status.textContent = error.message || "Save failed. Refresh before trying again."; }
    button.disabled = false;
  }
  function bindControls() {
    ["search", "side-filter", "status-filter", "sort"].forEach(id => $(id).addEventListener("input", renderList));
    $("refresh").addEventListener("click", loadWorks);
    $("student-first").addEventListener("click", () => navigateStudents("first"));
    $("student-previous").addEventListener("click", () => navigateStudents("previous"));
    $("student-next").addEventListener("click", () => navigateStudents("next"));
    $("student-last").addEventListener("click", () => navigateStudents("last"));
  }
  async function boot(user) {
    if (!user) { authReady = true; show("auth-required"); return; }
    try {
      const access = await getPortalMemberAccess(user, db);
      role = typeof normalizePortalRole === "function" ? normalizePortalRole(access.role) : access.role;
      const canReview = typeof canReviewDebateWorkRole === "function"
        ? canReviewDebateWorkRole(role)
        : ["coach", "website-admin"].includes(role);
      if (!access.approved || !canReview) { show("access-denied"); return; }
      authReady = true; show("dashboard"); bindControls(); await loadWorks();
    } catch (error) { show("access-denied"); pageMessage(error.message || "Member access could not be verified.", "error"); }
  }
  auth.onAuthStateChanged(boot);
})();