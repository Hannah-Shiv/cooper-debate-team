/* Cooper Debate Team — coach-only volunteer opportunity management */
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
  const MANAGE_ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/manageVolunteerSignup";
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  let editingId = null;
  let events = [];
  let currentUser = null;
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function isApproved(email) {
    return typeof APPROVED_MEMBERS !== "undefined" &&
      Array.isArray(APPROVED_MEMBERS) &&
      APPROVED_MEMBERS.some(member => member.toLowerCase() === String(email || "").toLowerCase());
  }
  function isCoach(email) {
    return typeof getAdminRole === "function" && getAdminRole(email) === "coach";
  }
  function message(text, kind) {
    const el = $("vol-form-msg");
    el.textContent = text || "";
    el.className = `vol-form-msg${kind ? ` ${kind}` : ""}`;
  }
  function makeRole(role = {}) {
    const id = role.id || `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const wrap = document.createElement("div");
    wrap.className = "role-editor";
    wrap.dataset.roleId = id;
    wrap.innerHTML = `
      <button class="remove-role" type="button" title="Remove role">Remove</button>
      <div class="role-editor-grid">
        <input class="role-label" maxlength="100" required placeholder="Role name" value="${esc(role.label)}">
        <input class="role-capacity" min="1" max="100" required type="number" placeholder="Capacity" value="${Number(role.capacity) || 1}">
      </div>
      <input class="role-description" maxlength="280" placeholder="Short description (optional)" value="${esc(role.description)}">`;
    wrap.querySelector(".remove-role").addEventListener("click", () => {
      if ($("role-editors").children.length > 1) wrap.remove();
      else message("Each opportunity needs at least one role.", "error");
    });
    $("role-editors").appendChild(wrap);
  }
  function rolesFromForm() {
    return [...document.querySelectorAll(".role-editor")].map((element, index) => ({
      id: element.dataset.roleId || `role-${index + 1}`,
      label: element.querySelector(".role-label").value.trim(),
      capacity: Number(element.querySelector(".role-capacity").value),
      description: element.querySelector(".role-description").value.trim(),
      signedUp: Number(element.dataset.signedUp || 0),
    })).filter(role => role.label && Number.isInteger(role.capacity) && role.capacity > 0 && role.capacity <= 100);
  }
  function resetForm() {
    editingId = null;
    $("vol-event-form").reset();
    $("role-editors").innerHTML = "";
    makeRole();
    $("vol-form-heading").textContent = "New volunteer event";
    $("vol-save").textContent = "Publish volunteer event";
    $("vol-cancel-edit").style.display = "none";
    message("");
  }
  function populateForm(event) {
    editingId = event.id;
    $("event-title").value = event.title || "";
    $("event-date").value = event.date || "";
    $("event-deadline").value = event.signupDeadline || "";
    $("event-location").value = event.location || "";
    $("event-details").value = event.details || "";
    $("event-published").checked = !!event.published;
    $("role-editors").innerHTML = "";
    (event.roles || []).forEach(role => {
      makeRole(role);
      $("role-editors").lastElementChild.dataset.signedUp = Number(role.signedUp) || 0;
    });
    if (!$("role-editors").children.length) makeRole();
    $("vol-form-heading").textContent = "Edit volunteer event";
    $("vol-save").textContent = "Save changes";
    $("vol-cancel-edit").style.display = "block";
    message("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function formEvent() {
    const roles = rolesFromForm();
    const title = $("event-title").value.trim();
    const date = $("event-date").value;
    if (!title || !date || !roles.length) throw new Error("Add an event title, date, and at least one role with a capacity.");
    if (roles.some(role => role.capacity < role.signedUp)) {
      throw new Error("A role’s capacity cannot be lower than its current signup count.");
    }
    return {
      title, date, roles,
      signupDeadline: $("event-deadline").value || "",
      location: $("event-location").value.trim(),
      details: $("event-details").value.trim(),
      published: $("event-published").checked,
    };
  }
  async function manage(payload) {
    const token = await currentUser.getIdToken();
    const response = await fetch(MANAGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Unable to update volunteer signups.");
    return result;
  }
  async function saveEvent(event) {
    event.preventDefault();
    try {
      const data = formEvent();
      $("vol-save").disabled = true;
      await manage({ action: "saveEvent", eventId: editingId || "", event: data });
      resetForm();
    } catch (error) {
      message(error.message || "Unable to save this volunteer event.", "error");
    } finally {
      $("vol-save").disabled = false;
    }
  }
  async function signupsForEvent(eventId) {
    const snap = await db.collection("volunteer_signups").where("eventId", "==", eventId).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const left = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const right = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return right - left;
      });
  }
  function csvCell(value) {
    const raw = String(value || "");
    const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, "\"\"")}"`;
  }
  async function exportEvent(eventId) {
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    try {
      const signups = await signupsForEvent(eventId);
      const rows = [["Event", "Date", "Role", "Parent / guardian", "Email", "Phone", "Debater", "Notes", "Submitted"]];
      signups.forEach(signup => rows.push([
        event.title, event.date, signup.roleLabel, signup.parentName, signup.email,
        signup.phone, signup.studentName, signup.notes,
        signup.createdAt && signup.createdAt.toDate ? signup.createdAt.toDate().toLocaleString() : "",
      ]));
      const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "volunteers"}-signups.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      alert(error.message || "Unable to export signups.");
    }
  }
  async function removeSignup(signup) {
    if (!confirm(`Remove ${signup.parentName}'s ${signup.roleLabel} signup?`)) return;
    try {
      await manage({ action: "removeSignup", signupId: signup.id });
      renderEvents(events);
    } catch (error) {
      alert(error.message || "Unable to remove this signup.");
    }
  }
  async function setPublished(eventId, published) {
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    const action = published ? "reopen" : "close";
    if (!confirm(`${published ? "Reopen" : "Close"} “${event.title}” to public volunteer signups?`)) return;
    try {
      await manage({ action: "setPublished", eventId, published });
    } catch (error) {
      alert(error.message || "Unable to update this event.");
    }
  }
  async function renderEvents(items) {
    const root = $("vol-event-list");
    if (!items.length) {
      root.innerHTML = `<div class="vol-empty">No volunteer opportunities have been created yet. Start with the form on the left, then publish when families are ready to sign up.</div>`;
      return;
    }
    root.innerHTML = items.map(item => {
      const roles = (item.roles || []).map(role => `<div><b>${Math.max(0, Number(role.capacity || 0) - Number(role.signedUp || 0))}/${Number(role.capacity || 0)} open</b> &nbsp; ${esc(role.label)}</div>`).join("");
      return `<article class="vol-event" data-event="${esc(item.id)}">
        <div class="vol-event-main">
          <div class="vol-event-top"><div><h3>${esc(item.title)}</h3><p class="vol-event-meta">${esc(item.date)}${item.location ? ` · ${esc(item.location)}` : ""}${item.signupDeadline ? ` · sign up by ${esc(item.signupDeadline)}` : ""}</p></div><span class="vol-status ${item.published ? "open" : "closed"}">${item.published ? "Published" : "Closed"}</span></div>
          ${item.details ? `<p class="vol-event-meta" style="margin:10px 0 0">${esc(item.details)}</p>` : ""}
          <div class="vol-role-summary">${roles}</div>
          <div class="vol-event-actions">
            <button class="vol-action" data-edit="${esc(item.id)}">Edit event</button>
            <button class="vol-action close" data-toggle="${esc(item.id)}">${item.published ? "Close signups" : "Reopen signups"}</button>
            <button class="vol-action" data-export="${esc(item.id)}">Export CSV</button>
          </div>
        </div>
        <div class="vol-signups"><h4>Private parent signups</h4><div class="signups-body"><p class="vol-no-signups">Loading signups…</p></div></div>
      </article>`;
    }).join("");
    root.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => populateForm(events.find(item => item.id === button.dataset.edit))));
    root.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
      const event = events.find(item => item.id === button.dataset.toggle);
      setPublished(event.id, !event.published);
    }));
    root.querySelectorAll("[data-export]").forEach(button => button.addEventListener("click", () => exportEvent(button.dataset.export)));
    await Promise.all(items.map(async item => {
      const body = root.querySelector(`[data-event="${CSS.escape(item.id)}"] .signups-body`);
      if (!body) return;
      try {
        const signups = await signupsForEvent(item.id);
        body.innerHTML = signups.length ? signups.map(signup => `<div class="vol-signup-row"><div><div class="vol-signup-name">${esc(signup.parentName)} <span style="color:var(--vol-gold);font-weight:400;">· ${esc(signup.roleLabel)}</span></div><div class="vol-signup-details">${esc(signup.email)} · ${esc(signup.phone)}${signup.studentName ? ` · Debater: ${esc(signup.studentName)}` : ""}${signup.notes ? `<br>${esc(signup.notes)}` : ""}</div></div><button class="vol-remove" data-remove="${esc(signup.id)}">Remove</button></div>`).join("") : `<p class="vol-no-signups">No parent signups yet.</p>`;
        body.querySelectorAll("[data-remove]").forEach(button => {
          const signup = signups.find(item => item.id === button.dataset.remove);
          button.addEventListener("click", () => removeSignup(signup));
        });
      } catch (_) {
        body.innerHTML = `<p class="vol-no-signups">Unable to load signups.</p>`;
      }
    }));
  }
  function startEvents() {
    db.collection("volunteer_events").orderBy("date", "asc").onSnapshot(snapshot => {
      events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderEvents(events);
    }, error => {
      $("vol-event-list").innerHTML = `<div class="vol-empty">Volunteer events could not be loaded: ${esc(error.message)}</div>`;
    });
  }
  function showAccess(title, text, login) {
    $("vol-auth").innerHTML = `<div class="vol-auth-box"><h1>${esc(title)}</h1><p>${esc(text)}</p>${login ? `<a class="vol-login" href="members.html">Sign in to Member Portal</a>` : ""}</div>`;
  }

  auth.onAuthStateChanged(user => {
    if (!user) {
      showAccess("Coach access required", "Sign in through the Member Portal to manage tournament volunteer opportunities.", true);
      return;
    }
    if (!isApproved(user.email)) {
      showAccess("Membership not approved", "This account is not approved for the Cooper Debate Member Portal.", false);
      return;
    }
    if (!isCoach(user.email)) {
      showAccess("Coach access only", "Volunteer signups contain parent contact details and can only be managed by a coach.", false);
      return;
    }
    currentUser = user;
    $("vol-auth").hidden = true;
    $("vol-dashboard").hidden = false;
    $("vol-user").textContent = `${user.email} · Coach`;
    resetForm();
    startEvents();
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("add-role").addEventListener("click", () => makeRole());
    $("vol-event-form").addEventListener("submit", saveEvent);
    $("vol-cancel-edit").addEventListener("click", resetForm);
  });
})();