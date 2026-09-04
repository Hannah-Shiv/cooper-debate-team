/* Cooper Debate Team — public judge volunteer signup */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/publicVolunteerSignup";
  const FULL_TOURNAMENT_HOUR_OVERRIDES = Object.freeze({
    "volunteer-signup-acceptance-test": Object.freeze({ start: "08:00", end: "17:30" }),
  });
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

  const fullTournamentWindow = event => {
    const override = FULL_TOURNAMENT_HOUR_OVERRIDES[event?.id];
    return {
      start: event?.fullAvailabilityStartTime || override?.start || event?.startTime || "",
      end: event?.fullAvailabilityEndTime || override?.end || event?.endTime || "",
    };
  };

  const coverageForSignup = (signup, event) => {
    const fullWindow = fullTournamentWindow(event);
    const isFullTournament = signup.availabilityStart === fullWindow.start &&
      signup.availabilityEnd === fullWindow.end;
    if (isFullTournament) return { label: "Full tournament", className: "is-full" };
    if (signup.availabilityStart === event.startTime) return { label: "Morning", className: "is-morning" };
    if (signup.availabilityEnd === event.endTime) return { label: "Afternoon", className: "is-afternoon" };
    return { label: "Custom window", className: "is-custom" };
  };

  const lineItems = value => String(value || "")
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const bulletItems = value => lineItems(value)
    .flatMap(item => item.split(/(?<=[.!?])\s+/))
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  const roleDisplayLabel = role => {
    const label = String(role?.label || "").trim();
    return !label || /^single-slot test$/i.test(label) ? "Debate Judge" : label;
  };

  const modalIcon = name => `<svg class="vol-modal-icon vol-icon-${name}" aria-hidden="true" focusable="false"><use href="#vol-icon-${name}"></use></svg>`;

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
      event.date && { icon: "calendar", label: "Date", value: dateLabel(event.date) },
      timeRange(event.startTime, event.endTime) && { icon: "clock", label: "Tournament hours", value: timeRange(event.startTime, event.endTime) },
      event.debateFormat && { icon: "debate", label: "Debate format", value: event.debateFormat },
      event.mealInfo && { icon: "utensils", label: "Meals", value: event.mealInfo },
      (event.location || event.address) && { icon: "pin", label: "Location", value: [event.location, event.address].filter(Boolean).join(" · ") },
      event.host && { icon: "users", label: "Hosted by", value: event.host },
    ].filter(Boolean);
    return facts.map(fact => `<div class="vol-event-fact">${modalIcon(fact.icon)}<div><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div></div>`).join("");
  }

  function eventSignupStats(event) {
    const roles = Array.isArray(event.roles)
      ? event.roles.filter(role => role.label !== "Duplicate-check test")
      : [];
    const capacity = roles.reduce((total, role) => total + Math.max(0, Number(role.capacity) || 0), 0);
    const confirmed = roles.reduce((total, role) => {
      const roleCapacity = Math.max(0, Number(role.capacity) || 0);
      return total + Math.min(roleCapacity, Math.max(0, Number(role.taken) || 0));
    }, 0);
    return {
      capacity,
      confirmed,
      available: Math.max(0, capacity - confirmed),
      fillRate: capacity ? Math.round((confirmed / capacity) * 100) : 0,
    };
  }

  const timeToMinutes = value => {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = value => {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const durationLabel = minutes => {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hrs`;
  };

  function availabilityChoices(event) {
    const start = timeToMinutes(event.startTime);
    const end = timeToMinutes(event.endTime);
    if (start === null || end === null || end <= start) {
      return [{ id: "custom", label: "Other (custom time range)", detail: "Select your own start and end time", icon: "▣", start: "", end: "", duration: "" }];
    }
    const total = end - start;
    const requestedFullWindow = fullTournamentWindow(event);
    const requestedFullStart = timeToMinutes(requestedFullWindow.start);
    const requestedFullEnd = timeToMinutes(requestedFullWindow.end);
    const hasValidFullWindow = requestedFullStart !== null &&
      requestedFullEnd !== null &&
      requestedFullEnd > requestedFullStart;
    const fullStart = hasValidFullWindow ? requestedFullWindow.start : event.startTime;
    const fullEnd = hasValidFullWindow ? requestedFullWindow.end : event.endTime;
    const fullDuration = hasValidFullWindow ? requestedFullEnd - requestedFullStart : total;
    const morningLength = Math.min(240, Math.max(60, Math.floor((total / 2) / 30) * 30));
    const split = start + morningLength;
    return [
      { id: "morning", label: timeRange(minutesToTime(start), minutesToTime(split)), detail: "Morning availability", icon: "☀", start: minutesToTime(start), end: minutesToTime(split), duration: durationLabel(morningLength) },
      { id: "afternoon", label: timeRange(minutesToTime(split), minutesToTime(end)), detail: "Afternoon availability", icon: "☀", start: minutesToTime(split), end: minutesToTime(end), duration: durationLabel(end - split) },
      { id: "full", label: timeRange(fullStart, fullEnd), detail: "Full tournament", icon: "☀", start: fullStart, end: fullEnd, duration: durationLabel(fullDuration) },
      { id: "custom", label: "Other (custom time range)", detail: "Select your own start and end time", icon: "▣", start: event.startTime, end: event.endTime, duration: "" },
    ];
  }

  function renderVolunteerSummary() {
    const root = $("vol-public-summary");
    if (!root) return;
    root.hidden = true;
    root.innerHTML = "";
  }

  function renderEvents() {
    const root = $("volunteer-events");
    if (!root) return;
    renderVolunteerSummary();

    if (!volunteerEvents.length) {
      root.innerHTML = `
        <div class="vol-empty">
          <span aria-hidden="true">📬</span>
          <h3>No judge openings are posted yet</h3>
          <p>When a tournament needs volunteer judges, the signup will appear here. Please check back soon.</p>
        </div>`;
      return;
    }

    root.innerHTML = volunteerEvents.map(event => {
      const stats = eventSignupStats(event);
      const invitationUrl = safeExternalUrl(event.invitationUrl);
      const expectations = lineItems(event.expectations);
      const formatMark = (event.debateFormat || "Judge").split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
      const publicExpectations = expectations.length
        ? expectations
        : ["Arrive 15–20 minutes early", "We’ll assign rounds within your availability", "Bring a device for electronic ballots when required"];
      const judgeNotes = bulletItems(event.judgeInstructions);
      const assignmentNotes = [
        "You may be assigned to one or more rounds within your availability.",
        "Please arrive 20 minutes early; walking from the parking lot takes about 5 minutes.",
      ];
      const availableRole = event.roles
        .filter(role => role.label !== "Duplicate-check test")
        .find(role => Math.max(0, Number(role.capacity || 0) - Number(role.taken || 0)) > 0);
      const choices = availabilityChoices(event);
      const publicSignups = Array.isArray(event.signups)
        ? event.signups.filter(signup => signup.parentName && signup.roleId)
        : [];
      const rosterMarkup = publicSignups.length
        ? publicSignups.map(signup => {
          const availability = timeRange(signup.availabilityStart, signup.availabilityEnd) || "Availability shared with coaches";
          const coverage = coverageForSignup(signup, event);
          return `
            <div class="vol-roster-row" role="row">
              <div class="vol-roster-volunteer" role="cell" data-label="Volunteer">
                <strong>${escapeHtml(signup.parentName)}</strong>
              </div>
              <div class="vol-roster-availability" role="cell" data-label="Availability">
                ${modalIcon("clock")}<span>${escapeHtml(availability)}</span>
              </div>
              <div class="vol-roster-coverage" role="cell" data-label="Coverage">
                <span class="vol-coverage-tag ${coverage.className}">${escapeHtml(coverage.label)}</span>
                <small>${escapeHtml(roleDisplayLabel({ label: signup.roleLabel }))}</small>
              </div>
              <div class="vol-roster-debater" role="cell" data-label="Debater">
                ${modalIcon("debate")}<span>${escapeHtml(signup.studentName || "Not listed")}</span>
              </div>
            </div>`;
        }).join("")
        : `<div class="vol-roster-empty" role="row">Be the first person to volunteer for this tournament.</div>`;
      const availabilityMarkup = choices.map((choice, index) => `
        <label class="vol-availability-option${index === 0 ? " is-selected" : ""}">
          <input type="radio" name="availability-${escapeHtml(event.id)}" value="${escapeHtml(choice.id)}" data-start="${escapeHtml(choice.start)}" data-end="${escapeHtml(choice.end)}" ${index === 0 ? "checked" : ""}>
          <span class="vol-availability-radio" aria-hidden="true"></span>
          <span class="vol-availability-icon" aria-hidden="true">${choice.icon}</span>
          <span class="vol-availability-copy"><strong>${escapeHtml(choice.label)}</strong><small>${escapeHtml(choice.detail)}</small></span>
           <span class="vol-selection-check" aria-hidden="true">✓</span>
          ${choice.duration ? `<span class="vol-availability-duration">${escapeHtml(choice.duration)}</span>` : ""}
        </label>`).join("");

      return `
        <article class="vol-event-card vol-unified-card">
          <section class="vol-opportunity-panel" aria-label="Judge volunteer opportunity">
            <div class="vol-panel-purpose vol-panel-purpose--entry">
              <div><span>Entry panel</span><strong>Enter Your Availability</strong></div>
              <div class="vol-panel-purpose-icon" aria-hidden="true">✎</div>
            </div>
            <header class="vol-unified-header">
              <div class="vol-format-mark" aria-hidden="true">${escapeHtml(formatMark)}</div>
              <div class="vol-unified-title">
                <span>Judge volunteer opportunity</span>
                <h3>${escapeHtml(event.title)}</h3>
                ${event.debateFormat ? `<p>${escapeHtml(event.debateFormat)}</p>` : ""}
              </div>
              <div class="vol-open-status">✓ Signup open</div>
            </header>
            <div class="vol-unified-facts">
              <div><span class="vol-unified-icon">▣</span><p><small>Date</small><strong>${escapeHtml(event.date ? dateLabel(event.date) : "To be announced")}</strong></p></div>
              <div><span class="vol-unified-icon">◷</span><p><small>Time</small><strong>${escapeHtml(timeRange(event.startTime, event.endTime) || "To be announced")}</strong></p></div>
              <div><span class="vol-unified-icon">⌖</span><p><small>Location</small><strong>${escapeHtml(event.location || "Location to be announced")}</strong>${event.address ? `<em>${escapeHtml(event.address)}</em>` : ""}</p></div>
              <div><span class="vol-unified-icon">♙</span><p><small>Hosted by</small><strong>${escapeHtml(event.host || "Cooper Debate Team")}</strong></p></div>
            </div>
            <div class="vol-unified-brief${invitationUrl ? "" : " no-invitation"}">
              ${event.resolution ? `<div><span>Resolution / topic</span><p>${escapeHtml(event.resolution)}</p></div>` : ""}
              <div><span>Meals / refreshments</span><p>${escapeHtml(event.mealInfo || "Meal details will be shared before tournament day.")}</p></div>
              ${invitationUrl ? `<a href="${escapeHtml(invitationUrl)}" target="_blank" rel="noopener">View full invitation ↗</a>` : ""}
            </div>
            <div class="vol-unified-metrics" aria-label="Volunteer signup progress">
              <div><span>Judge capacity</span><strong>${stats.capacity}</strong><small>Total openings</small></div>
              <div class="confirmed"><span>Confirmed</span><strong>${stats.confirmed}</strong><small>Volunteer signups</small></div>
              <div class="fill-rate"><span>% filled</span><strong>${stats.fillRate}%</strong><small>Volunteer coverage</small></div>
              <div class="available"><span>Open spots</span><strong>${stats.available}</strong><small>Still available</small></div>
              <div class="deadline"><span>Signup deadline</span><strong>${escapeHtml(event.signupDeadline ? dateLabel(event.signupDeadline) : "Open")}</strong><small>Sign up as soon as possible</small></div>
            </div>
            <div class="vol-unified-signup">
              <div class="vol-role-area">
                <div class="vol-role-heading"><span>▣</span><div><h4>When can you volunteer as a judge?</h4><p>Select the time range you are available.</p></div></div>
                <div class="vol-availability-options">${availabilityMarkup}</div>
                <button type="button" class="vol-inline-continue" ${availableRole ? "" : "disabled"} data-event-id="${escapeHtml(event.id)}" data-role-id="${escapeHtml(availableRole?.id || "")}">
                  ${availableRole ? "Continue to Your Sign-Up →" : "All judge spots are filled"}
                </button>
              </div>
              <aside class="vol-public-sidebar">
                <section><h4>What to expect</h4><ul>${publicExpectations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
                ${judgeNotes.length ? `<section><h4>For judges</h4><ul>${judgeNotes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
                <section class="vol-public-secure"><h4>Private &amp; secure</h4><ul><li>Your contact details and notes are visible only to the coaching staff.</li></ul></section>
                <section class="vol-public-assignment"><h4>Judge assignment</h4><ul>${assignmentNotes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
              </aside>
            </div>
          </section>
          <section class="vol-public-roster" aria-label="Volunteers signed up to judge">
            <div class="vol-panel-purpose vol-panel-purpose--results">
              <div><span>Results panel</span><strong>Volunteer Sign-Up Results</strong></div>
              <div class="vol-panel-purpose-icon" aria-hidden="true">✓</div>
            </div>
            <div class="vol-roster-summary">
              <div class="vol-public-roster-heading">
                ${modalIcon("users")}
                <div><h4>Volunteers already signed up</h4><p>People who have volunteered to judge this tournament.</p></div>
              </div>
              <div class="vol-roster-progress-wrap" aria-label="${stats.fillRate}% of judge spots filled">
                <div class="vol-roster-progress-copy"><strong>${stats.fillRate}%</strong><div><span>${stats.confirmed} of ${stats.capacity} judge spots filled</span><small>${stats.available} ${stats.available === 1 ? "spot" : "spots"} remaining</small></div></div>
                <div class="vol-roster-progress"><span style="width:${Math.max(0, Math.min(100, stats.fillRate))}%"></span></div>
                <div class="vol-roster-progress-scale"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
              </div>
            </div>
            <div class="vol-roster-table" role="table" aria-label="Volunteer coverage roster">
              <div class="vol-roster-table-head" role="row">
                <span role="columnheader">Volunteer</span><span role="columnheader">Availability</span><span role="columnheader">Coverage</span><span role="columnheader">Debater</span>
              </div>
              <div class="vol-roster-table-body">${rosterMarkup}</div>
            </div>
            <p class="vol-public-roster-note">Volunteer names, debaters, roles, and selected availability are visible to the tournament community. Contact details and notes remain private.</p>
          </section>
        </article>`;
    }).join("");

    root.querySelectorAll(".vol-availability-option input").forEach(input => {
      input.addEventListener("change", () => {
        const options = input.closest(".vol-availability-options");
        options.querySelectorAll(".vol-availability-option").forEach(option => {
          option.classList.toggle("is-selected", option.contains(input));
          option.classList.remove("is-flipping");
        });
        const selectedOption = input.closest(".vol-availability-option");
        void selectedOption.offsetWidth;
        selectedOption.classList.add("is-flipping");
        selectedOption.addEventListener("animationend", () => {
          selectedOption.classList.remove("is-flipping");
        }, { once:true });
      });
    });
    root.querySelectorAll(".vol-inline-continue:not(:disabled)").forEach(button => {
      button.addEventListener("click", () => {
        const card = button.closest(".vol-unified-card");
        const selected = card?.querySelector(".vol-availability-option input:checked");
        openSignup(button.dataset.eventId, button.dataset.roleId, {
          start: selected?.dataset.start || "",
          end: selected?.dataset.end || "",
        });
      });
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
          <p>Please refresh in a moment, or contact <a href="mailto:pgkonde@fcps.edu">Coach Pamela Konde</a> for help.</p>
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
        <div class="vol-brief-title">
          ${modalIcon("trophy")}
          <div><span>Tournament details</span><h3>${escapeHtml(selectedEvent.title)}</h3></div>
        </div>
        <span class="vol-brief-role">${escapeHtml(roleDisplayLabel(selectedRole))}</span>
      </div>
      <div class="vol-brief-grid">
        <div class="vol-brief-facts">${eventFacts(selectedEvent)}</div>
        <div class="vol-brief-debate">
          ${selectedEvent.resolution ? `<div class="vol-brief-resolution">${modalIcon("document")}<div><span>Resolution / topic</span><p>${escapeHtml(selectedEvent.resolution)}</p></div></div>` : ""}
          ${selectedEvent.judgeInstructions ? `<div class="vol-brief-callout">${modalIcon("info")}<div><strong>Important information</strong><p>${escapeHtml(selectedEvent.judgeInstructions)}</p></div></div>` : ""}
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
    const expectationItems = expectations.length
      ? expectations.map(label => ({ icon: "star", label }))
      : [
        { icon: "users", label: "Judge at least 3 preliminary rounds" },
        { icon: "document", label: "Round times will be shared the week of the tournament" },
        { icon: "gift", label: "Light refreshments provided" },
      ];
    const contact = [
      selectedEvent.coachName,
      selectedEvent.coachEmail,
      selectedEvent.coachPhone,
    ].filter(Boolean);
    root.innerHTML = `
      <section class="vol-side-card vol-selection-card">
        <h4>${modalIcon("clipboard")}<span>Your selection</span></h4>
        <div class="vol-side-row"><span>Event</span><strong>${escapeHtml(selectedEvent.title)}</strong></div>
        <div class="vol-side-row"><span>Role</span><strong>${escapeHtml(roleDisplayLabel(selectedRole))}</strong></div>
        <div class="vol-side-row"><span>Selected availability</span><strong>${escapeHtml(chosenTime || "Choose your start and end time")}</strong></div>
        <div class="vol-side-reassurance">${modalIcon("check")}<span>We’ll do our best to assign rounds within your availability.</span></div>
      </section>
      <section class="vol-side-card">
        <h4>${modalIcon("star")}<span>What to expect</span></h4>
        <ul class="vol-expectations">${expectationItems.map(item => `<li>${modalIcon(item.icon)}<span>${escapeHtml(item.label)}</span></li>`).join("")}</ul>
      </section>
      ${contact.length ? `
        <section class="vol-side-card">
          <h4>${modalIcon("question")}<span>Questions?</span></h4>
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
    const parentName = `${firstName} ${lastName}`.trim();
    const studentName = $("vol-student-name").value.trim();
    const availability = timeRange($("vol-availability-start").value, $("vol-availability-end").value);
    root.innerHTML = `
      <div class="vol-review-intro">
        ${modalIcon("check")}
        <div><span>Almost finished</span><h3>Review your judge signup</h3><p>Confirm the details below, then complete the verification to reserve your availability.</p></div>
      </div>
      <section class="vol-review-card">
        <div class="vol-review-primary">
          ${modalIcon("trophy")}
          <div><span>You’re volunteering for</span><strong>${escapeHtml(selectedEvent.title)}</strong><small>${escapeHtml(roleDisplayLabel(selectedRole))}</small></div>
        </div>
        <div class="vol-review-details">
          <div class="vol-review-detail">${modalIcon("clock")}<div><span>Judging availability</span><strong>${escapeHtml(availability)}</strong></div></div>
          <div class="vol-review-detail">${modalIcon("users")}<div><span>Volunteer</span><strong>${escapeHtml(parentName)}</strong></div></div>
          <div class="vol-review-detail">${modalIcon("debate")}<div><span>Debater</span><strong>${escapeHtml(studentName || "Not provided")}</strong></div></div>
        </div>
        <div class="vol-review-privacy">${modalIcon("info")}<div><strong>What will be shown publicly</strong><p>${escapeHtml(parentName)}, ${studentName ? `${studentName}, ` : ""}${escapeHtml(roleDisplayLabel(selectedRole))}, and ${escapeHtml(availability)}. Your email, phone, and notes remain coach-only.</p></div></div>
        <div class="vol-review-contact"><span>Private contact for coaches</span><strong>${escapeHtml($("vol-email").value.trim())} <i>·</i> ${escapeHtml($("vol-phone").value.trim())}</strong></div>
      </section>`;
    const email = $("vol-email").value.trim();
    root.insertAdjacentHTML("beforeend", `
      <aside class="vol-review-email-check" role="note">
        ${modalIcon("document")}
        <div><strong>Double-check your email address</strong><p>Your confirmation and calendar invitation will be sent to <b>${escapeHtml(email)}</b>. Please make sure it is correct before you confirm.</p></div>
      </aside>`);
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

  function openSignup(eventId, roleId, availability) {
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
    $("vol-availability-start").value = availability?.start || selectedEvent.startTime || "";
    $("vol-availability-end").value = availability?.end || selectedEvent.endTime || "";
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

  function openThankYou() {
    const modal = $("volunteer-thank-you-modal");
    if (!modal) return;
    modal.style.display = "flex";
    document.body.classList.add("vol-modal-open");
    setTimeout(() => $("vol-thank-you-done")?.focus(), 0);
  }

  function closeThankYou() {
    const modal = $("volunteer-thank-you-modal");
    if (modal) modal.style.display = "none";
    document.body.classList.remove("vol-modal-open");
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
      closeSignup();
      openThankYou();
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
    document.querySelectorAll("[data-close-volunteer-thank-you]").forEach(element => {
      element.addEventListener("click", closeThankYou);
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
    $("volunteer-thank-you-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-thank-you-modal") closeThankYou();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if ($("volunteer-thank-you-modal")?.style.display === "flex") closeThankYou();
      else closeSignup();
    });
    renderTurnstile();
  });
}());