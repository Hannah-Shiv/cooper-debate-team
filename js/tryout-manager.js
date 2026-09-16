/* Cooper Debate Team — private tryout schedule manager */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageTryoutSchedule";
  const SESSION_META = {
    sep22: { date: "2026-09-22", label: "Tuesday, September 22", location: "Cafeteria" },
    sep23: { date: "2026-09-23", label: "Wednesday, September 23", location: "Lecture Hall" },
  };
  let students = [];
  let assignments = [];
  let editingId = "";
  let currentUser = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const timeLabel = value => {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return value || "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  };

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

  function studentsForSession(session) {
    return students.filter(student => student.session === session);
  }

  function renderStudentOptions(selectedOne = "", selectedTwo = "") {
    const session = $("tryout-session").value;
    const available = studentsForSession(session);
    const options = `<option value="">Choose a debater</option>` + available.map(student =>
      `<option value="${esc(student.id)}">${esc(student.name)} · Grade ${esc(student.grade)}</option>`
    ).join("");
    $("tryout-student-one").innerHTML = options;
    $("tryout-student-two").innerHTML = options;
    $("tryout-student-one").value = selectedOne;
    $("tryout-student-two").value = selectedTwo;
    if (!editingId) $("tryout-location").value = SESSION_META[session].location;
  }

  function renderSummary() {
    const scheduledIds = new Set(assignments.flatMap(item => item.studentIds || []));
    $("tryout-student-count").textContent = students.length;
    $("tryout-pair-count").textContent = assignments.length;
    $("tryout-unscheduled-count").textContent = students.filter(student => !scheduledIds.has(student.id)).length;
  }

  function renderSchedule() {
    const root = $("tryout-schedule-list");
    if (!assignments.length) {
      root.innerHTML = `<div class="tryout-empty">No pairs have been scheduled yet. Add the first assignment using the form.</div>`;
      renderSummary();
      return;
    }
    root.innerHTML = `<table class="tryout-table">
      <thead><tr><th>Pair</th><th>Date &amp; time</th><th>Judge</th><th>Room</th><th>Actions</th></tr></thead>
      <tbody>${assignments.map(item => `<tr>
        <td><strong>${(item.studentNames || []).map(esc).join(" &amp; ")}</strong>${item.notes ? `<br><small>${esc(item.notes)}</small>` : ""}</td>
        <td>${esc(SESSION_META[item.session]?.label || item.date)}<br><strong>${esc(timeLabel(item.startTime))}–${esc(timeLabel(item.endTime))}</strong></td>
        <td>${esc(item.judge)}</td>
        <td>${esc(item.location)}</td>
        <td><div class="tryout-row-actions"><button type="button" data-tryout-edit="${esc(item.id)}">Edit</button><button type="button" data-tryout-delete="${esc(item.id)}">Delete</button></div></td>
      </tr>`).join("")}</tbody>
    </table>`;
    root.querySelectorAll("[data-tryout-edit]").forEach(button => button.addEventListener("click", () => editAssignment(button.dataset.tryoutEdit)));
    root.querySelectorAll("[data-tryout-delete]").forEach(button => button.addEventListener("click", () => deleteAssignment(button.dataset.tryoutDelete)));
    renderSummary();
  }

  function resetForm() {
    editingId = "";
    $("tryout-form").reset();
    $("tryout-session").value = "sep22";
    $("tryout-form-heading").textContent = "Add tryout assignment";
    $("tryout-save").textContent = "Add to schedule";
    $("tryout-cancel").hidden = true;
    renderStudentOptions();
    setMessage("");
  }

  function editAssignment(id) {
    const item = assignments.find(assignment => assignment.id === id);
    if (!item) return;
    editingId = id;
    $("tryout-session").value = item.session;
    renderStudentOptions(item.studentIds[0], item.studentIds[1]);
    $("tryout-judge").value = item.judge;
    $("tryout-start").value = item.startTime;
    $("tryout-end").value = item.endTime;
    $("tryout-location").value = item.location;
    $("tryout-notes").value = item.notes || "";
    $("tryout-form-heading").textContent = "Edit tryout assignment";
    $("tryout-save").textContent = "Save changes";
    $("tryout-cancel").hidden = false;
    setMessage("");
    $("tryout-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteAssignment(id) {
    const item = assignments.find(assignment => assignment.id === id);
    if (!item || !confirm(`Delete the tryout assignment for ${(item.studentNames || []).join(" and ")}?`)) return;
    try {
      await manage({ action: "delete", assignmentId: id });
      await load();
      if (editingId === id) resetForm();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function save(event) {
    event.preventDefault();
    const session = $("tryout-session").value;
    const firstId = $("tryout-student-one").value;
    const secondId = $("tryout-student-two").value;
    if (!firstId || !secondId || firstId === secondId) {
      setMessage("Choose two different debaters.", "error");
      return;
    }
    const assignment = {
      session,
      date: SESSION_META[session].date,
      studentIds: [firstId, secondId],
      judge: $("tryout-judge").value.trim(),
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
      setMessage("Tryout assignment saved.", "ok");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      $("tryout-save").disabled = false;
    }
  }

  async function load() {
    const result = await manage({ action: "list" });
    students = result.students || [];
    assignments = result.assignments || [];
    renderStudentOptions(
      editingId ? $("tryout-student-one").value : "",
      editingId ? $("tryout-student-two").value : ""
    );
    renderSchedule();
  }

  function showMode(mode) {
    const tryout = mode === "tryout";
    $("tryout-manager").hidden = !tryout;
    $("volunteer-manager").hidden = tryout;
    document.querySelectorAll("[data-manager-mode]").forEach(button =>
      button.classList.toggle("active", button.dataset.managerMode === mode));
    if (tryout && currentUser) {
      load().catch(error => {
        $("tryout-schedule-list").innerHTML = `<div class="tryout-empty">${esc(error.message)}</div>`;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("tryout-form").addEventListener("submit", save);
    $("tryout-cancel").addEventListener("click", resetForm);
    $("tryout-session").addEventListener("change", () => renderStudentOptions());
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
    if (event.detail?.role === "captain" || location.hash === "#tryout-manager") showMode("tryout");
  });
})();