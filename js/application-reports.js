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
  function pdfValue(value) {
    const text = String(value ?? "—").replace(/\s+/g, " ").trim();
    return text.length > 420 ? `${text.slice(0, 417)}…` : (text || "—");
  }
  function pdfFileDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  function pdfStatus(kind, item, evaluation) {
    const value = kind === "essay" ? evaluationStatus(evaluation) : decision(item);
    const label = kind === "essay" ? evaluationLabel(value) : decisionLabel(value);
    const colors = {
      "not-started": ["#e7eef7", "#355b82"],
      pending: ["#dceeff", "#185d91"],
      "in-progress": ["#fff0c2", "#835d05"],
      "on-hold": ["#f0e4ff", "#694292"],
      evaluated: ["#d9f5e7", "#176b45"],
      accepted: ["#d9f5e7", "#176b45"],
      declined: ["#ffe0e3", "#8b2534"],
    }[value] || ["#e7eef7", "#355b82"];
    return { label, fill: colors[0], text: colors[1] };
  }
  function reportPdfColumns(kind) {
    if (kind === "essay") {
      return [
        { label: "Applicant", width: 92 },
        { label: "Grade", width: 43 },
        { label: "Status", width: 58, status: true },
        { label: "Total /35", width: 43, align: "center" },
        ...LABELS.map(label => ({ label, width: 34, align: "center" })),
        { label: "Interpretation", width: 76 },
        { label: "Recommendation", width: 194 },
      ];
    }
    return [
      { label: "Applicant", width: 128 },
      { label: "Grade", width: 52 },
      { label: "Decision", width: 82, status: true },
      { label: "Rating", width: 62, align: "center" },
      { label: "Submitted", width: 83 },
      { label: "Decision date", width: 83 },
      { label: "Coach note", width: 254 },
    ];
  }
  function reportPdfRow(kind, item, evaluations) {
    const evaluation = evaluations[item.id] || null;
    const applicant = `${name(item)}\n${item.student?.studentId || "No student ID"}`;
    if (kind === "essay") {
      const total = score(evaluation);
      return [
        applicant,
        item.student?.grade || "—",
        pdfStatus(kind, item, evaluation),
        total ? `${total}/35` : "—",
        ...KEYS.map(key => evaluation?.rubric?.[key] || "—"),
        interpretation(evaluation),
        recLabel(evaluation?.recommendation),
      ];
    }
    return [
      applicant,
      item.student?.grade || "—",
      pdfStatus(kind, item, evaluation),
      item.reviewRating ? `${item.reviewRating}/10` : "—",
      date(item.createdAt),
      date(item.decisionAt || item.reviewedAt),
      item.reviewNote || "—",
    ];
  }
  function savePdf(kind) {
    if (!dialog || !window.PDFDocument) {
      window.alert("PDF creation is unavailable. Refresh the page and try again.");
      return;
    }
    const button = dialog.querySelector(".report-save-pdf");
    const rows = dialog.__reportRows || [];
    const evaluations = dialog.__evaluations || {};
    if (!rows.length) return;
    button.disabled = true;
    button.textContent = "Saving PDF…";
    try {
      const isEssay = kind === "essay";
      const title = isEssay ? "Essay Scores" : "Decision Status";
      const doc = new window.PDFDocument({
        size: "LETTER",
        layout: "landscape",
        margin: 24,
        bufferPages: true,
        info: { Title: `${title} — Cooper Debate Team`, Author: "Cooper Debate Team" },
      });
      const chunks = [];
      const columns = reportPdfColumns(kind);
      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const left = (doc.page.width - tableWidth) / 2;
      const bottom = doc.page.height - 34;
      let y = 0;
      const drawPageHeading = () => {
        doc.rect(0, 0, doc.page.width, 62).fill(isEssay ? "#34151b" : "#08284e");
        doc.rect(0, 58, doc.page.width, 4).fill("#e7b83f");
        doc.fillColor("#f6d35f").font("Helvetica-Bold").fontSize(8).text("COOPER DEBATE TEAM", 24, 14, { characterSpacing: 1.2 });
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(title, 24, 27);
        doc.fillColor("#dce9f8").font("Helvetica").fontSize(8).text(`Generated ${new Date().toLocaleString("en-US")}`, doc.page.width - 245, 19, { align: "right", width: 220 });
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(`${rows.length} applicant${rows.length === 1 ? "" : "s"}`, doc.page.width - 245, 36, { align: "right", width: 220 });
        const statusFilter = dialog.querySelector("#report-status")?.dataset.value || "all";
        const gradeFilter = dialog.querySelector("#report-grade")?.dataset.value || "all";
        const search = dialog.querySelector("#report-search")?.value.trim();
        const filters = [`Status: ${statusFilter === "all" ? "All" : (isEssay ? evaluationLabel(statusFilter) : decisionLabel(statusFilter))}`, `Grade: ${gradeFilter === "all" ? "All" : gradeFilter}`];
        if (search) filters.push(`Search: ${search}`);
        doc.fillColor("#385a7c").font("Helvetica").fontSize(7.5).text(filters.join("   •   "), left, 69, { width: tableWidth });
        y = 86;
      };
      const drawTableHeading = () => {
        let x = left;
        columns.forEach(column => {
          doc.rect(x, y, column.width, 30).fillAndStroke("#123e70", "#d4a937");
          doc.fillColor("#ffe27b").font("Helvetica-Bold").fontSize(isEssay ? 6.2 : 7)
            .text(column.label.toUpperCase(), x + 4, y + 7, { align: column.align || "left", width: column.width - 8, height: 18 });
          x += column.width;
        });
        y += 30;
      };
      const addPage = () => {
        doc.addPage({ size: "LETTER", layout: "landscape", margin: 24 });
        drawPageHeading();
        drawTableHeading();
      };
      drawPageHeading();
      drawTableHeading();
      rows.forEach((item, rowIndex) => {
        const values = reportPdfRow(kind, item, evaluations);
        doc.font("Helvetica").fontSize(isEssay ? 6.6 : 7.4);
        const rowHeight = Math.max(29, ...values.map((value, index) => {
          const text = typeof value === "object" ? value.label : pdfValue(value);
          return doc.heightOfString(text, { width: columns[index].width - 8, lineGap: 1 }) + 10;
        }));
        if (y + rowHeight > bottom) addPage();
        let x = left;
        values.forEach((value, index) => {
          const column = columns[index];
          const isStatus = typeof value === "object";
          const fill = isStatus ? value.fill : (rowIndex % 2 ? "#edf4fb" : "#ffffff");
          const textColor = isStatus ? value.text : (index === 0 ? "#08284e" : "#263f59");
          doc.rect(x, y, column.width, rowHeight).fillAndStroke(fill, "#9db4cb");
          doc.fillColor(textColor).font(index === 0 || isStatus ? "Helvetica-Bold" : "Helvetica").fontSize(isEssay ? 6.6 : 7.4)
            .text(isStatus ? value.label : pdfValue(value), x + 4, y + 5, {
              align: column.align || "left",
              width: column.width - 8,
              height: rowHeight - 8,
              lineGap: 1,
            });
          x += column.width;
        });
        y += rowHeight;
      });
      const range = doc.bufferedPageRange();
      for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
        doc.switchToPage(pageIndex);
        doc.fillColor("#5e748c").font("Helvetica").fontSize(7)
          .text(`Cooper Debate Team • Confidential application record`, 24, doc.page.height - 36, { lineBreak: false, width: 400 });
        doc.fillColor("#385a7c").font("Helvetica-Bold")
          .text(`Page ${pageIndex - range.start + 1} of ${range.count}`, doc.page.width - 124, doc.page.height - 36, { align: "right", lineBreak: false, width: 100 });
      }
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => {
        const blob = new Blob(chunks, { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${isEssay ? "essay-scores" : "decision-status"}-${pdfFileDate()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (dialog) {
          button.disabled = false;
          button.textContent = "Save as PDF";
        }
      });
      doc.end();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save as PDF";
      console.error("Unable to save application report PDF", error);
      window.alert("The PDF could not be created. Please refresh the page and try again.");
    }
  }
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
    const statusControl = `<div class="report-field report-choice-field"><span class="report-field-label">Filter status</span><div id="report-status" class="report-filter-buttons" role="group" aria-label="Filter status" data-value="all">${isEssay
      ? '<button type="button" class="active" data-report-filter="status" data-value="all">All</button><button type="button" data-report-filter="status" data-value="not-started">Not Started</button><button type="button" data-report-filter="status" data-value="in-progress">In Progress</button><button type="button" data-report-filter="status" data-value="evaluated">Evaluated</button>'
      : '<button type="button" class="active" data-report-filter="status" data-value="all">All</button><button type="button" data-report-filter="status" data-value="pending">Pending</button><button type="button" data-report-filter="status" data-value="on-hold">On Hold</button><button type="button" data-report-filter="status" data-value="accepted">Accepted</button><button type="button" data-report-filter="status" data-value="declined">Declined</button>'}</div></div>`;
    const gradeControl = '<div class="report-field report-choice-field"><span class="report-field-label">Filter grade</span><div id="report-grade" class="report-filter-buttons report-grade-buttons" role="group" aria-label="Filter grade" data-value="all"><button type="button" class="active" data-report-filter="grade" data-value="all">All</button></div></div>';
    dialog.innerHTML = `<div class="report-shell"><header class="report-head"><div><p class="report-kicker">Application records</p><h2 id="report-title">${isEssay ? "Essay Scores" : "Decision Status"}</h2></div><div class="report-head-actions"><span class="report-count" aria-live="polite">Loading…</span><button type="button" class="report-button primary report-save-pdf" disabled>Save as PDF</button><button type="button" class="report-button report-close" aria-label="Close report">✕</button></div></header><div class="report-toolbar"><div class="report-field"><label for="report-search">Search applicants</label><input id="report-search" type="search" placeholder="Name, student ID, or grade"></div>${statusControl}${gradeControl}<div class="report-field report-hidden-field"><span class="report-field-label">Hidden records</span><label class="report-hidden-toggle" for="report-show-hidden"><span>Show hidden</span><input id="report-show-hidden" type="checkbox"></label></div></div><div class="report-table-wrap"><div class="report-empty report-loading">Loading report…</div></div></div>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector(".report-close").onclick = () => dialog.close();
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); dialog = null; }, { once: true });
    dialog.querySelector(".report-save-pdf").onclick = () => savePdf(kind);
    ["report-search", "report-show-hidden"].forEach(id => {
      dialog.querySelector(`#${id}`).addEventListener(id === "report-search" ? "input" : "change", () => render(kind, dialog.__evaluations || {}));
    });
    dialog.querySelector(".report-toolbar").addEventListener("click", event => {
      const button = event.target.closest("[data-report-filter]");
      if (!button) return;
      const group = button.closest(".report-filter-buttons");
      group.dataset.value = button.dataset.value;
      group.querySelectorAll("button").forEach(control => control.classList.toggle("active", control === button));
      render(kind, dialog.__evaluations || {});
    });
    if (kind === "decision") render(kind);
  }
  function render(kind, evaluations = {}) {
    if (!dialog) return;
    dialog.__evaluations = evaluations;
    const isEssay = kind === "essay";
    const search = dialog.querySelector("#report-search").value.trim().toLowerCase();
    const statusFilter = dialog.querySelector("#report-status").dataset.value;
    const gradeFilter = dialog.querySelector("#report-grade").dataset.value;
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
    dialog.__reportRows = rows;
    const gradeControl = dialog.querySelector("#report-grade");
    grades.forEach(grade => {
      if (!gradeControl.querySelector(`[data-value="${CSS.escape(grade)}"]`)) gradeControl.insertAdjacentHTML("beforeend", `<button type="button" data-report-filter="grade" data-value="${esc(grade)}">${esc(grade)}</button>`);
    });
    dialog.querySelector(".report-count").textContent = `${rows.length} of ${available.length} applicants`;
    dialog.querySelector(".report-save-pdf").disabled = rows.length === 0;
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