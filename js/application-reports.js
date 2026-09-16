(function () {
  "use strict";
  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageEssayEvaluation";
  const KEYS = ["claimCase", "evidenceResearch", "commentaryAnalysis", "weighingImpacts", "organizationNarrative", "conclusionRecommendation", "styleVoice"];
  const LABELS = ["Claim & Case", "Evidence", "Analysis", "Weighing", "Organization", "Conclusion", "Style & Voice"];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const dateValue = value => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value._seconds || value.seconds) return new Date(Number(value._seconds ?? value.seconds) * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const date = value => dateValue(value)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "—";
  const name = item => [item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ") || "Unnamed applicant";
  const decision = item => item.reviewStatus === "accepted" ? "accepted" : item.reviewStatus === "declined" ? "declined" : (item.reviewedAt || item.reviewedBy ? "on-hold" : "pending");
  const decisionLabel = value => ({ pending: "Pending", "on-hold": "On Hold", accepted: "Accepted", declined: "Declined" }[value] || "Pending");
  const score = evaluation => KEYS.reduce((sum, key) => sum + (Number(evaluation?.rubric?.[key]) || 0), 0);
  const evaluationStatus = evaluation => !evaluation ? "not-started" : evaluation.status === "finalized" || evaluation.finalizedAt ? "evaluated" : KEYS.some(key => Number.isInteger(Number(evaluation.rubric?.[key]))) ? "in-progress" : "not-started";
  const evaluationLabel = value => ({ "not-started": "Not Started", "in-progress": "In Progress", evaluated: "Evaluated" }[value]);
  const interpretation = evaluation => evaluationStatus(evaluation) === "evaluated"
    ? (evaluation?.interpretation || "—")
    : evaluationStatus(evaluation) === "in-progress" ? "Not complete" : "—";
  const recLabel = value => ({ "strongly-recommend": "Strongly recommend", recommend: "Recommend", consider: "Consider", "do-not-recommend": "Do not recommend at this time" }[value] || "—");
  let context = window.__cooperApplicationsReportContext || { applications: [], currentUser: null };
  let dialog = null;
  let launchVersion = 0;

  function buttonSort(label, key) { return `<th><button type="button" data-sort="${key}" aria-sort="none">${esc(label)}</button></th>`; }
  function apiList() {
    const user = context.currentUser || window.firebase?.auth?.().currentUser;
    if (!user) return Promise.reject(new Error("Your secure session has expired. Sign in again."));
    return user.getIdToken().then(token => fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "list" }) }))
      .then(response => response.json().then(result => { if (!response.ok || !result.ok) throw new Error(result.error || "Essay scores could not be loaded."); return result.evaluations || {}; }));
  }
  function open(kind) {
    if (dialog) dialog.remove();
    const isEssay = kind === "essay";
    dialog = document.createElement("dialog");
    dialog.className = "application-report-dialog";
    dialog.dataset.kind = kind;
    dialog.setAttribute("aria-labelledby", "report-title");
    const statusControl = isEssay
      ? '<div class="report-field report-choice-field"><span class="report-field-label">Filter status</span><div id="report-status" class="report-filter-buttons" role="group" aria-label="Filter status" data-value="all"><button type="button" class="active" data-report-filter="status" data-value="all">All</button><button type="button" data-report-filter="status" data-value="not-started">Not Started</button><button type="button" data-report-filter="status" data-value="in-progress">In Progress</button><button type="button" data-report-filter="status" data-value="evaluated">Evaluated</button></div></div>'
      : '<div class="report-field"><label for="report-status">Filter status</label><select id="report-status"><option value="all">All statuses</option><option value="pending">Pending</option><option value="on-hold">On Hold</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></div>';
    const gradeControl = isEssay
      ? '<div class="report-field report-choice-field"><span class="report-field-label">Filter grade</span><div id="report-grade" class="report-filter-buttons report-grade-buttons" role="group" aria-label="Filter grade" data-value="all"><button type="button" class="active" data-report-filter="grade" data-value="all">All</button></div></div>'
      : '<div class="report-field"><label for="report-grade">Filter grade</label><select id="report-grade"><option value="all">All grades</option></select></div>';
    dialog.innerHTML = `<div class="report-shell"><header class="report-head"><div><p class="report-kicker">Application records</p><h2 id="report-title">${isEssay ? "Essay Scores" : "Decision Status"}</h2>${isEssay ? "" : '<p>A complete view of official application decisions and coach notes.</p>'}</div><div class="report-head-actions"><span class="report-count" aria-live="polite">Loading…</span><button type="button" class="report-button primary report-print">Print report</button><button type="button" class="report-button report-close" aria-label="Close report">✕</button></div></header><div class="report-toolbar"><div class="report-field"><label for="report-search">Search applicants</label><input id="report-search" type="search" placeholder="Name, student ID, or grade"></div>${statusControl}${gradeControl}<label class="report-hidden-toggle" for="report-show-hidden"><input id="report-show-hidden" type="checkbox"><span>Show hidden records</span></label></div><div class="report-table-wrap"><div class="report-empty report-loading">Loading report…</div></div></div>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector(".report-close").onclick = () => dialog.close();
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); dialog = null; }, { once: true });
    dialog.querySelector(".report-print").onclick = () => window.print();
    ["report-search", "report-show-hidden"].forEach(id => {
      dialog.querySelector(`#${id}`).addEventListener(id === "report-search" ? "input" : "change", () => render(kind, dialog.__evaluations || {}));
    });
    if (isEssay) {
      dialog.querySelector(".report-toolbar").addEventListener("click", event => {
        const button = event.target.closest("[data-report-filter]");
        if (!button) return;
        const group = button.closest(".report-filter-buttons");
        group.dataset.value = button.dataset.value;
        group.querySelectorAll("button").forEach(control => control.classList.toggle("active", control === button));
        render(kind, dialog.__evaluations || {});
      });
    } else {
      ["report-status", "report-grade"].forEach(id => dialog.querySelector(`#${id}`).addEventListener("change", () => render(kind, {})));
    }
    if (kind === "decision") render(kind);
  }
  function render(kind, evaluations = {}) {
    if (!dialog) return;
    dialog.__evaluations = evaluations;
    const isEssay = kind === "essay";
    const search = dialog.querySelector("#report-search").value.trim().toLowerCase();
    const statusFilter = isEssay ? dialog.querySelector("#report-status").dataset.value : dialog.querySelector("#report-status").value;
    const gradeFilter = isEssay ? dialog.querySelector("#report-grade").dataset.value : dialog.querySelector("#report-grade").value;
    const showHidden = dialog.querySelector("#report-show-hidden").checked;
    const sortKey = dialog.dataset.sort || (isEssay ? "name" : "submitted");
    const direction = Number(dialog.dataset.direction || 1);
    const available = context.applications.filter(item => showHidden || item.hidden !== true);
    const rows = available.filter(item => {
      const text = `${name(item)} ${item.student?.studentId || ""} ${item.student?.grade || ""}`.toLowerCase();
      const state = isEssay ? evaluationStatus(evaluations[item.id]) : decision(item);
      return (!search || text.includes(search)) && (statusFilter === "all" || state === statusFilter) && (gradeFilter === "all" || item.student?.grade === gradeFilter);
    }).sort((a, b) => {
      let left; let right;
      if (sortKey === "name") { left = name(a); right = name(b); }
      else if (sortKey === "grade") { left = a.student?.grade || ""; right = b.student?.grade || ""; }
      else if (sortKey === "status") { left = isEssay ? evaluationStatus(evaluations[a.id]) : decision(a); right = isEssay ? evaluationStatus(evaluations[b.id]) : decision(b); }
      else if (sortKey === "score") { left = score(evaluations[a.id]); right = score(evaluations[b.id]); }
      else if (KEYS.includes(sortKey)) { left = Number(evaluations[a.id]?.rubric?.[sortKey]) || 0; right = Number(evaluations[b.id]?.rubric?.[sortKey]) || 0; }
      else if (sortKey === "rating") { left = Number(a.reviewRating) || 0; right = Number(b.reviewRating) || 0; }
      else if (sortKey === "decision-date") { left = dateValue(a.decisionAt || a.reviewedAt)?.getTime() || 0; right = dateValue(b.decisionAt || b.reviewedAt)?.getTime() || 0; }
      else { left = dateValue(a.createdAt)?.getTime() || 0; right = dateValue(b.createdAt)?.getTime() || 0; }
      return (typeof left === "string" ? left.localeCompare(right) : left - right) * direction;
    });
    const grades = [...new Set(available.map(item => item.student?.grade).filter(Boolean))].sort();
    const gradeControl = dialog.querySelector("#report-grade");
    if (isEssay) {
      grades.forEach(grade => {
        if (!gradeControl.querySelector(`[data-value="${CSS.escape(grade)}"]`)) gradeControl.insertAdjacentHTML("beforeend", `<button type="button" data-report-filter="grade" data-value="${esc(grade)}">${esc(grade)}</button>`);
      });
    } else if (gradeControl.options.length === 1) {
      grades.forEach(grade => gradeControl.insertAdjacentHTML("beforeend", `<option value="${esc(grade)}">${esc(grade)}</option>`));
    }
    dialog.querySelector(".report-count").textContent = `${rows.length} of ${available.length} applicants`;
    const headers = isEssay ? `${buttonSort("Applicant", "name")}${buttonSort("Grade", "grade")}${buttonSort("Status", "status")}${buttonSort("Total /35", "score")}${KEYS.map((key, index) => buttonSort(LABELS[index], key)).join("")}<th>Interpretation</th><th>Recommendation</th>` : `${buttonSort("Applicant", "name")}${buttonSort("Grade", "grade")}${buttonSort("Decision", "status")}${buttonSort("Application rating", "rating")}${buttonSort("Submitted", "submitted")}${buttonSort("Decision date", "decision-date")}<th>Coach note</th>`;
    const body = rows.map(item => {
      const evaluation = evaluations[item.id] || null;
      if (isEssay) {
        const state = evaluationStatus(evaluation); const total = score(evaluation);
        const scores = KEYS.map(key => `<td class="rubric-score">${evaluation?.rubric?.[key] || "—"}</td>`).join("");
        return `<tr><td><strong>${esc(name(item))}</strong><br><span class="muted">${esc(item.student?.studentId || "No student ID")}</span></td><td>${esc(item.student?.grade || "—")}</td><td><span class="report-status ${state}">${evaluationLabel(state)}</span></td><td class="score">${total || "—"}<small>/35</small></td>${scores}<td>${esc(interpretation(evaluation))}</td><td>${esc(recLabel(evaluation?.recommendation))}</td></tr>`;
      }
      const state = decision(item);
      return `<tr><td><strong>${esc(name(item))}</strong><br><span class="muted">${esc(item.student?.studentId || "No student ID")}</span></td><td>${esc(item.student?.grade || "—")}</td><td><span class="report-status ${state}">${decisionLabel(state)}</span></td><td class="score">${item.reviewRating || "—"}<small>/10</small></td><td>${date(item.createdAt)}</td><td>${date(item.decisionAt || item.reviewedAt)}</td><td>${esc(item.reviewNote || "—")}</td></tr>`;
    }).join("");
    dialog.querySelector(".report-table-wrap").innerHTML = rows.length ? `<table class="report-table"><caption class="report-print-only">${isEssay ? "Essay Scores" : "Decision Status"} · ${new Date().toLocaleDateString()}</caption><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>` : `<div class="report-empty"><strong>No matching applicants</strong><span>Adjust the search or filters to broaden this report.</span></div>`;
    dialog.querySelectorAll("[data-sort]").forEach(button => {
      button.setAttribute("aria-sort", button.dataset.sort === sortKey ? (direction === 1 ? "ascending" : "descending") : "none");
      button.onclick = () => { dialog.dataset.direction = button.dataset.sort === sortKey ? String(direction * -1) : "1"; dialog.dataset.sort = button.dataset.sort; render(kind, evaluations); };
    });
  }
  function launch(kind) {
    const version = ++launchVersion;
    open(kind);
    const originatingDialog = dialog;
    if (kind === "essay") apiList().then(evaluations => {
      if (version === launchVersion && dialog === originatingDialog && dialog?.dataset.kind === kind) render(kind, evaluations);
    }).catch(error => {
      if (version !== launchVersion || dialog !== originatingDialog || dialog?.dataset.kind !== kind) return;
      dialog.querySelector(".report-table-wrap").innerHTML = `<div class="report-empty report-error"><strong>Unable to load essay scores</strong><span>${esc(error.message)} <button type="button" class="report-button retry-report">Retry</button></span></div>`;
      dialog.querySelector(".retry-report").onclick = () => launch(kind);
    });
    else render(kind, {});
  }
  window.addEventListener("cooper:applications-context", event => { context = event.detail; if (dialog && dialog.dataset.kind === "decision") render("decision"); });
  document.addEventListener("click", event => {
    if (event.target.closest("#essay-scores-report")) launch("essay");
    if (event.target.closest("#decision-status-report")) launch("decision");
  });
})();