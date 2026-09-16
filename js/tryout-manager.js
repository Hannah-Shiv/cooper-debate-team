/* Cooper Debate Team — private tryout debate schedule manager */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageTryoutSchedule";
  const DEBATER_FIELDS = ["tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two"];
  let debaters = [];
  let judges = [];
  let assignments = [];
  let template = { title: "2026 Debate Tryout Schedule", startDate: "2026-09-16", endDate: "2026-09-23" };
  let editingId = "";
  let currentUser = null;
  let canDelete = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&quot;").replace(/'/g, "&#039;");
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

  function setMessage(text, kind) {
    const target = $("tryout-message");
    target.textContent = text || "";
    target.className = `tryout-message${kind ? ` ${kind}` : ""}`;
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

  function renderPeopleOptions(selected = {}) {
    const options = `<option value="">Choose a debater</option>${debaters.map(person =>
      `<option value="${esc(person.id)}">${esc(person.name)} · ${esc(person.grade || "Grade unavailable")} · ${esc(person.sourceLabel)}</option>`
    ).join("")}`;
    DEBATER_FIELDS.forEach(id => {
      $(id).innerHTML = options;
      $(id).value = selected[id] || "";
    });
    $("tryout-judge-options").innerHTML = judges.map(person =>
      `<option value="${esc(person.name)}">${esc(person.sourceLabel || "Members Directory")}</option>`
    ).join("");
  }

  function applyTemplate() {
    $("tryout-template-title").textContent = template.title || "Debate Tryout Schedule";
    $("tryout-range-start").value = template.startDate || "";
    $("tryout-range-end").value = template.endDate || "";
    $("tryout-date").min = template.startDate || "";
    $("tryout-date").max = template.endDate || "";
    if (!$("tryout-date").value || $("tryout-date").value < template.startDate || $("tryout-date").value > template.endDate) {
      $("tryout-date").value = template.startDate || "";
    }
  }

  function renderSummary() {
    $("tryout-student-count").textContent = debaters.length;
    $("tryout-pair-count").textContent = assignments.length;
    const start = new Date(`${template.startDate}T12:00:00`);
    const end = new Date(`${template.endDate}T12:00:00`);
    const days = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? 0 : Math.max(0, Math.round((end - start) / 86400000) + 1);
    $("tryout-day-count").textContent = days;
  }

  function pairNames(item, side) {
    const names = side === "a" ? item.pairANames : item.pairBNames;
    return Array.isArray(names) && names.length ? names : side === "a" ? (item.studentNames || []).slice(0, 2) : [];
  }

  function renderSchedule() {
    const root = $("tryout-schedule-list");
    if (!assignments.length) {
      root.innerHTML = `<div class="tryout-empty">No debates have been scheduled yet. Add the first debate using the form.</div>`;
      renderSummary();
      return;
    }
    root.innerHTML = `<table class="tryout-table">
      <thead><tr><th>Pair A</th><th>Pair B</th><th>Date &amp; time</th><th>Judge</th><th>Room</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${assignments.map(item => `<tr>
        <td><strong>${pairNames(item, "a").map(esc).join(" &amp; ") || "Legacy pair"}</strong></td>
        <td><strong>${pairNames(item, "b").map(esc).join(" &amp; ") || "Not entered"}</strong>${item.notes ? `<br><small>${esc(item.notes)}</small>` : ""}</td>
        <td>${esc(dateLabel(item.date))}<br><strong>${esc(timeLabel(item.startTime))}–${esc(timeLabel(item.endTime))}</strong></td>
        <td>${esc(item.judge)}<br><small>${esc(item.judgeTypeLabel || "Members Directory")}</small></td>
        <td>${esc(item.location)}</td>
        <td><span class="tm-grid-status ${esc(item.status || "scheduled")}">${esc(statusLabel(item.status))}</span></td>
        <td><div class="tryout-row-actions"><button type="button" data-tryout-edit="${esc(item.id)}">Edit</button>${canDelete ? `<button type="button" data-tryout-delete="${esc(item.id)}">Delete</button>` : ""}</div></td>
      </tr>`).join("")}</tbody>
    </table>`;
    root.querySelectorAll("[data-tryout-edit]").forEach(button => button.addEventListener("click", () => editAssignment(button.dataset.tryoutEdit)));
    root.querySelectorAll("[data-tryout-delete]").forEach(button => button.addEventListener("click", () => deleteAssignment(button.dataset.tryoutDelete)));
    renderSummary();
  }

  function resetForm() {
    editingId = "";
    $("tryout-form").reset();
    $("tryout-form-heading").textContent = "Add debate";
    $("tryout-save").textContent = "Add debate";
    $("tryout-cancel").hidden = true;
    renderPeopleOptions();
    applyTemplate();
    $("tryout-status").value = "scheduled";
    $("tryout-judge-type").value = "member";
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
    $("tryout-date").value = item.date;
    $("tryout-status").value = item.status || "scheduled";
    $("tryout-judge").value = item.judge;
    $("tryout-judge-type").value = item.judgeType || "member";
    $("tryout-start").value = item.startTime;
    $("tryout-end").value = item.endTime;
    $("tryout-location").value = item.location;
    $("tryout-notes").value = item.notes || "";
    $("tryout-form-heading").textContent = "Edit debate";
    $("tryout-save").textContent = "Save changes";
    $("tryout-cancel").hidden = false;
    setMessage(pairA.length === 2 ? "" : "This older entry needs Pair A selected again before it can be saved.", pairA.length === 2 ? "" : "error");
    $("tryout-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteAssignment(id) {
    const item = assignments.find(assignment => assignment.id === id);
    if (!item || !confirm(`Delete the ${dateLabel(item.date)} debate?`)) return;
    try {
      await manage({ action: "delete", assignmentId: id });
      await load();
      if (editingId === id) resetForm();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function saveTemplate() {
    const startDate = $("tryout-range-start").value;
    const endDate = $("tryout-range-end").value;
    if (!startDate || !endDate || startDate > endDate) {
      setMessage("Choose a valid tryout start and end date.", "error");
      return;
    }
    try {
      $("tryout-range-save").disabled = true;
      const result = await manage({ action: "saveTemplate", template: { startDate, endDate } });
      template = result.template;
      applyTemplate();
      renderSummary();
      setMessage("Tryout date range saved.", "ok");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("tryout-range-save").disabled = false;
    }
  }

  async function save(event) {
    event.preventDefault();
    const ids = DEBATER_FIELDS.map(id => $(id).value);
    if (ids.some(id => !id) || new Set(ids).size !== 4) {
      setMessage("Choose four different debaters for Pair A and Pair B.", "error");
      return;
    }
    const assignment = {
      pairAIds: ids.slice(0, 2),
      pairBIds: ids.slice(2),
      date: $("tryout-date").value,
      status: $("tryout-status").value,
      judge: $("tryout-judge").value.trim(),
      judgeType: $("tryout-judge-type").value,
      startTime: $("tryout-start").value,
      endTime: $("tryout-end").value,
      location: $("tryout-location").value.trim(),
      notes: $("tryout-notes").value.trim(),
    };
    try {
      $("tryout-save").disabled = true;
      await manage({ action: "save", assignmentId: editingId, assignment });
      await load();
      resetForm();
      setMessage("Tryout debate saved.", "ok");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("tryout-save").disabled = false;
    }
  }

  async function load() {
    const result = await manage({ action: "list" });
    debaters = result.debaters || result.students || [];
    judges = result.judges || [];
    assignments = result.assignments || [];
    template = result.template || template;
    applyTemplate();
    renderPeopleOptions(editingId ? {
      "tryout-a-one": $("tryout-a-one").value, "tryout-a-two": $("tryout-a-two").value,
      "tryout-b-one": $("tryout-b-one").value, "tryout-b-two": $("tryout-b-two").value,
    } : {});
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

  document.addEventListener("DOMContentLoaded", () => {
    $("tryout-form").addEventListener("submit", save);
    $("tryout-cancel").addEventListener("click", resetForm);
    $("tryout-range-save").addEventListener("click", saveTemplate);
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
    $("tryout-range-save").hidden = isCaptain;
    $("tryout-range-start").disabled = isCaptain;
    $("tryout-range-end").disabled = isCaptain;
    if (isCaptain) {
      $("volunteer-manager").hidden = true;
      showMode("tryout");
    } else if (location.hash === "#tryout-manager") {
      showMode("tryout");
    }
  });
})();