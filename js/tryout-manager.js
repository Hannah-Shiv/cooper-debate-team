/* Cooper Debate Team — private tryout debate schedule manager */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageTryoutSchedule";
  const DEBATER_FIELDS = ["tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two"];
  const TEMPLATE_FIELDS = ["tryout-tournament-name", "tryout-range-start", "tryout-range-end"];
  const ASSIGNMENT_FIELDS = ["tryout-date", "tryout-status", ...DEBATER_FIELDS, "tryout-judge", "tryout-judge-type", "tryout-start", "tryout-end", "tryout-location", "tryout-notes"];
  let debaters = [];
  let judges = [];
  let assignments = [];
  let template = { title: "2026 Debate Tryout Schedule", startDate: "2026-09-16", endDate: "2026-09-23" };
  let editingId = "";
  let currentUser = null;
  let canDelete = false;
  let templateRevision = 0;
  let pendingDeleteId = "";
  let deleteTrigger = null;
  let templateSaveTimer = null;
  let assignmentSaveTimer = null;
  let templateSaving = false;
  let assignmentSaving = false;
  let templateSaveQueued = false;
  let assignmentSaveQueued = false;
  let scheduleSearch = "";
  let scheduleSort = "date";
  let scheduleSortDirection = 1;
  let scheduleFilter = "all";
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const timeLabel = value => {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return value || "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  };
  const dateLabel = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  };
  const statusLabel = value => ({ scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" }[value] || "Scheduled");
  const gradeLabel = value => {
    const grade = String(value || "").trim();
    const middleSchoolGrade = grade.match(/\b(7|8)(?:th)?\b/i);
    return middleSchoolGrade ? `${middleSchoolGrade[1]}th` : grade;
  };
  const debaterLabel = person => `${person.name}${person.grade ? ` · ${person.grade}` : ""}`;
  const parseDebaterValue = value => {
    const typed = String(value || "").trim();
    if (!typed) return null;
    const known = debaters.find(person => debaterLabel(person).toLowerCase() === typed.toLowerCase());
    if (known) return { id: known.id, name: known.name, grade: known.grade || "" };
    const parts = typed.split(/\s*[·|]\s*/, 2);
    return { id: "", name: parts[0].trim(), grade: (parts[1] || "").trim() };
  };
  const selectedDebaterId = fieldId => {
    return parseDebaterValue($(fieldId).value)?.id || "";
  };

  function setMessage(text, kind) {
    const target = $("tryout-message");
    target.textContent = text || "";
    target.className = `tryout-message${kind ? ` ${kind}` : ""}`;
  }

  function setAutosaveStatus(id, text, kind = "") {
    const target = $(id);
    target.textContent = text;
    target.className = `tryout-autosave-status${kind ? ` ${kind}` : ""}`;
  }

  async function manage(payload) {
    if (!currentUser) throw new Error("Sign in to manage the tryout schedule.");
    const token = await currentUser.getIdToken();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Unable to update the tryout schedule.");
    return result;
  }

  function renderPeopleOptions(selected = {}, typedValues = {}) {
    const suggestionLabels = new Set(debaters.map(debaterLabel));
    assignments.forEach(item => {
      [...pairEntries(item, "a"), ...pairEntries(item, "b")].forEach(entry => {
        if (!entry.name) return;
        suggestionLabels.add(`${entry.name}${entry.grade ? ` · ${entry.grade}` : ""}`);
      });
    });
    $("tryout-debater-options").innerHTML = [...suggestionLabels].sort((a, b) => a.localeCompare(b))
      .map(label => `<option value="${esc(label)}"></option>`).join("");
    DEBATER_FIELDS.forEach(id => {
      const person = debaters.find(candidate => candidate.id === selected[id]);
      $(id).value = person ? debaterLabel(person) : (typedValues[id] || "");
    });
    $("tryout-judge-options").innerHTML = judges.map(person =>
      `<option value="${esc(person.name)}"></option>`
    ).join("");
  }

  function applyTemplate() {
    $("tryout-template-title").textContent = template.title || "Debate Tryout Schedule";
    $("tryout-tournament-name").value = template.title || "";
    $("tryout-range-start").value = template.startDate || "";
    $("tryout-range-end").value = template.endDate || "";
    $("tryout-date").min = template.startDate || "";
    $("tryout-date").max = template.endDate || "";
    if (!$("tryout-date").value || $("tryout-date").value < template.startDate || $("tryout-date").value > template.endDate) {
      $("tryout-date").value = template.startDate || "";
    }
  }

  function publishTemplateToTournamentGrid() {
    document.dispatchEvent(new CustomEvent("tryout-template-loaded", { detail: { template } }));
  }

  function renderSummary() {
    const draftCount = assignments.filter(isDraft).length;
    $("tryout-finalized-count").textContent = assignments.length - draftCount;
    $("tryout-draft-count").textContent = draftCount;
  }

  function pairNames(item, side) {
    const names = side === "a" ? item.pairANames : item.pairBNames;
    return Array.isArray(names) && names.length ? names : side === "a" ? (item.studentNames || []).slice(0, 2) : [];
  }

  function pairIds(item, side) {
    const ids = side === "a" ? item.pairAIds : item.pairBIds;
    return Array.isArray(ids) ? ids : side === "a" ? (item.studentIds || []).slice(0, 2) : [];
  }

  function pairEntries(item, side) {
    const entries = side === "a" ? item.pairAEntries : item.pairBEntries;
    if (Array.isArray(entries) && entries.length) return entries;
    const names = pairNames(item, side);
    const ids = pairIds(item, side);
    const grades = side === "a" ? item.pairAGrades : item.pairBGrades;
    return names.map((name, index) => ({
      id: ids[index] || "",
      name,
      grade: Array.isArray(grades) ? grades[index] || "" : "",
    }));
  }

  function stackedNames(item, side) {
    const entries = pairEntries(item, side);
    if (!entries.length) return `<span class="tryout-student-name muted">Awaiting Pair ${side.toUpperCase()}</span>`;
    return entries.map(entry => {
      const byId = debaters.find(person => person.id === entry.id);
      const byName = debaters.filter(person => person.name.toLowerCase() === String(entry.name).toLowerCase());
      const person = byId || (byName.length === 1 ? byName[0] : null);
      const grade = gradeLabel(entry.grade || person?.grade);
      return `<span class="tryout-student-name"><span>${esc(entry.name)}</span>${grade ? `<small class="tryout-grade">${esc(grade)}</small>` : ""}</span>`;
    }).join("");
  }

  function isDraft(item) {
    const pairBCount = pairNames(item, "b").length;
    return pairNames(item, "a").length !== 2 || pairBCount !== 2 ||
      !item.date || !item.startTime || !item.endTime || !item.judge || !item.location;
  }

  function scheduleTime(item) {
    const times = [timeLabel(item.startTime), timeLabel(item.endTime)].filter(Boolean);
    return `<strong>${esc(times.join("–") || "Time not set")}</strong>`;
  }

  function visibleAssignments() {
    const query = scheduleSearch.trim().toLowerCase();
    return assignments.filter(item => {
      const draft = isDraft(item);
      if (scheduleFilter === "draft" && !draft) return false;
      if (scheduleFilter === "finalized" && draft) return false;
      if (!query) return true;
      const searchable = [
        ...pairNames(item, "a"), ...pairNames(item, "b"), item.date, item.startTime, item.endTime,
        ...pairEntries(item, "a").map(entry => gradeLabel(entry.grade)),
        ...pairEntries(item, "b").map(entry => gradeLabel(entry.grade)),
        item.judge, item.location, item.notes, draft ? "draft incomplete" : "finalized complete",
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    }).sort((left, right) => {
      const value = item => {
        if (scheduleSort === "judge") return item.judge || "";
        if (scheduleSort === "time") return `${item.startTime || "99:99"} ${item.date || "9999-99-99"}`;
        return `${item.date || "9999-99-99"} ${item.startTime || "99:99"}`;
      };
      return value(left).localeCompare(value(right), undefined, { numeric: true }) * scheduleSortDirection;
    });
  }

  function updateScheduleControls(count) {
    $("tryout-schedule-count").innerHTML = `<strong>${count}</strong> ${count === 1 ? "debate" : "debates"}${count !== assignments.length ? ` of ${assignments.length}` : ""}`;
    document.querySelectorAll("[data-tryout-sort]").forEach(button => {
      const active = button.dataset.tryoutSort === scheduleSort;
      button.classList.toggle("active", active);
      const label = button.dataset.tryoutSort === "time" ? "Time" : button.dataset.tryoutSort === "judge" ? "Judge" : "Date";
      button.textContent = `${label}${active ? (scheduleSortDirection === 1 ? " ↑" : " ↓") : ""}`;
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-tryout-filter]").forEach(button => {
      const active = button.dataset.tryoutFilter === scheduleFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderSchedule() {
    const root = $("tryout-schedule-list");
    if (!assignments.length) {
      updateScheduleControls(0);
      root.innerHTML = `<div class="tryout-empty">No debates have been scheduled yet. Add the first debate using the form.</div>`;
      renderSummary();
      return;
    }
    const visible = visibleAssignments();
    updateScheduleControls(visible.length);
    if (!visible.length) {
      root.innerHTML = `<div class="tryout-empty">No debates match this search and filter. Try a broader search or another status.</div>`;
      renderSummary();
      return;
    }
    root.innerHTML = `<table class="tryout-table">
      <thead><tr><th><span>#</span></th><th><span>Pair A</span></th><th><span>Pair B</span></th><th><span>Date</span></th><th><span>Time</span></th><th><span>Judge</span></th><th><span>Room</span></th><th><span>Record status</span></th><th><span>Actions</span></th></tr></thead>
      <tbody>${visible.map((item, index) => {
        const draft = isDraft(item);
        return `<tr>
        <td data-label="Row" class="tryout-row-number">${index + 1}</td>
        <td data-label="Pair A"><strong class="tryout-student-stack">${stackedNames(item, "a")}</strong></td>
        <td data-label="Pair B"><strong class="tryout-student-stack">${stackedNames(item, "b")}</strong>${item.notes ? `<small>${esc(item.notes)}</small>` : ""}</td>
        <td data-label="Date">${esc(dateLabel(item.date) || "Date not set")}</td>
        <td data-label="Time">${scheduleTime(item)}</td>
        <td data-label="Judge">${esc(item.judge || "Not set")}${item.judge && item.judgeType !== "member" ? `<br><small>${esc(item.judgeTypeLabel || "Other")}</small>` : ""}</td>
        <td data-label="Room">${esc(item.location || "Not set")}</td>
        <td data-label="Record status"><span class="tm-grid-status ${draft ? "draft" : "finalized"}">${draft ? "Draft" : "Finalized"}</span></td>
        <td data-label="Actions"><div class="tryout-row-actions"><button type="button" data-tryout-edit="${esc(item.id)}" aria-label="Edit row ${index + 1}" title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button>${canDelete ? `<span class="tryout-action-divider" aria-hidden="true"></span><button type="button" data-tryout-delete="${esc(item.id)}" aria-label="Delete row ${index + 1}" title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></button>` : ""}</div></td>
      </tr>`;
      }).join("")}</tbody>
    </table>`;
    root.querySelectorAll("[data-tryout-edit]").forEach(button => button.addEventListener("click", () => editAssignment(button.dataset.tryoutEdit)));
    root.querySelectorAll("[data-tryout-delete]").forEach(button => button.addEventListener("click", () => openDeleteModal(button.dataset.tryoutDelete, button)));
    renderSummary();
  }

  function resetForm() {
    clearTimeout(assignmentSaveTimer);
    assignmentSaveTimer = null;
    assignmentSaveQueued = false;
    editingId = "";
    $("tryout-form").reset();
    $("tryout-form-heading").textContent = "Add debate";
    $("tryout-new-draft").hidden = true;
    $("tryout-new-draft").disabled = false;
    renderPeopleOptions();
    applyTemplate();
    $("tryout-status").value = "scheduled";
    $("tryout-judge-type").value = "member";
    updateTimePeriods();
    setAutosaveStatus("tryout-record-status", "Add a debater to begin saving.");
    setMessage("");
  }

  function editAssignment(id) {
    const item = assignments.find(assignment => assignment.id === id);
    if (!item) return;
    const pairA = item.pairAIds || item.studentIds || [];
    const pairB = item.pairBIds || [];
    editingId = id;
    renderPeopleOptions({
      "tryout-a-one": pairA[0], "tryout-a-two": pairA[1],
      "tryout-b-one": pairB[0], "tryout-b-two": pairB[1],
    });
    [["a", 0], ["b", 2]].forEach(([side, offset]) => {
      pairEntries(item, side).forEach((entry, index) => {
        if (!entry || entry.id || !DEBATER_FIELDS[offset + index]) return;
        $(DEBATER_FIELDS[offset + index]).value = `${entry.name}${entry.grade ? ` · ${entry.grade}` : ""}`;
      });
    });
    $("tryout-date").value = item.date;
    $("tryout-status").value = item.status || "scheduled";
    $("tryout-judge").value = item.judge;
    $("tryout-judge-type").value = item.judgeType || "member";
    $("tryout-start").value = item.startTime;
    $("tryout-end").value = item.endTime;
    updateTimePeriods();
    $("tryout-location").value = item.location;
    $("tryout-notes").value = item.notes || "";
    $("tryout-form-heading").textContent = "Edit debate";
    $("tryout-new-draft").hidden = false;
    $("tryout-new-draft").disabled = false;
    setAutosaveStatus("tryout-record-status", "Saved");
    setMessage("");
    $("tryout-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeDeleteModal() {
    $("tryout-delete-modal").hidden = true;
    document.body.classList.remove("tm-modal-open");
    pendingDeleteId = "";
    deleteTrigger?.focus();
    deleteTrigger = null;
  }

  function openDeleteModal(id, trigger) {
    const item = assignments.find(assignment => assignment.id === id);
    if (!item) return;
    pendingDeleteId = id;
    deleteTrigger = trigger;
    const row = assignments.findIndex(assignment => assignment.id === id) + 1;
    const students = [...pairNames(item, "a"), ...pairNames(item, "b")];
    $("tryout-delete-summary").textContent = `Row ${row}${students.length ? ` · ${students.join(" and ")}` : ""}${item.date ? ` · ${dateLabel(item.date)}` : " · Draft"}`;
    $("tryout-delete-modal").hidden = false;
    document.body.classList.add("tm-modal-open");
    $("tryout-delete-confirm").focus();
  }

  async function deleteAssignment() {
    const id = pendingDeleteId;
    if (!id) return;
    try {
      $("tryout-delete-confirm").disabled = true;
      await manage({ action: "delete", assignmentId: id });
      closeDeleteModal();
      await load();
      if (editingId === id) resetForm();
    } catch (error) {
      closeDeleteModal();
      setMessage(error.message, "error");
    } finally {
      $("tryout-delete-confirm").disabled = false;
    }
  }

  function scheduleTemplateSave(delay = 800, markRevision = true) {
    if (markRevision) templateRevision += 1;
    clearTimeout(templateSaveTimer);
    setAutosaveStatus("tryout-settings-status", "Saving…", "saving");
    templateSaveTimer = setTimeout(saveTemplate, delay);
  }

  async function saveTemplate() {
    templateSaveTimer = null;
    if (templateSaving) {
      templateSaveQueued = true;
      return;
    }
    const title = $("tryout-tournament-name").value.trim();
    const startDate = $("tryout-range-start").value;
    const endDate = $("tryout-range-end").value;
    if (!title) {
      setAutosaveStatus("tryout-settings-status", "Enter a tournament name to save.", "error");
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setAutosaveStatus("tryout-settings-status", "Choose a valid date range to save.", "error");
      return;
    }
    try {
      templateSaving = true;
      setAutosaveStatus("tryout-settings-status", "Saving…", "saving");
      const result = await manage({ action: "saveTemplate", template: { title, startDate, endDate } });
      template = result.template;
      applyTemplate();
      publishTemplateToTournamentGrid();
      renderSummary();
      setAutosaveStatus("tryout-settings-status", "Saved just now");
    } catch (error) {
      setAutosaveStatus("tryout-settings-status", error.message, "error");
    } finally {
      templateSaving = false;
      if (templateSaveQueued) {
        templateSaveQueued = false;
        scheduleTemplateSave(0, false);
      }
    }
  }

  function collectAssignment() {
    const entries = DEBATER_FIELDS.map(id => parseDebaterValue($(id).value));
    const populated = entries.filter(Boolean);
    if (populated.some(entry => !entry.name)) return { error: "Enter a name for each debater." };
    const identityKeys = populated.map(entry => entry.name.toLowerCase().replace(/\s+/g, " "));
    if (new Set(identityKeys).size !== identityKeys.length) return { error: "Each debater can appear only once." };
    const pairAEntries = entries.slice(0, 2).filter(Boolean);
    const pairBEntries = entries.slice(2).filter(Boolean);
    return { assignment: {
      pairAIds: pairAEntries.map(entry => entry.id).filter(Boolean),
      pairBIds: pairBEntries.map(entry => entry.id).filter(Boolean),
      pairAEntries,
      pairBEntries,
      date: $("tryout-date").value,
      status: $("tryout-status").value,
      judge: $("tryout-judge").value.trim(),
      judgeType: $("tryout-judge-type").value,
      startTime: $("tryout-start").value,
      endTime: $("tryout-end").value,
      location: $("tryout-location").value.trim(),
      notes: $("tryout-notes").value.trim(),
    } };
  }

  function scheduleAssignmentSave(delay = 800) {
    clearTimeout(assignmentSaveTimer);
    if (!DEBATER_FIELDS.some(id => $(id).value.trim())) {
      $("tryout-new-draft").disabled = false;
      setAutosaveStatus("tryout-record-status", "Add a debater to begin saving.");
      return;
    }
    $("tryout-new-draft").disabled = true;
    setAutosaveStatus("tryout-record-status", "Saving…", "saving");
    assignmentSaveTimer = setTimeout(saveAssignment, delay);
  }

  async function saveAssignment() {
    assignmentSaveTimer = null;
    if (assignmentSaving) {
      assignmentSaveQueued = true;
      return;
    }
    const { assignment, error } = collectAssignment();
    if (error) {
      setAutosaveStatus("tryout-record-status", error, "error");
      return;
    }
    let saved = false;
    try {
      assignmentSaving = true;
      setAutosaveStatus("tryout-record-status", "Saving…", "saving");
      const result = await manage({ action: "save", assignmentId: editingId, assignment });
      editingId = result.assignmentId;
      $("tryout-form-heading").textContent = "Edit debate";
      $("tryout-new-draft").hidden = false;
      await load(true);
      saved = true;
    } catch (error) {
      setAutosaveStatus("tryout-record-status", error.message, "error");
    } finally {
      assignmentSaving = false;
      if (assignmentSaveQueued) {
        assignmentSaveQueued = false;
        scheduleAssignmentSave(0);
      } else if (saved) {
        $("tryout-new-draft").disabled = false;
        setAutosaveStatus("tryout-record-status", "Saved just now");
      }
    }
  }

  async function load(preserveTemplateFields = false) {
    const requestedAtRevision = templateRevision;
    const result = await manage({ action: "list" });
    debaters = result.debaters || result.students || [];
    judges = result.judges || [];
    assignments = result.assignments || [];
    if (!preserveTemplateFields && requestedAtRevision === templateRevision) {
      template = result.template || template;
      applyTemplate();
      publishTemplateToTournamentGrid();
    }
    const typedDebaterValues = Object.fromEntries(DEBATER_FIELDS.map(id => [id, $(id).value]));
    renderPeopleOptions(editingId ? {
      "tryout-a-one": selectedDebaterId("tryout-a-one"), "tryout-a-two": selectedDebaterId("tryout-a-two"),
      "tryout-b-one": selectedDebaterId("tryout-b-one"), "tryout-b-two": selectedDebaterId("tryout-b-two"),
    } : {}, editingId ? typedDebaterValues : {});
    renderSchedule();
  }

  function showMode(mode) {
    const tryout = mode === "tryout";
    $("volunteer-manager").hidden = tryout;
    $("tryout-manager").hidden = !tryout;
    document.querySelectorAll("[data-manager-mode]").forEach(button =>
      button.classList.toggle("active", button.dataset.managerMode === mode));
    window.activateEventsTab?.(tryout ? "tryout" : "overview");
    if (tryout && currentUser) load().catch(error => {
      $("tryout-schedule-list").innerHTML = `<div class="tryout-empty">${esc(error.message)}</div>`;
    });
  }
  window.setTryoutManagerVisible = visible => showMode(visible ? "tryout" : "volunteers");

  function enableNativePickers() {
    document.querySelectorAll('#tryout-manager input[type="date"], #tryout-manager input[type="time"]').forEach(input => {
      input.addEventListener("click", () => {
        if (typeof input.showPicker !== "function") return;
        try {
          input.showPicker();
        } catch (_) {
          // Browsers without an available native picker retain normal input behavior.
        }
      });
    });
  }

  function updateTimePeriods() {
    ["start", "end"].forEach(side => {
      const value = $(`tryout-${side}`).value;
      const hour = Number(value.split(":")[0]);
      $(`tryout-${side}-period`).textContent = value ? (hour >= 12 ? "PM" : "AM") : "AM / PM";
    });
  }

  function pdfFileDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function fittedPdfFontSize(doc, text, width, preferredSize, minimumSize = 5) {
    const words = String(text || "—").split(/\s+/).filter(Boolean);
    const longest = words.reduce((current, word) => word.length > current.length ? word : current, "");
    let size = preferredSize;
    doc.font("Helvetica");
    while (size > minimumSize && doc.fontSize(size).widthOfString(longest) > width) size -= 0.25;
    return size;
  }

  async function saveSchedulePdf() {
    const visible = visibleAssignments();
    if (!visible.length) {
      setMessage("There are no visible debates to save as a PDF.", "error");
      return;
    }
    if (!window.PDFDocument) {
      setMessage("PDF creation is unavailable. Refresh the page and try again.", "error");
      return;
    }
    const button = $("tryout-save-pdf");
    const label = button.querySelector(".tryout-pdf-label");
    button.disabled = true;
    label.textContent = "Choose location…";
    let fileHandle;
    try {
      if (typeof window.showSaveFilePicker !== "function") {
        throw new Error("Use the latest Chrome or Edge browser to choose where to save the PDF.");
      }
      fileHandle = await window.showSaveFilePicker({
        suggestedName: `debate-tryout-schedule-${pdfFileDate()}.pdf`,
        types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
      });
    } catch (error) {
      button.disabled = false;
      label.textContent = "Save landscape PDF";
      if (error?.name !== "AbortError") setMessage(error.message || "A save location could not be selected.", "error");
      return;
    }
    label.textContent = "Saving PDF…";
    try {
      const doc = new window.PDFDocument({
        size: "LETTER",
        layout: "landscape",
        margin: 24,
        bufferPages: true,
        info: { Title: `${template.title || "Debate Tryout Schedule"} — Cooper Debate Team`, Author: "Cooper Debate Team" },
      });
      const chunks = [];
      const columns = [
        { label: "#", width: 28, align: "center" },
        { label: "Pair A", width: 116, pair: "a" },
        { label: "Pair B", width: 116, pair: "b" },
        { label: "Date", width: 76 },
        { label: "Time", width: 88 },
        { label: "Judge", width: 100 },
        { label: "Room", width: 78 },
        { label: "Record status", width: 92, status: true },
      ];
      const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
      const left = (doc.page.width - tableWidth) / 2;
      const bottom = doc.page.height - 34;
      let y = 0;
      const drawPageHeading = () => {
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#071a36");
        doc.rect(0, 0, doc.page.width, 68).fill("#174990");
        doc.rect(0, 64, doc.page.width, 4).fill("#d6aa2f");
        doc.fillColor("#ffe45c").font("Helvetica-Bold").fontSize(8).text("COOPER DEBATE TEAM", 24, 13, { characterSpacing: 1.2 });
        doc.fillColor("#d6aa2f").font("Helvetica-Bold").fontSize(19).text(template.title || "Debate Tryout Schedule", 24, 28, { width: 500 });
        doc.fillColor("#d9e8fb").font("Helvetica").fontSize(8).text(`Generated ${new Date().toLocaleString("en-US")}`, doc.page.width - 246, 18, { align: "right", width: 220 });
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10).text(`${visible.length} ${visible.length === 1 ? "debate" : "debates"}`, doc.page.width - 246, 37, { align: "right", width: 220 });
        const filter = scheduleFilter === "all" ? "All records" : `${scheduleFilter[0].toUpperCase()}${scheduleFilter.slice(1)} records`;
        const details = [`Filter: ${filter}`, `Sort: ${scheduleSort}`, scheduleSearch.trim() ? `Search: ${scheduleSearch.trim()}` : ""].filter(Boolean).join("   •   ");
        doc.fillColor("#8fb9eb").font("Helvetica").fontSize(7.5).text(details, left, 75, { width: tableWidth });
        y = 92;
      };
      const drawTableHeading = () => {
        let x = left;
        columns.forEach(column => {
          doc.rect(x, y, column.width, 31).fill("#0d2850");
          const buttonWidth = Math.min(column.width - 8, Math.max(24, doc.font("Helvetica-Bold").fontSize(6.5).widthOfString(column.label.toUpperCase()) + 14));
          doc.roundedRect(x + 4, y + 5, buttonWidth, 21, 4).fillAndStroke("#03152d", "#294d7d");
          doc.fillColor("#ffe45c").font("Helvetica-Bold").fontSize(6.5)
            .text(column.label.toUpperCase(), x + 9, y + 12, { align: column.align || "left", width: buttonWidth - 10, lineBreak: false });
          x += column.width;
        });
        y += 31;
      };
      const addPage = () => {
        doc.addPage({ size: "LETTER", layout: "landscape", margin: 24 });
        drawPageHeading();
        drawTableHeading();
      };
      const drawPair = (entries, x, top, width) => {
        entries.slice(0, 2).forEach((entry, index) => {
          const lineY = top + 7 + (index * 16);
          const grade = gradeLabel(entry.grade || debaters.find(person => person.id === entry.id)?.grade);
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(fittedPdfFontSize(doc, entry.name, width - (grade ? 31 : 10), 7.2))
            .text(entry.name || "Not set", x + 5, lineY, { lineBreak: false, width: width - (grade ? 31 : 10) });
          if (grade) {
            doc.circle(x + width - 15, lineY + 4, 8).fillAndStroke("#0b2d5c", "#315e9c");
            doc.fillColor("#ffe45c").font("Helvetica-Bold").fontSize(5.5).text(grade, x + width - 23, lineY + 2, { align: "center", lineBreak: false, width: 16 });
          }
        });
      };
      drawPageHeading();
      drawTableHeading();
      visible.forEach((item, rowIndex) => {
        const rowHeight = 43;
        if (y + rowHeight > bottom) addPage();
        const draft = isDraft(item);
        const values = [
          String(rowIndex + 1),
          null,
          null,
          dateLabel(item.date) || "Date not set",
          [timeLabel(item.startTime), timeLabel(item.endTime)].filter(Boolean).join("–") || "Time not set",
          item.judge || "Not set",
          item.location || "Not set",
          draft ? "Draft" : "Finalized",
        ];
        let x = left;
        columns.forEach((column, index) => {
          const fill = rowIndex % 2 ? "#0a254a" : "#123460";
          doc.rect(x, y, column.width, rowHeight).fillAndStroke(fill, "#31577f");
          if (column.pair) {
            drawPair(pairEntries(item, column.pair), x, y, column.width);
          } else if (column.status) {
            const statusFill = draft ? "#735a11" : "#155f43";
            const statusStroke = draft ? "#d6aa2f" : "#52c58c";
            const statusText = draft ? "#ffe45c" : "#b5f3d2";
            doc.roundedRect(x + 6, y + 13, column.width - 12, 18, 9).fillAndStroke(statusFill, statusStroke);
            doc.fillColor(statusText).font("Helvetica-Bold").fontSize(6.5).text(values[index].toUpperCase(), x + 9, y + 19, { align: "center", lineBreak: false, width: column.width - 18 });
          } else {
            const text = values[index];
            const size = fittedPdfFontSize(doc, text, column.width - 10, index === 0 ? 8 : 7.2);
            doc.fillColor(index === 0 ? "#8fb9eb" : "#e8f2ff").font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(size)
              .text(text, x + 5, y + 8, { align: column.align || "left", height: rowHeight - 12, width: column.width - 10 });
          }
          x += column.width;
        });
        y += rowHeight;
      });
      const range = doc.bufferedPageRange();
      for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
        doc.switchToPage(pageIndex);
        doc.fillColor("#8ca6ca").font("Helvetica").fontSize(7)
          .text("Cooper Debate Team • Internal debate tryout schedule", 24, doc.page.height - 36, { lineBreak: false, width: 400 });
        doc.fillColor("#d6aa2f").font("Helvetica-Bold")
          .text(`Page ${pageIndex - range.start + 1} of ${range.count}`, doc.page.width - 124, doc.page.height - 36, { align: "right", lineBreak: false, width: 100 });
      }
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", async () => {
        try {
          const blob = new Blob(chunks, { type: "application/pdf" });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          setMessage("Landscape PDF saved.", "ok");
        } catch (error) {
          console.error("Unable to write debate schedule PDF", error);
          setMessage("The PDF could not be saved to that location. Please try again.", "error");
        } finally {
          button.disabled = false;
          label.textContent = "Save landscape PDF";
        }
      });
      doc.end();
    } catch (error) {
      button.disabled = false;
      label.textContent = "Save landscape PDF";
      console.error("Unable to save debate schedule PDF", error);
      setMessage("The PDF could not be created. Please refresh the page and try again.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    enableNativePickers();
    updateTimePeriods();
    $("tryout-form").addEventListener("submit", event => event.preventDefault());
    $("tryout-new-draft").addEventListener("click", resetForm);
    $("tryout-save-pdf").addEventListener("click", saveSchedulePdf);
    TEMPLATE_FIELDS.forEach(id => $(id).addEventListener("input", () => scheduleTemplateSave()));
    ASSIGNMENT_FIELDS.forEach(id => $(id).addEventListener("input", () => {
      if (id === "tryout-start" || id === "tryout-end") updateTimePeriods();
      scheduleAssignmentSave();
    }));
    $("tryout-delete-cancel").addEventListener("click", closeDeleteModal);
    $("tryout-delete-confirm").addEventListener("click", deleteAssignment);
    $("tryout-delete-modal").addEventListener("click", event => {
      if (event.target === $("tryout-delete-modal")) closeDeleteModal();
    });
    $("tryout-schedule-search").addEventListener("input", event => {
      scheduleSearch = event.target.value;
      renderSchedule();
    });
    document.querySelectorAll("[data-tryout-filter]").forEach(button => button.addEventListener("click", () => {
      scheduleFilter = button.dataset.tryoutFilter;
      renderSchedule();
    }));
    document.querySelectorAll("[data-tryout-sort]").forEach(button => button.addEventListener("click", () => {
      const nextSort = button.dataset.tryoutSort;
      if (scheduleSort === nextSort) scheduleSortDirection *= -1;
      else {
        scheduleSort = nextSort;
        scheduleSortDirection = 1;
      }
      renderSchedule();
    }));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !$("tryout-delete-modal").hidden) closeDeleteModal();
    });
    document.querySelectorAll("[data-manager-mode]").forEach(button =>
      button.addEventListener("click", () => showMode(button.dataset.managerMode)));
    document.querySelectorAll("[data-open-tryout]").forEach(link =>
      link.addEventListener("click", event => {
        event.preventDefault();
        showMode("tryout");
        $("tryout-manager").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
  });

  document.addEventListener("tournament-manager-ready", event => {
    currentUser = firebase.auth().currentUser;
    canDelete = event.detail?.role !== "captain";
    const isCaptain = event.detail?.role === "captain";
    $("tryout-tournament-name").disabled = isCaptain;
    $("tryout-range-start").disabled = isCaptain;
    $("tryout-range-end").disabled = isCaptain;
    if (isCaptain) setAutosaveStatus("tryout-settings-status", "View only");
    const requestedAtRevision = templateRevision;
    manage({ action: "list" }).then(result => {
      if (requestedAtRevision !== templateRevision) return;
      template = result.template || template;
      applyTemplate();
      publishTemplateToTournamentGrid();
    }).catch(error => console.warn("Unable to load the tryout tournament summary:", error));
    if (isCaptain) {
      $("volunteer-manager").hidden = true;
      showMode("tryout");
    } else if (location.hash === "#tryout-manager") {
      showMode("tryout");
    }
  });
})();