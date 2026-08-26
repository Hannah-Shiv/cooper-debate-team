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
  window.memberSignOut = function () {
    auth.signOut().finally(() => { window.location.href = "index.html"; });
  };

  let editingId = null;
  let events = [];
  let currentUser = null;
  let capacityRoles = [];
  const $ = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const dateLabel = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };
  const timeLabel = value => {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  };

  function message(text, kind) {
    const el = $("vol-form-msg");
    el.textContent = text || "";
    el.className = `vol-form-msg${kind ? ` ${kind}` : ""}`;
  }
  function setCapacityRoles(roles = []) {
    const visibleRoles = roles.filter(role => role.label !== "Duplicate-check test");
    capacityRoles = visibleRoles.length ? visibleRoles.map(role => ({
      id: role.id || `judge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: role.label || "Judge",
      description: role.description || "",
      capacity: Math.max(1, Number(role.capacity) || 1),
      signedUp: Math.max(0, Number(role.signedUp) || 0),
    })) : [{
      id: `judge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: "Judge",
      description: "Judge volunteer",
      capacity: 1,
      signedUp: 0,
    }];
    $("event-judge-capacity").value = capacityRoles.reduce((total, role) => total + role.capacity, 0);
  }
  function rolesFromForm() {
    const confirmedCapacity = capacityRoles.reduce((total, role) => total + role.signedUp, 0);
    const desiredCapacity = Math.min(100, Math.max(1, confirmedCapacity, Number($("event-judge-capacity").value) || 1));
    $("event-judge-capacity").value = desiredCapacity;
    const roles = capacityRoles.map(role => ({ ...role }));
    const currentCapacity = roles.reduce((total, role) => total + role.capacity, 0);
    if (desiredCapacity > currentCapacity) {
      roles[0].capacity += desiredCapacity - currentCapacity;
    } else if (desiredCapacity < currentCapacity) {
      let remainingToRemove = currentCapacity - desiredCapacity;
      [...roles].reverse().forEach(role => {
        const removable = Math.max(0, role.capacity - role.signedUp);
        const amount = Math.min(removable, remainingToRemove);
        role.capacity -= amount;
        remainingToRemove -= amount;
      });
      if (remainingToRemove) roles[0].capacity -= remainingToRemove;
    }
    return roles.filter(role => role.label && Number.isInteger(role.capacity) && role.capacity > 0 && role.capacity <= 100);
  }
  function resetForm() {
    editingId = null;
    $("vol-event-form").reset();
    setCapacityRoles();
    $("tm-crumb-event").textContent = "New tournament";
    $("vol-save").textContent = "Create tournament";
    $("vol-cancel-edit").style.display = "none";
    message("");
    updateManagerSummary();
  }
  function populateForm(event, shouldScroll = true) {
    editingId = event.id;
    $("event-title").value = event.title || "";
    $("event-date").value = event.date || "";
    $("event-deadline").value = event.signupDeadline || "";
    $("event-location").value = event.location || "";
    $("event-address").value = event.address || "";
    $("event-start-time").value = event.startTime || "";
    $("event-end-time").value = event.endTime || "";
    $("event-meal").value = event.mealInfo || "";
    $("event-format").value = event.debateFormat || "";
    $("event-host").value = event.host || "";
    $("event-resolution").value = event.resolution || "";
    $("event-judge-instructions").value = event.judgeInstructions || "";
    $("event-expectations").value = event.expectations || "";
    $("event-invitation-url").value = event.invitationUrl || "";
    $("event-coach-name").value = event.coachName || "";
    $("event-coach-email").value = event.coachEmail || "";
    $("event-coach-phone").value = event.coachPhone || "";
    $("event-details").value = event.details || "";
    $("event-published").checked = !!event.published;
    const providedMeal = event.mealInfo || "";
    const mealPrefix = /^Lunch and refreshments provided\.?\s*(?:·\s*)?/i;
    $("event-lunch-provided").checked = mealPrefix.test(providedMeal);
    $("event-meal").value = providedMeal.replace(mealPrefix, "");
    setCapacityRoles(event.roles || []);
    $("tm-crumb-event").textContent = event.title || "Tournament Manager";
    $("vol-save").textContent = "Save changes";
    $("vol-cancel-edit").style.display = "block";
    message("");
    updateManagerSummary();
    if (shouldScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateManagerSummary() {
    const roles = rolesFromForm();
    const capacity = roles.reduce((total, role) => total + (Number(role.capacity) || 0), 0);
    const confirmed = roles.reduce((total, role) => total + (Number(role.signedUp) || 0), 0);
    const title = $("event-title")?.value.trim() || "New tournament";
    const date = $("event-date")?.value || "";
    const location = $("event-location")?.value.trim();
    const address = $("event-address")?.value.trim();
    const startTime = $("event-start-time")?.value || "";
    const endTime = $("event-end-time")?.value || "";
    const signupDeadline = $("event-deadline")?.value || "";
    const resolution = $("event-resolution")?.value.trim() || "";
    const published = Boolean($("event-published")?.checked);
    const rolesSummary = roles.length
      ? roles.map(role => `<b>${esc(role.label)}</b> · ${Math.max(0, Number(role.capacity) - Number(role.signedUp || 0))} open`).join("<br>")
      : "Add a judge role to preview openings.";
    $("tm-summary-title").textContent = title;
    $("tm-summary-date").textContent = date ? dateLabel(date) : "Choose a tournament date";
    $("tm-summary-time").textContent = startTime && endTime
      ? `${timeLabel(startTime)} to ${timeLabel(endTime)}`
      : "Schedule to be added";
    $("tm-summary-location").textContent = [location, address].filter(Boolean).join(" · ") || "Location to be added";
    $("tm-summary-deadline").textContent = signupDeadline ? dateLabel(signupDeadline) : "No deadline set";
    $("tm-summary-resolution").textContent = resolution || "Resolution to be added";
    $("tm-capacity").textContent = capacity;
    $("tm-confirmed").textContent = confirmed;
    $("tm-available").textContent = Math.max(0, capacity - confirmed);
    $("tm-fill-rate").textContent = `${capacity ? Math.round((confirmed / capacity) * 100) : 0}% Filled`;
    $("tm-status").textContent = published ? "Live" : "Draft";
    $("tm-status-note").textContent = published ? "Volunteer signup open" : "Not published";
    $("tm-preview-title").textContent = title;
    $("tm-preview-meta").textContent = [date ? dateLabel(date) : "Choose a tournament date", location || "Location to be added"].join(" · ");
    $("tm-preview-roles").innerHTML = rolesSummary;
    $("tm-side-status").textContent = published ? "Published" : "Draft";
    $("tm-side-status").style.color = published ? "var(--tm-green)" : "var(--tm-gold)";
  }
  function formEvent() {
    const roles = rolesFromForm();
    const title = $("event-title").value.trim();
    const date = $("event-date").value;
    const mealNotes = $("event-meal").value.trim();
    if (!title || !date || !roles.length) throw new Error("Add an event title, date, and at least one role with a capacity.");
    if (roles.some(role => role.capacity < role.signedUp)) {
      throw new Error("A role’s capacity cannot be lower than its current signup count.");
    }
    return {
      title, date, roles,
      signupDeadline: $("event-deadline").value || "",
      location: $("event-location").value.trim(),
      address: $("event-address").value.trim(),
      startTime: $("event-start-time").value || "",
      endTime: $("event-end-time").value || "",
      mealInfo: $("event-lunch-provided").checked
        ? `Lunch and refreshments provided${mealNotes ? ` · ${mealNotes}` : ""}`
        : mealNotes,
      debateFormat: $("event-format").value.trim(),
      host: $("event-host").value.trim(),
      resolution: $("event-resolution").value.trim(),
      judgeInstructions: $("event-judge-instructions").value.trim(),
      expectations: $("event-expectations").value.trim(),
      invitationUrl: $("event-invitation-url").value.trim(),
      coachName: $("event-coach-name").value.trim(),
      coachEmail: $("event-coach-email").value.trim(),
      coachPhone: $("event-coach-phone").value.trim(),
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
  async function emailDeliveriesForEvent(eventId) {
    const snap = await db.collection("volunteer_email_notifications").where("eventId", "==", eventId).get();
    const latestBySignup = new Map();
    snap.docs.forEach(doc => {
      const delivery = doc.data();
      const current = latestBySignup.get(delivery.signupId);
      const currentTime = current && current.updatedAt && current.updatedAt.toMillis ? current.updatedAt.toMillis() : 0;
      const deliveryTime = delivery.updatedAt && delivery.updatedAt.toMillis ? delivery.updatedAt.toMillis() : 0;
      if (!current || deliveryTime >= currentTime) latestBySignup.set(delivery.signupId, delivery);
    });
    return latestBySignup;
  }
  function deliveryLabel(delivery) {
    if (!delivery) return "Email pending";
    if (delivery.status === "sent") return "Email sent";
    if (delivery.status === "failed") return "Email retry needed";
    return "Email sending";
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
      const [signups, deliveries] = await Promise.all([
        signupsForEvent(eventId),
        emailDeliveriesForEvent(eventId),
      ]);
      const rows = [["Event", "Date", "Role", "Judging availability", "Volunteer", "Email", "Phone", "Debater", "Notes", "Email delivery", "Submitted"]];
      signups.forEach(signup => rows.push([
        event.title, event.date, signup.roleLabel, [signup.availabilityStart, signup.availabilityEnd].filter(Boolean).join(" – "), signup.parentName, signup.email,
        signup.phone, signup.studentName, signup.notes, deliveryLabel(deliveries.get(signup.id)),
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
  async function cancelEvent(eventId) {
    const event = events.find(item => item.id === eventId);
    if (!event) return;
    const warning = `Cancel “${event.title}”? This closes public signups and immediately emails every signed-up volunteer a cancellation notice.`;
    if (!confirm(warning)) return;
    try {
      await manage({ action: "cancelEvent", eventId });
    } catch (error) {
      alert(error.message || "Unable to cancel this tournament.");
    }
  }
  function eventPayload(item, roles = item.roles || []) {
    return {
      title: item.title || "",
      date: item.date || "",
      roles,
      signupDeadline: item.signupDeadline || "",
      location: item.location || "",
      address: item.address || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      mealInfo: item.mealInfo || "",
      debateFormat: item.debateFormat || "",
      host: item.host || "",
      resolution: item.resolution || "",
      judgeInstructions: item.judgeInstructions || "",
      expectations: item.expectations || "",
      invitationUrl: item.invitationUrl || "",
      coachName: item.coachName || "",
      coachEmail: item.coachEmail || "",
      coachPhone: item.coachPhone || "",
      details: item.details || "",
      published: item.published === true,
    };
  }
  function visibleRoles(roles = []) {
    return roles.filter(role => role.label !== "Duplicate-check test");
  }
  function roleDisplayLabel(role) {
    return role.label === "Single-slot test" ? "Debate Judge" : role.label;
  }
  function roleAvailabilityText(label) {
    return `${esc(label)}${label === "Single-slot timeslots" ? " are open" : " openings"}`;
  }
  async function renderEvents(items) {
    const root = $("vol-event-list");
    if (!items.length) {
      root.innerHTML = `<div class="tm-empty">No tournaments have been created yet. Add the tournament details below, set judge capacity, then publish when volunteers are ready to sign up.</div>`;
      return;
    }
    root.innerHTML = items.map(item => {
      const roles = visibleRoles(item.roles).map(role => {
        const label = roleDisplayLabel(role);
        const open = Math.max(0, Number(role.capacity || 0) - Number(role.signedUp || 0));
        return `<div class="tm-role-pill"><b>${open}/${Number(role.capacity || 0)}</b><span>${roleAvailabilityText(label)}</span></div>`;
      }).join("");
      return `<article class="tm-event" data-event="${esc(item.id)}">
        <div class="tm-event-main">
          <div class="tm-event-top"><div><h3>${esc(item.title)}</h3></div><span class="tm-status ${item.published ? "open" : "closed"}">${item.cancelled ? "Cancelled" : item.published ? "Published" : "Draft"}</span></div>
          <div class="tm-event-actions">
            <button class="tm-action" data-edit="${esc(item.id)}">Manage tournament</button>
            <button class="tm-action close" data-toggle="${esc(item.id)}">${item.published ? "Close signups" : "Publish signups"}</button>
            <button class="tm-action" data-export="${esc(item.id)}">Export CSV</button>
            ${item.cancelled ? "" : `<button class="tm-action close" data-cancel="${esc(item.id)}">Cancel tournament</button>`}
          </div>
        </div>
        <div class="tm-role-summary">${roles}</div>
        <div class="tm-signups"><h4>Private volunteer signups</h4><div class="signups-body"><p class="tm-no-signups">Loading signups…</p></div></div>
      </article>`;
    }).join("");
    root.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => populateForm(events.find(item => item.id === button.dataset.edit))));
    root.querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
      const event = events.find(item => item.id === button.dataset.toggle);
      setPublished(event.id, !event.published);
    }));
    root.querySelectorAll("[data-export]").forEach(button => button.addEventListener("click", () => exportEvent(button.dataset.export)));
    root.querySelectorAll("[data-cancel]").forEach(button => button.addEventListener("click", () => cancelEvent(button.dataset.cancel)));
    await Promise.all(items.map(async item => {
       const body = root.querySelector(`[data-event="${CSS.escape(item.id)}"] .signups-body`);
      if (!body) return;
      try {
        const [signups, deliveries] = await Promise.all([
          signupsForEvent(item.id),
          emailDeliveriesForEvent(item.id),
        ]);
        body.innerHTML = signups.length ? signups.map(signup => {
          const delivery = deliveries.get(signup.id);
          const deliveryStyle = delivery && delivery.status === "failed" ? "#b54708" : "#54606f";
          return `<div class="tm-signup-row"><div><div class="tm-signup-name">${esc(signup.parentName)} <span style="color:var(--tm-gold);font-weight:400;">· ${esc(signup.roleLabel)}</span></div><div class="tm-signup-details">${signup.availabilityStart && signup.availabilityEnd ? `Judging: ${esc(signup.availabilityStart)}–${esc(signup.availabilityEnd)}<br>` : ""}${esc(signup.email)} · ${esc(signup.phone)}${signup.studentName ? ` · Debater: ${esc(signup.studentName)}` : ""}${signup.notes ? `<br>${esc(signup.notes)}` : ""}<br><span style="color:${deliveryStyle};font-weight:600;">${esc(deliveryLabel(delivery))}</span></div></div><button class="tm-remove" data-remove="${esc(signup.id)}">Remove</button></div>`;
        }).join("") : `<p class="tm-no-signups">No volunteer signups yet.</p>`;
        body.querySelectorAll("[data-remove]").forEach(button => {
          const signup = signups.find(item => item.id === button.dataset.remove);
          button.addEventListener("click", () => removeSignup(signup));
        });
      } catch (_) {
         body.innerHTML = `<p class="tm-no-signups">Unable to load signups.</p>`;
      }
    }));
  }
  function startEvents() {
    db.collection("volunteer_events").orderBy("date", "asc").onSnapshot(snapshot => {
      events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderEvents(events);
      if (!editingId) {
        const currentOpenEvent = events.find(event => event.published) || events[0];
        if (currentOpenEvent) populateForm(currentOpenEvent, false);
      }
    }, error => {
       $("vol-event-list").innerHTML = `<div class="tm-empty">Volunteer events could not be loaded: ${esc(error.message)}</div>`;
    });
  }
  function showAccess(title, text, login) {
    $("vol-auth").innerHTML = `<div class="tm-auth-box"><div class="tm-auth-mark">◆</div><h1>${esc(title)}</h1><p>${esc(text)}</p>${login ? `<a class="tm-login" href="members.html">Sign in to Member Portal</a>` : ""}</div>`;
  }

  auth.onAuthStateChanged(async user => {
    if (!user) {
      showAccess("Coach or Website Admin access required", "Sign in through the Member Portal to manage tournament volunteer opportunities.", true);
      return;
    }
    const access = await getMemberAccess(db, user.email);
    if (!access.approved) {
      showAccess("Membership not approved", "This account is not approved for the Cooper Debate Member Portal.", false);
      return;
    }
    if (!isFullAdminRole(access.role)) {
      showAccess("Full admin access only", "Volunteer signups contain private contact details and can only be managed by a coach or website admin.", false);
      return;
    }
    currentUser = user;
    $("vol-auth").hidden = true;
    $("vol-dashboard").hidden = false;
    const shortName = (access.name || user.displayName || user.email.split("@")[0])
      .split(/[._-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    $("member-name").textContent = shortName;
    $("member-email").textContent = user.email;
    $("member-role-badge").textContent = access.role === "website-admin" ? "🛡️ Website Admin" : "🛡️ Coach";
    $("member-userbar").classList.add("visible");
    resetForm();
    startEvents();
  });

  document.addEventListener("DOMContentLoaded", () => {
    $("vol-event-form").addEventListener("submit", saveEvent);
    $("vol-cancel-edit").addEventListener("click", resetForm);
    $("vol-event-form").addEventListener("input", updateManagerSummary);
    $("vol-event-form").addEventListener("change", updateManagerSummary);
    const adjustCapacity = amount => {
      const input = $("event-judge-capacity");
      const minimum = Math.max(1, capacityRoles.reduce((total, role) => total + role.signedUp, 0));
      input.value = Math.max(minimum, Math.min(100, (Number(input.value) || minimum) + amount));
      updateManagerSummary();
    };
    $("judge-capacity-down").addEventListener("click", () => adjustCapacity(-1));
    $("judge-capacity-up").addEventListener("click", () => adjustCapacity(1));
    const schedulePresets = {
      "8:30 AM – 5:00 PM": ["08:30", "17:00"],
      "9:00 AM – 4:30 PM": ["09:00", "16:30"],
      "9:00 AM – 5:00 PM": ["09:00", "17:00"],
    };
    $("event-time-preset").addEventListener("change", () => {
      const preset = schedulePresets[$("event-time-preset").value];
      if (preset) {
        $("event-start-time").value = preset[0];
        $("event-end-time").value = preset[1];
        updateManagerSummary();
      }
    });
    document.querySelectorAll("[data-tm-tab]").forEach(button => button.addEventListener("click", () => {
      document.querySelectorAll("[data-tm-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
      $(button.dataset.tmTab)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  });
})();