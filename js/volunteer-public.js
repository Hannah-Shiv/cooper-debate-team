/* Cooper Debate Team — Public tournament volunteer signup */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/publicVolunteerSignup";
  let volunteerEvents = [];
  let selectedEvent = null;
  let selectedRole = null;
  let turnstileLoaded = false;
  let turnstileWidgetId = null;

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
        weekday: "short", month: "long", day: "numeric", year: "numeric",
      });
  };

  function renderEvents() {
    const root = document.getElementById("volunteer-events");
    if (!root) return;

    if (!volunteerEvents.length) {
      root.innerHTML = `
        <div class="vol-empty">
          <span aria-hidden="true">📬</span>
          <h3>No volunteer openings are posted yet</h3>
          <p>When a tournament needs judges or chaperones, the signup will appear here. Please check back soon.</p>
        </div>`;
      return;
    }

    root.innerHTML = volunteerEvents.map(event => {
      const roles = event.roles.map(role => {
        const remaining = Math.max(0, Number(role.capacity || 0) - Number(role.taken || 0));
        const full = remaining === 0;
        return `
          <div class="vol-role${full ? " is-full" : ""}">
            <div class="vol-role-copy">
              <h4>${escapeHtml(role.label)}</h4>
              ${role.description ? `<p>${escapeHtml(role.description)}</p>` : ""}
            </div>
            <div class="vol-role-action">
              <span class="vol-count">${full ? "Full" : `${remaining} ${remaining === 1 ? "spot" : "spots"} open`}</span>
              <button type="button" class="vol-signup-btn" ${full ? "disabled" : ""}
                data-event-id="${escapeHtml(event.id)}" data-role-id="${escapeHtml(role.id)}">
                ${full ? "Filled" : "Sign Up"}
              </button>
            </div>
          </div>`;
      }).join("");

      return `
        <article class="vol-event-card">
          <div class="vol-event-date">${escapeHtml(dateLabel(event.date))}</div>
          <h3>${escapeHtml(event.title)}</h3>
          ${event.location ? `<p class="vol-event-location">📍 ${escapeHtml(event.location)}</p>` : ""}
          ${event.details ? `<p class="vol-event-details">${escapeHtml(event.details)}</p>` : ""}
          ${event.signupDeadline ? `<p class="vol-deadline">Sign up by ${escapeHtml(dateLabel(event.signupDeadline))}</p>` : ""}
          <div class="vol-roles">${roles}</div>
        </article>`;
    }).join("");

    root.querySelectorAll(".vol-signup-btn:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => openSignup(
        button.dataset.eventId,
        button.dataset.roleId,
      ));
    });
  }

  async function loadVolunteerEvents() {
    const root = document.getElementById("volunteer-events");
    if (!root) return;
    root.innerHTML = `<div class="vol-loading" aria-live="polite">Loading volunteer opportunities…</div>`;

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
          <h3>Volunteer signups are temporarily unavailable</h3>
          <p>Please refresh in a moment, or contact <a href="mailto:CooperDebateTeam@gmail.com">CooperDebateTeam@gmail.com</a> for help.</p>
        </div>`;
    }
  }

  function openSignup(eventId, roleId) {
    selectedEvent = volunteerEvents.find(event => event.id === eventId) || null;
    selectedRole = selectedEvent && selectedEvent.roles.find(role => role.id === roleId);
    if (!selectedEvent || !selectedRole) return;

    const title = document.getElementById("vol-modal-title");
    const context = document.getElementById("vol-modal-context");
    const form = document.getElementById("volunteer-signup-form");
    if (!title || !context || !form) return;

    title.textContent = `Sign up to ${selectedRole.label}`;
    context.textContent = `${selectedEvent.title}${selectedEvent.date ? ` · ${dateLabel(selectedEvent.date)}` : ""}`;
    form.reset();
    setStatus("");
    renderTurnstile();
    if (!isTurnstileConfigured()) {
      setStatus("Volunteer verification is not configured yet. Please contact the coaching staff.", true);
      document.getElementById("vol-submit").disabled = true;
    } else if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      document.getElementById("vol-submit").disabled = false;
    }
    document.getElementById("volunteer-modal").style.display = "flex";
    document.body.classList.add("vol-modal-open");
    document.getElementById("vol-parent-name").focus();
  }

  function closeSignup() {
    const modal = document.getElementById("volunteer-modal");
    if (modal) modal.style.display = "none";
    document.body.classList.remove("vol-modal-open");
    selectedEvent = null;
    selectedRole = null;
  }

  function setStatus(message, isError) {
    const status = document.getElementById("vol-form-status");
    if (!status) return;
    status.textContent = message || "";
    status.className = `vol-form-status${message ? (isError ? " is-error" : " is-success") : ""}`;
  }

  function isTurnstileConfigured() {
    const key = window.COOPER_TURNSTILE_SITE_KEY;
    return typeof key === "string" && key.trim() && !key.includes("REPLACE");
  }

  function renderTurnstile() {
    const root = document.getElementById("vol-turnstile");
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

  async function submitSignup(event) {
    event.preventDefault();
    if (!selectedEvent || !selectedRole) return;

    const form = event.currentTarget;
    const button = document.getElementById("vol-submit");
    const turnstileToken = window.turnstile && turnstileWidgetId !== null
      ? window.turnstile.getResponse(turnstileWidgetId)
      : "";
    const payload = {
      eventId: selectedEvent.id,
      roleId: selectedRole.id,
      parentName: document.getElementById("vol-parent-name").value,
      email: document.getElementById("vol-email").value,
      phone: document.getElementById("vol-phone").value,
      studentName: document.getElementById("vol-student-name").value,
      notes: document.getElementById("vol-notes").value,
      company: document.getElementById("vol-company").value,
      turnstileToken,
    };

    if (!form.reportValidity()) return;
    if (!turnstileToken) {
      setStatus("Please complete the volunteer verification before signing up.", true);
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
      button.textContent = "Confirm Signup";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadVolunteerEvents();

    document.getElementById("volunteer-signup-form")?.addEventListener("submit", submitSignup);
    document.querySelectorAll("[data-close-volunteer-modal]").forEach(element => {
      element.addEventListener("click", closeSignup);
    });
    document.getElementById("volunteer-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-modal") closeSignup();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeSignup();
    });
    renderTurnstile();
  });
})();