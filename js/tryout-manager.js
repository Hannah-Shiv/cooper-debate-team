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
      <thead><tr><th>#</th><th>Pair A</th><th>Pair B</th><th>Date</th><th>Time</th><th>Judge</th><th>Room</th><th>Record status</th><th>Actions</th></tr></thead>
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

  document.addEventListener("DOMContentLoaded", () => {
    enableNativePickers();
    updateTimePeriods();
    $("tryout-form").addEventListener("submit", event => event.preventDefault());
    $("tryout-new-draft").addEventListener("click", resetForm);
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