/* Cooper Debate Team — public judge volunteer signup */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/publicVolunteerSignup";
  let volunteerEvents = [];
  let selectedEvent = null;
  let selectedRole = null;
  let wizardStep = 1;
  let turnstileLoaded = false;
  let turnstileWidgetId = null;

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const dateLabel = value => {
    if (!value) return "";
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
  };

  const timeLabel = value => {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return "";
    const [rawHour, minutes] = value.split(":").map(Number);
    const suffix = rawHour >= 12 ? "PM" : "AM";
    const hour = rawHour % 12 || 12;
    return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
  };

  const timeRange = (start, end) => {
    const startLabel = timeLabel(start);
    const endLabel = timeLabel(end);
    return startLabel && endLabel ? `${startLabel} – ${endLabel}` : "";
  };

  const lineItems = value => String(value || "")
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const safeExternalUrl = value => {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  };

  function eventFacts(event) {
    const facts = [
      event.date && { label: "Date", value: dateLabel(event.date) },
      timeRange(event.startTime, event.endTime) && { label: "Tournament hours", value: timeRange(event.startTime, event.endTime) },
      event.mealInfo && { label: "Meals", value: event.mealInfo },
      event.location && { label: "Venue", value: event.location },
      event.address && { label: "Address", value: event.address },
      event.debateFormat && { label: "Debate", value: event.debateFormat },
      event.host && { label: "Hosted by", value: event.host },
    ].filter(Boolean);
    return facts.map(fact => `<div class="vol-event-fact"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div>`).join("");
  }

  function renderEvents() {
    const root = $("volunteer-events");
    if (!root) return;

    if (!volunteerEvents.length) {
      root.innerHTML = `
        <div class="vol-empty">
          <span aria-hidden="true">📬</span>
          <h3>No judge openings are posted yet</h3>
          <p>When a tournament needs parent judges, the signup will appear here. Please check back soon.</p>
        </div>`;
      return;
    }

    root.innerHTML = volunteerEvents.map(event => {
      const roles = event.roles.map(role => {
        const capacity = Number(role.capacity || 0);
        const filled = Math.min(capacity, Number(role.taken || 0));
        const remaining = Math.max(0, capacity - filled);
        const full = remaining === 0;
        const signups = Array.isArray(event.signups)
          ? event.signups.filter(signup => signup.roleId === role.id)
          : [];
        const signupNames = signups.map(signup => `
          <span class="vol-taken-person">
            ${escapeHtml(signup.parentName)}${signup.studentName ? ` <small>· ${escapeHtml(signup.studentName)}</small>` : ""}
          </span>`).join("");
        return `
          <div class="vol-role${full ? " is-full" : ""}">
            <div class="vol-role-copy">
              <h4>${escapeHtml(role.label)}</h4>
              ${role.description ? `<p>${escapeHtml(role.description)}</p>` : ""}
              <div class="vol-taken">${signupNames ? `<span class="vol-taken-label">Judge volunteers:</span>${signupNames}` : "No judge volunteers yet"}</div>
            </div>
            <div class="vol-role-action">
              <span class="vol-count">${filled} / ${capacity} filled · ${remaining} open</span>
              <span class="vol-progress" aria-label="${filled} of ${capacity} openings filled"><span style="width:${capacity ? (filled / capacity) * 100 : 0}%"></span></span>
              <button type="button" class="vol-signup-btn" ${full ? "disabled" : ""}
                data-event-id="${escapeHtml(event.id)}" data-role-id="${escapeHtml(role.id)}">
                ${full ? "Filled" : "Choose time"}
              </button>
            </div>
          </div>`;
      }).join("");

      return `
        <article class="vol-event-card">
          <div class="vol-event-date">Judge volunteer opportunity</div>
          <h3>${escapeHtml(event.title)}</h3>
          <div class="vol-event-facts">${eventFacts(event)}</div>
          ${event.resolution ? `<div class="vol-resolution"><span>Resolution / topic</span><p>${escapeHtml(event.resolution)}</p></div>` : ""}
          ${event.judgeInstructions ? `<div class="vol-event-note"><strong>For judges</strong>${escapeHtml(event.judgeInstructions)}</div>` : ""}
          ${event.details ? `<p class="vol-event-details">${escapeHtml(event.details)}</p>` : ""}
          ${event.signupDeadline ? `<p class="vol-deadline">Sign up by ${escapeHtml(dateLabel(event.signupDeadline))}</p>` : ""}
          <div class="vol-roles">${roles}</div>
        </article>`;
    }).join("");

    root.querySelectorAll(".vol-signup-btn:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => openSignup(button.dataset.eventId, button.dataset.roleId));
    });
  }

  async function loadVolunteerEvents() {
    const root = $("volunteer-events");
    if (!root) return;
    root.innerHTML = `<div class="vol-loading" aria-live="polite">Loading judge volunteer opportunities…</div>`;
    try {
      const response = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Unable to load volunteer events.");
      const payload = await response.json();
      volunteerEvents = Array.isArray(payload.events) ? payload.events : [];
      renderEvents();
    } catch (error) {
      console.warn("Volunteer opportunities could not load:", error);
      root.innerHTML = `
        <div class="vol-empty">
          <span aria-hidden="true">⚠</span>
          <h3>Judge signups are temporarily unavailable</h3>
          <p>Please refresh in a moment, or contact <a href="mailto:CooperDebateTeam@gmail.com">CooperDebateTeam@gmail.com</a> for help.</p>
        </div>`;
    }
  }

  function setStatus(message, isError) {
    const status = $("vol-form-status");
    if (!status) return;
    status.textContent = message || "";
    status.className = `vol-form-status${message ? (isError ? " is-error" : " is-success") : ""}`;
  }

  function isTurnstileConfigured() {
    const key = window.COOPER_TURNSTILE_SITE_KEY;
    return typeof key === "string" && key.trim() && !key.includes("REPLACE");
  }

  function renderTurnstile() {
    const root = $("vol-turnstile");
    if (!root || !turnstileLoaded || !window.turnstile || turnstileWidgetId !== null || !isTurnstileConfigured()) return;
    turnstileWidgetId = window.turnstile.render(root, {
      sitekey: window.COOPER_TURNSTILE_SITE_KEY.trim(),
      theme: "dark",
      callback: () => setStatus(""),
      "error-callback": () => setStatus("Volunteer verification could not load. Please try again.", true),
      "expired-callback": () => setStatus("Verification expired. Please complete it again.", true),
    });
  }

  window.onTurnstileLoad = () => {
    turnstileLoaded = true;
    renderTurnstile();
  };

  function renderTournamentBrief() {
    const root = $("vol-tournament-brief");
    if (!root || !selectedEvent) return;
    const invitationUrl = safeExternalUrl(selectedEvent.invitationUrl);
    root.innerHTML = `
      <div class="vol-brief-heading">
        <div>
          <span>Tournament details</span>
          <h3>${escapeHtml(selectedEvent.title)}</h3>
        </div>
        <span class="vol-brief-role">${escapeHtml(selectedRole.label)}</span>
      </div>
      <div class="vol-brief-grid">
        <div class="vol-brief-facts">${eventFacts(selectedEvent)}</div>
        <div class="vol-brief-debate">
          ${selectedEvent.debateFormat ? `<div class="vol-brief-format"><span>Debate format</span><strong>${escapeHtml(selectedEvent.debateFormat)}</strong></div>` : ""}
          ${selectedEvent.resolution ? `<div class="vol-brief-resolution"><span>Resolution / topic</span><p>${escapeHtml(selectedEvent.resolution)}</p></div>` : ""}
          ${selectedEvent.judgeInstructions ? `<div class="vol-brief-callout"><strong>Important information</strong>${escapeHtml(selectedEvent.judgeInstructions)}</div>` : ""}
          ${invitationUrl ? `<a class="vol-invitation-link" href="${escapeHtml(invitationUrl)}" target="_blank" rel="noopener">View full invitation ↗</a>` : ""}
        </div>
      </div>`;
    renderSignupSidebar();
  }

  function renderSignupSidebar() {
    const root = $("vol-signup-sidebar");
    if (!root || !selectedEvent || !selectedRole) return;
    const chosenTime = timeRange($("vol-availability-start")?.value, $("vol-availability-end")?.value);
    const expectations = lineItems(selectedEvent.expectations);
    const contact = [
      selectedEvent.coachName,
      selectedEvent.coachEmail,
      selectedEvent.coachPhone,
    ].filter(Boolean);
    root.innerHTML = `
      <section class="vol-side-card vol-selection-card">
        <h4>Your selection</h4>
        <div class="vol-side-row"><span>Event</span><strong>${escapeHtml(selectedEvent.title)}</strong></div>
        <div class="vol-side-row"><span>Role</span><strong>${escapeHtml(selectedRole.label)}</strong></div>
        <div class="vol-side-row"><span>Selected availability</span><strong>${escapeHtml(chosenTime || "Choose your start and end time")}</strong></div>
        <div class="vol-side-reassurance">✓ We’ll do our best to assign rounds within your availability.</div>
      </section>
      ${expectations.length ? `
        <section class="vol-side-card">
          <h4>What to expect</h4>
          <ul class="vol-expectations">${expectations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>` : ""}
      ${contact.length ? `
        <section class="vol-side-card">
          <h4>Questions?</h4>
          ${selectedEvent.coachName ? `<p class="vol-contact-name">${escapeHtml(selectedEvent.coachName)}</p>` : ""}
          ${selectedEvent.coachEmail ? `<p><a href="mailto:${encodeURIComponent(selectedEvent.coachEmail)}">${escapeHtml(selectedEvent.coachEmail)}</a></p>` : ""}
          ${selectedEvent.coachPhone ? `<p>${escapeHtml(selectedEvent.coachPhone)}</p>` : ""}
        </section>` : ""}`;
  }

  function renderReview() {
    const root = $("vol-review");
    if (!root || !selectedEvent || !selectedRole) return;
    const firstName = $("vol-parent-first-name").value.trim();
    const lastName = $("vol-parent-last-name").value.trim();
    root.innerHTML = `
      <div class="vol-review-card">
        <span>Tournament</span><strong>${escapeHtml(selectedEvent.title)}</strong>
        <span>Role</span><strong>${escapeHtml(selectedRole.label)}</strong>
        <span>Judging availability</span><strong>${escapeHtml(timeRange($("vol-availability-start").value, $("vol-availability-end").value))}</strong>
        <span>Volunteer</span><strong>${escapeHtml(`${firstName} ${lastName}`.trim())}</strong>
        <span>Contact</span><strong>${escapeHtml($("vol-email").value.trim())} · ${escapeHtml($("vol-phone").value.trim())}</strong>
      </div>`;
  }

  function showStep(step) {
    wizardStep = Math.max(1, Math.min(3, step));
    document.querySelectorAll("[data-vol-step]").forEach(panel => {
      panel.hidden = Number(panel.dataset.volStep) !== wizardStep;
    });
    document.querySelectorAll("[data-vol-progress]").forEach(item => {
      const active = Number(item.dataset.volProgress) <= wizardStep;
      item.classList.toggle("is-active", active);
      item.classList.toggle("is-current", Number(item.dataset.volProgress) === wizardStep);
    });
    if (wizardStep === 3) {
      renderReview();
      renderTurnstile();
    }
    setStatus("");
  }

  function validateStep(step) {
    const panel = document.querySelector(`[data-vol-step="${step}"]`);
    const fields = panel ? [...panel.querySelectorAll("input[required], textarea[required]")] : [];
    return fields.every(field => {
      if (field.checkValidity()) return true;
      field.reportValidity();
      return false;
    });
  }

  function openSignup(eventId, roleId) {
    selectedEvent = volunteerEvents.find(event => event.id === eventId) || null;
    selectedRole = selectedEvent && selectedEvent.roles.find(role => role.id === roleId);
    const form = $("volunteer-signup-form");
    if (!selectedEvent || !selectedRole || !form) return;

    $("vol-modal-title").textContent = "Judge Volunteer Signup";
    $("vol-modal-context").textContent = "Choose the hours you are available to judge, then review your signup.";
    form.reset();
    $("vol-availability-start").min = selectedEvent.startTime || "";
    $("vol-availability-start").max = selectedEvent.endTime || "";
    $("vol-availability-end").min = selectedEvent.startTime || "";
    $("vol-availability-end").max = selectedEvent.endTime || "";
    $("vol-availability-start").value = selectedEvent.startTime || "";
    $("vol-availability-end").value = selectedEvent.endTime || "";
    renderTournamentBrief();
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    $("volunteer-modal").style.display = "flex";
    document.body.classList.add("vol-modal-open");
    showStep(1);
    $("vol-availability-start").focus();
  }

  function closeSignup() {
    const modal = $("volunteer-modal");
    if (modal) modal.style.display = "none";
    document.body.classList.remove("vol-modal-open");
    selectedEvent = null;
    selectedRole = null;
    wizardStep = 1;
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (!selectedEvent || !selectedRole) return;
    if (wizardStep < 3) {
      if (validateStep(wizardStep)) showStep(wizardStep + 1);
      return;
    }

    const button = $("vol-submit");
    const turnstileToken = window.turnstile && turnstileWidgetId !== null
      ? window.turnstile.getResponse(turnstileWidgetId)
      : "";
    const payload = {
      eventId: selectedEvent.id,
      roleId: selectedRole.id,
      parentFirstName: $("vol-parent-first-name").value,
      parentLastName: $("vol-parent-last-name").value,
      email: $("vol-email").value,
      phone: $("vol-phone").value,
      studentName: $("vol-student-name").value,
      notes: $("vol-notes").value,
      availabilityStart: $("vol-availability-start").value,
      availabilityEnd: $("vol-availability-end").value,
      company: $("vol-company").value,
      turnstileToken,
    };

    if (!validateStep(1) || !validateStep(2)) return;
    if (!turnstileToken) {
      setStatus("Please complete the volunteer verification before confirming.", true);
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    setStatus("");

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save your signup.");
      setStatus(result.message || "You’re signed up. Thank you!", false);
      await loadVolunteerEvents();
      setTimeout(closeSignup, 1800);
    } catch (error) {
      setStatus(error.message || "Unable to save your signup. Please try again.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Confirm judge signup";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadVolunteerEvents();
    $("volunteer-signup-form")?.addEventListener("submit", submitSignup);
    document.querySelectorAll("[data-close-volunteer-modal]").forEach(element => {
      element.addEventListener("click", closeSignup);
    });
    document.querySelectorAll("[data-vol-next]").forEach(button => {
      button.addEventListener("click", () => {
        if (validateStep(wizardStep)) showStep(Number(button.dataset.volNext));
      });
    });
    document.querySelectorAll("[data-vol-back]").forEach(button => {
      button.addEventListener("click", () => showStep(Number(button.dataset.volBack)));
    });
    ["vol-availability-start", "vol-availability-end"].forEach(id => {
      $(id)?.addEventListener("input", renderSignupSidebar);
      $(id)?.addEventListener("change", renderSignupSidebar);
    });
    $("volunteer-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-modal") closeSignup();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeSignup();
    });
    renderTurnstile();
  });
}());