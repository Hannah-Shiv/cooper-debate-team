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

  const formatPhoneNumber = value => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const validatePhoneField = field => {
    if (!field) return;
    const digits = field.value.replace(/\D/g, "");
    field.setCustomValidity(field.value && digits.length !== 10
      ? "Enter a 10-digit phone number."
      : "");
  };

  const validateEmailField = field => {
    if (!field) return;
    const email = field.value.trim();
    const hasCompleteFormat = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    field.setCustomValidity(email && !hasCompleteFormat
      ? "Enter a complete email address, such as name@example.com."
      : "");
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
    if (isFullTournament) return { label: "Full", className: "is-full" };
    if (signup.availabilityStart === event.startTime) return { label: "Morning", className: "is-morning" };
    if (signup.availabilityEnd === event.endTime) return { label: "Afternoon", className: "is-afternoon" };
    return { label: "Custom", className: "is-custom" };
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
    const morningLength = Math.max(60, Math.floor((total / 2) / 30) * 30);
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

  function applyRosterControls(controls) {
    const roster = controls.closest(".vol-public-roster");
    const body = roster?.querySelector(".vol-roster-table-body");
    const pagination = roster?.querySelector(".vol-roster-pagination");
    if (!body) return;
    const pageSize = 8;
    const search = controls.querySelector(".vol-roster-search-input")?.value.trim().toLowerCase() || "";
    const activeFilter = controls.querySelector(".vol-roster-filter-btn.active")?.dataset.coverage || "";
    const activeSort = controls.querySelector(".vol-roster-sort-btn.active");
    const sortKey = activeSort?.dataset.sort || "name";
    const direction = activeSort?.dataset.direction === "desc" ? -1 : 1;
    const rows = Array.from(body.querySelectorAll(".vol-roster-row"));

    rows.sort((a, b) =>
      (a.dataset[sortKey] || "").localeCompare(b.dataset[sortKey] || "", undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );

    const matches = rows.filter(row => {
      const matchesSearch = !search || `${row.dataset.name} ${row.dataset.debater}`.toLowerCase().includes(search);
      const matchesFilter = !activeFilter || row.dataset.coverage === activeFilter;
      return matchesSearch && matchesFilter;
    });
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(totalPages, Math.max(1, Number(controls.dataset.page || 1)));
    const pageStart = (currentPage - 1) * pageSize;
    const pageEnd = pageStart + pageSize;
    controls.dataset.page = String(currentPage);

    rows.forEach(row => {
      row.hidden = true;
      body.appendChild(row);
    });
    matches.slice(pageStart, pageEnd).forEach(row => {
      row.hidden = false;
      body.appendChild(row);
    });

    let empty = body.querySelector(".vol-roster-filter-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "vol-roster-filter-empty";
      empty.textContent = "No volunteers match these controls.";
      body.appendChild(empty);
    }
    empty.hidden = matches.length > 0;

    if (pagination) {
      const info = pagination.querySelector(".vol-roster-page-info");
      const nav = pagination.querySelector(".vol-roster-page-nav");
      const first = matches.length ? pageStart + 1 : 0;
      const last = Math.min(pageEnd, matches.length);
      if (info) info.textContent = `${first}–${last} of ${matches.length} volunteers`;
      if (nav) {
        const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
          .filter(page => totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1);
        const pageItems = [];
        visiblePages.forEach((page, index) => {
          if (index && page - visiblePages[index - 1] > 1) pageItems.push(`<span aria-hidden="true">…</span>`);
          pageItems.push(`<button type="button" data-page="${page}" class="${page === currentPage ? "active" : ""}" aria-label="Page ${page}" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>`);
        });
        nav.innerHTML = `
          <button type="button" data-page="${currentPage - 1}" aria-label="Previous page" ${currentPage === 1 ? "disabled" : ""}>←</button>
          ${pageItems.join("")}
          <button type="button" data-page="${currentPage + 1}" aria-label="Next page" ${currentPage === totalPages ? "disabled" : ""}>→</button>`;
      }
      pagination.hidden = matches.length <= pageSize;
    }
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
            <div class="vol-roster-row" role="row" data-name="${escapeHtml(signup.parentName)}" data-debater="${escapeHtml(signup.studentName || "")}" data-time="${escapeHtml(signup.availabilityStart || "")}" data-coverage="${escapeHtml(coverage.className)}">
              <div class="vol-roster-volunteer" role="cell" data-label="Volunteer">
                <strong>${escapeHtml(signup.parentName)}</strong>
              </div>
              <div class="vol-roster-availability" role="cell" data-label="Availability">
                ${modalIcon("clock")}<span>${escapeHtml(availability)}</span>
              </div>
              <div class="vol-roster-coverage" role="cell" data-label="Coverage">
                <span class="vol-coverage-tag ${coverage.className}">${escapeHtml(coverage.label)}</span>
              </div>
              <div class="vol-roster-debater" role="cell" data-label="Debater">
                ${modalIcon("debate")}<span>${escapeHtml(signup.studentName || "Not listed")}</span>
              </div>
              <div class="vol-roster-action" role="cell" data-label="Details">
                <button class="vol-roster-details" type="button"
                  data-volunteer="${escapeHtml(signup.parentName)}"
                  data-debater="${escapeHtml(signup.studentName || "Not listed")}"
                  data-availability="${escapeHtml(availability)}"
                  data-coverage="${escapeHtml(coverage.label)}"
                  data-role="${escapeHtml(roleDisplayLabel({ label: signup.roleLabel }))}"
                  data-event="${escapeHtml(event.title)}"
                  data-date="${escapeHtml(event.date ? dateLabel(event.date) : "To be announced")}"
                  aria-label="View public details for ${escapeHtml(signup.parentName)}">Details</button>
              </div>
            </div>`;
        }).join("")
        : `<div class="vol-roster-empty" role="row">Be the first person to volunteer for this tournament.</div>`;
      const availabilityIconNames = ["morning", "afternoon", "full-day", "other"];
      const availabilityMarkup = choices.map((choice, index) => `
        <label class="vol-availability-option${index === 0 ? " is-selected" : ""}">
          <input type="radio" name="availability-${escapeHtml(event.id)}" value="${escapeHtml(choice.id)}" data-start="${escapeHtml(choice.start)}" data-end="${escapeHtml(choice.end)}" ${index === 0 ? "checked" : ""}>
          <span class="vol-availability-radio" aria-hidden="true"></span>
          <span class="vol-availability-icon" aria-hidden="true"><img src="assets/icons/volunteer-${availabilityIconNames[index] || "other"}.png" alt=""></span>
          <span class="vol-availability-copy"><strong>${escapeHtml(choice.label)}</strong><small>${escapeHtml(choice.detail)}</small></span>
           <span class="vol-selection-check" aria-hidden="true">✓</span>
          ${choice.duration ? `<span class="vol-availability-duration">${escapeHtml(choice.duration)}</span>` : ""}
        </label>`).join("");

      return `
        <article class="vol-event-card vol-unified-card">
          <section class="vol-opportunity-panel" aria-label="Judge Volunteer Opportunity">
            <div class="vol-panel-purpose vol-panel-purpose--entry">
              <div class="vol-panel-purpose-art" aria-hidden="true">${modalIcon("clock")}</div>
              <div class="vol-panel-purpose-flow">
                <strong>Judge Volunteer Opportunity</strong>
                <i class="vol-purpose-arrow" aria-hidden="true"></i>
                <span>Enter Your Availability</span>
              </div>
              <div class="vol-panel-purpose-icon" aria-hidden="true">⚖</div>
            </div>
            <header class="vol-unified-header">
              <div class="vol-format-mark" aria-hidden="true">${escapeHtml(formatMark)}</div>
              <div class="vol-unified-title">
                <h3>${escapeHtml(event.title)}</h3>
                ${event.debateFormat ? `<p>${escapeHtml(event.debateFormat)}</p>` : ""}
              </div>
              <div class="vol-entry-status">
                <div class="vol-open-status"><b aria-hidden="true">✓</b><span>Sign Up Open</span></div>
                <div class="vol-entry-deadline"><b aria-hidden="true"><img src="assets/icons/volunteer-calendar.png" alt=""></b><div><span>Signup deadline</span><strong>${escapeHtml(event.signupDeadline ? dateLabel(event.signupDeadline) : "Open")}</strong></div></div>
              </div>
            </header>
            <div class="vol-unified-facts">
              <div><span class="vol-unified-icon"><img src="assets/icons/volunteer-calendar.png" alt=""></span><p><small>Date</small><strong>${escapeHtml(event.date ? dateLabel(event.date) : "To be announced")}</strong></p></div>
              <div><span class="vol-unified-icon">${modalIcon("clock")}</span><p><small>Time</small><strong>${escapeHtml(timeRange(event.startTime, event.endTime) || "To be announced")}</strong></p></div>
              <div><span class="vol-unified-icon"><img src="assets/icons/volunteer-location.png" alt=""></span><p><small>Location</small><strong>${escapeHtml(event.location || "Location to be announced")}</strong>${event.address ? `<em>${escapeHtml(event.address)}</em>` : ""}</p></div>
              <div><span class="vol-unified-icon">♟</span><p><small>Hosted by</small><strong>${escapeHtml(event.host || "Cooper Debate Team")}</strong></p></div>
            </div>
            <div class="vol-unified-brief${invitationUrl ? "" : " no-invitation"}">
              ${event.resolution ? `<div class="vol-brief-item"><b class="vol-brief-icon" aria-hidden="true">▤</b><section><span>Resolution / topic</span><p>${escapeHtml(event.resolution)}</p></section></div>` : ""}
              <div class="vol-brief-item"><b class="vol-brief-icon" aria-hidden="true"><img src="assets/icons/volunteer-meals.png" alt=""></b><section><span>Meals / refreshments</span><p>${escapeHtml(event.mealInfo || "Meal details will be shared before tournament day.")}</p></section></div>
              ${invitationUrl ? `<a href="${escapeHtml(invitationUrl)}" target="_blank" rel="noopener">View full invitation ↗</a>` : ""}
            </div>
            <div class="vol-unified-signup">
              <div class="vol-role-area">
                <div class="vol-role-heading"><span>${modalIcon("clock")}</span><div><h4>When can you volunteer as a judge?</h4><p>Select the time range you are available.</p></div></div>
                <div class="vol-availability-options">${availabilityMarkup}</div>
                <button type="button" class="vol-inline-continue" ${availableRole ? "" : "disabled"} data-event-id="${escapeHtml(event.id)}" data-role-id="${escapeHtml(availableRole?.id || "")}">
                  ${availableRole ? "Continue to Your Sign-Up →" : "All judge spots are filled"}
                </button>
              </div>
              <aside class="vol-public-sidebar">
                <section><h4><b aria-hidden="true">♟</b> What to expect</h4><ul>${publicExpectations.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
                ${judgeNotes.length ? `<section><h4><b aria-hidden="true">${modalIcon("clock")}</b> For judges</h4><ul>${judgeNotes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
                <section class="vol-public-secure"><h4><b aria-hidden="true"><img src="assets/icons/volunteer-privacy.png" alt=""></b> Private &amp; secure</h4><ul><li>Your contact details and notes are visible only to the coaching staff.</li></ul></section>
                <section class="vol-public-assignment"><h4><b aria-hidden="true">✓</b> Judge assignment</h4><ul>${assignmentNotes.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
              </aside>
            </div>
          </section>
          <section class="vol-public-roster" aria-label="Volunteers signed up to judge">
            <div class="vol-panel-purpose vol-panel-purpose--results">
              <div class="vol-panel-purpose-art" aria-hidden="true">${modalIcon("users")}</div>
              <div class="vol-panel-purpose-flow">
                <strong>Volunteers Already Signed Up</strong>
                <i class="vol-purpose-arrow" aria-hidden="true"></i>
                <span>Results panel</span>
              </div>
              <div class="vol-panel-purpose-icon" aria-hidden="true">✓</div>
            </div>
            <div class="vol-roster-summary">
              <div class="vol-roster-metrics" aria-label="Volunteer signup progress">
                <div class="capacity"><div class="vol-metric-circle"><strong>${stats.capacity}</strong></div><span>Judge capacity</span></div>
                <div class="confirmed"><div class="vol-metric-circle"><strong>${stats.confirmed}</strong></div><span>Confirmed</span></div>
                <div class="fill-rate"><div class="vol-metric-circle" style="--fill:${Math.max(0, Math.min(100, stats.fillRate))}%"><strong>${stats.fillRate}%</strong></div><span>Filled</span></div>
                <div class="available"><div class="vol-metric-circle"><strong>${stats.available}</strong></div><span>Open spots</span></div>
              </div>
              <div class="vol-roster-control-divider" aria-hidden="true"><span>✦</span></div>
              ${publicSignups.length ? `
              <div class="vol-roster-controls" aria-label="Search, sort, and filter volunteers">
                <label class="vol-roster-search-box">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input class="vol-roster-search-input" type="search" placeholder="Volunteer or debater…" aria-label="Search volunteers or debaters">
                </label>
                <div class="vol-roster-sort-box" aria-label="Sort volunteers">
                  <button type="button" class="vol-roster-sort-btn active" data-sort="name" data-label="Name" data-direction="asc">Name ↑</button>
                  <button type="button" class="vol-roster-sort-btn" data-sort="time" data-label="Time" data-direction="asc">Time</button>
                  <button type="button" class="vol-roster-sort-btn" data-sort="debater" data-label="Debater" data-direction="asc">Debater</button>
                </div>
                <div class="vol-roster-filter-box">
                  <button type="button" class="vol-roster-filter-btn" data-coverage="is-morning" aria-pressed="false" aria-label="Filter by morning coverage">Morning</button>
                  <button type="button" class="vol-roster-filter-btn" data-coverage="is-full" aria-pressed="false" aria-label="Filter by full coverage">Full</button>
                  <button type="button" class="vol-roster-filter-btn" data-coverage="is-afternoon" aria-pressed="false" aria-label="Filter by afternoon coverage">Afternoon</button>
                </div>
              </div>` : ""}
            </div>
            <div class="vol-roster-table" role="table" aria-label="Volunteer coverage roster">
              <div class="vol-roster-table-head" role="row">
                <span role="columnheader">Volunteer</span><span role="columnheader">Availability</span><span role="columnheader">Coverage</span><span role="columnheader">Debater</span><span role="columnheader">Details</span>
              </div>
              <div class="vol-roster-table-body">${rosterMarkup}</div>
            </div>
            ${publicSignups.length ? `<div class="vol-roster-pagination" hidden><span class="vol-roster-page-info"></span><div class="vol-roster-page-nav" aria-label="Volunteer roster pages"></div></div>` : ""}
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
    root.querySelectorAll(".vol-roster-controls").forEach(controls => {
      controls.querySelector(".vol-roster-search-input")?.addEventListener("input", () => {
        controls.dataset.page = "1";
        applyRosterControls(controls);
      });
      controls.querySelectorAll(".vol-roster-sort-btn").forEach(button => {
        button.addEventListener("click", () => {
          const wasActive = button.classList.contains("active");
          controls.querySelectorAll(".vol-roster-sort-btn").forEach(item => {
            item.classList.remove("active");
            item.textContent = item.dataset.label;
          });
          button.classList.add("active");
          button.dataset.direction = wasActive && button.dataset.direction === "asc" ? "desc" : "asc";
          button.textContent = `${button.dataset.label} ${button.dataset.direction === "asc" ? "↑" : "↓"}`;
          controls.dataset.page = "1";
          applyRosterControls(controls);
        });
      });
      controls.querySelectorAll(".vol-roster-filter-btn").forEach(button => {
        button.addEventListener("click", event => {
          const selected = event.currentTarget;
          const shouldActivate = !selected.classList.contains("active");
          controls.querySelectorAll(".vol-roster-filter-btn").forEach(item => {
            item.classList.remove("active");
            item.setAttribute("aria-pressed", "false");
          });
          if (shouldActivate) {
            selected.classList.add("active");
            selected.setAttribute("aria-pressed", "true");
          }
          controls.dataset.page = "1";
          applyRosterControls(controls);
        });
      });
      controls.closest(".vol-public-roster")?.querySelector(".vol-roster-pagination")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-page]");
        if (!button || button.disabled) return;
        controls.dataset.page = button.dataset.page;
        applyRosterControls(controls);
        controls.closest(".vol-public-roster")?.querySelector(".vol-roster-table")?.scrollIntoView({ behavior:"smooth", block:"nearest" });
      });
      applyRosterControls(controls);
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

  function ensureDetailsModal() {
    let modal = $("volunteer-details-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "volunteer-details-modal";
    modal.className = "vol-details-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "volunteer-details-title");
    modal.innerHTML = `
      <div class="vol-details-card">
        <button class="vol-details-close" type="button" aria-label="Close volunteer details">×</button>
        <p class="vol-details-kicker">Public volunteer details</p>
        <h3 id="volunteer-details-title">Volunteer Details</h3>
        <div class="vol-details-grid"></div>
        <p class="vol-details-privacy">For privacy, email, phone number, and notes are available only to authorized coaching staff in the Member Portal.</p>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest(".vol-details-close")) closeDetailsModal();
    });
    return modal;
  }

  function openDetailsModal(button) {
    const modal = ensureDetailsModal();
    const fields = [
      ["Volunteer", button.dataset.volunteer],
      ["Debater", button.dataset.debater],
      ["Volunteer role", button.dataset.role],
      ["Availability", button.dataset.availability],
      ["Coverage", button.dataset.coverage],
      ["Tournament", button.dataset.event],
      ["Tournament date", button.dataset.date],
    ];
    modal.querySelector(".vol-details-grid").innerHTML = fields.map(([label, value]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Not listed")}</strong></div>`
    ).join("");
    modal.classList.add("is-open");
    document.body.classList.add("vol-details-open");
    modal.querySelector(".vol-details-close").focus();
  }

  function closeDetailsModal() {
    const modal = $("volunteer-details-modal");
    if (!modal?.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("vol-details-open");
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
    const informationItems = [
      { icon: "calendar", title: "Date", label: selectedEvent.date ? dateLabel(selectedEvent.date) : "The tournament date will be announced." },
      { icon: "clock", title: "Tournament hours", label: timeRange(selectedEvent.startTime, selectedEvent.endTime) || "Tournament hours will be announced." },
      { icon: "users", title: "Debate format", label: selectedEvent.debateFormat || "The debate format will be shared before the tournament." },
      { icon: "utensils", title: "Meals", label: selectedEvent.mealInfo || "Meal and refreshment details will be shared before tournament day." },
      { icon: "pin", title: "Location", label: [selectedEvent.location, selectedEvent.address].filter(Boolean).join(" · ") || "The location will be announced." },
      { icon: "trophy", title: "Hosted by", label: selectedEvent.host || "Cooper Debate Team" },
      { icon: "document", title: "Resolution / topic", label: selectedEvent.resolution || "The resolution will be shared when available." },
      { icon: "info", title: "Important information", label: selectedEvent.judgeInstructions || selectedEvent.details || "Please arrive early and check the tournament page before leaving." },
      { icon: "question", title: "What to expect", label: expectations.join(" ") || "Plan to judge preliminary rounds within your selected availability. Final assignments will be shared closer to the tournament." },
    ];
    const contact = [
      selectedEvent.coachName,
      selectedEvent.coachEmail,
      selectedEvent.coachPhone,
    ].filter(Boolean);
    if (contact.length) {
      informationItems.push({
        icon: "users",
        title: "Coach contact",
        label: contact.join(" · "),
        email: selectedEvent.coachEmail || "",
      });
    }
    const informationDetailMarkup = item => `
      <span class="vol-info-reader-icon">${modalIcon(item.icon)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.label)}</p>
        ${item.email ? `<a class="vol-info-email-coach" href="mailto:${escapeHtml(item.email)}"><img src="assets/icons/volunteer-field-email.png" alt="">Email Coach</a>` : ""}
      </div>`;
    root.innerHTML = `
      <section class="vol-side-card">
        <h4>${modalIcon("info")}<span class="vol-info-heading-copy"><span>Helpful information</span><small>Hover, focus, or tap an icon for details</small></span></h4>
        <div class="vol-side-row"><span>Tournament</span><strong>${escapeHtml(selectedEvent.title)}</strong></div>
        <div class="vol-side-row"><span>Your selection</span><strong>${escapeHtml(roleDisplayLabel(selectedRole))} · ${escapeHtml(chosenTime)}</strong></div>
        <div class="vol-info-tabs" role="tablist" aria-label="Helpful information topics">
          ${informationItems.map((item, index) => `
            <button id="vol-info-tab-${index}" class="vol-info-callout${index === 0 ? " is-active" : ""}" type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-controls="vol-info-reader" data-info-index="${index}">
              <span class="vol-info-trigger" aria-hidden="true">${modalIcon(item.icon)}</span>
              <strong>${escapeHtml(item.title)}</strong>
            </button>`).join("")}
        </div>
        <div id="vol-info-reader" class="vol-info-reader" role="tabpanel" aria-labelledby="vol-info-tab-0" aria-live="polite">
          ${informationDetailMarkup(informationItems[0])}
        </div>
      </section>`;
    const tabs = Array.from(root.querySelectorAll(".vol-info-callout"));
    const reader = root.querySelector("#vol-info-reader");
    const activateInformation = (index, moveFocus = false) => {
      const item = informationItems[index];
      const tab = tabs[index];
      if (!item || !tab || !reader) return;
      tabs.forEach((candidate, candidateIndex) => {
        const active = candidateIndex === index;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
        candidate.tabIndex = active ? 0 : -1;
      });
      reader.setAttribute("aria-labelledby", tab.id);
      reader.innerHTML = informationDetailMarkup(item);
      if (moveFocus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.addEventListener("mouseenter", () => activateInformation(index));
      tab.addEventListener("focus", () => activateInformation(index));
      tab.addEventListener("click", () => activateInformation(index));
      tab.addEventListener("keydown", event => {
        let nextIndex = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activateInformation(nextIndex, true);
      });
    });
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

  const printablePdfText = value => String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

  function buildVolunteerReviewPdf() {
    const firstName = $("vol-parent-first-name").value.trim();
    const lastName = $("vol-parent-last-name").value.trim();
    const volunteerName = `${firstName} ${lastName}`.trim();
    const availability = timeRange($("vol-availability-start").value, $("vol-availability-end").value);
    const details = [
      ["Tournament", selectedEvent?.title],
      ["Volunteer role", roleDisplayLabel(selectedRole)],
      ["Date", selectedEvent?.date ? dateLabel(selectedEvent.date) : "To be announced"],
      ["Availability", availability],
      ["Location", selectedEvent?.location || "To be announced"],
      ["Volunteer", volunteerName],
      ["Debater", $("vol-student-name").value.trim() || "Not provided"],
      ["Email", $("vol-email").value.trim()],
      ["Phone", $("vol-phone").value.trim()],
    ];
    const commands = [
      "0.008 0.157 0.22 rg 0 0 612 792 re f",
      "0.961 0.773 0.259 rg 0 650 612 142 re f",
      "0.008 0.157 0.22 rg",
      `BT /F1 11 Tf 46 754 Td (${printablePdfText("COOPER DEBATE TEAM")}) Tj ET`,
      `BT /F2 25 Tf 46 716 Td (${printablePdfText("Volunteer Judge Signup Review")}) Tj ET`,
      `BT /F1 12 Tf 46 688 Td (${printablePdfText(selectedEvent?.title || "Tournament")}) Tj ET`,
      "0.933 0.969 0.945 rg",
    ];
    let y = 610;
    details.forEach(([label, value], index) => {
      const column = index % 2;
      const x = column ? 316 : 46;
      if (column === 0 && index > 0) y -= 72;
      commands.push(
        "0.018 0.239 0.247 rg",
        `${x} ${y - 9} 250 58 re f`,
        "0.961 0.773 0.259 rg",
        `BT /F2 8 Tf ${x + 14} ${y + 28} Td (${printablePdfText(label.toUpperCase())}) Tj ET`,
        "0.933 0.969 0.945 rg",
        `BT /F1 11 Tf ${x + 14} ${y + 8} Td (${printablePdfText(value || "Not provided")}) Tj ET`
      );
    });
    y -= 84;
    const notes = $("vol-notes").value.trim();
    if (notes) {
      const shortenedNotes = notes.length > 145 ? `${notes.slice(0, 142)}...` : notes;
      commands.push(
        "0.018 0.239 0.247 rg",
        `46 ${y - 24} 520 68 re f`,
        "0.961 0.773 0.259 rg",
        `BT /F2 8 Tf 60 ${y + 22} Td (${printablePdfText("NOTES FOR THE COACH")}) Tj ET`,
        "0.933 0.969 0.945 rg",
        `BT /F1 10 Tf 60 ${y + 2} Td (${printablePdfText(shortenedNotes)}) Tj ET`
      );
    }
    commands.push(
      "0.522 0.843 0.737 rg",
      `BT /F1 9 Tf 46 48 Td (${printablePdfText("Review these details before confirming your signup. Contact information remains coach-only.")}) Tj ET`
    );

    const content = commands.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(new TextEncoder().encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  async function saveVolunteerReviewPdf() {
    const filenameBase = String(selectedEvent?.title || "volunteer-signup")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${filenameBase || "volunteer-signup"}-review.pdf`;
    const blob = buildVolunteerReviewPdf();
    try {
      if ("showSaveFilePicker" in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      setStatus("Your signup review PDF has been saved.");
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("The PDF could not be saved. Please try again.", true);
    }
  }

  function showStep(step) {
    wizardStep = Math.max(1, Math.min(2, step));
    document.querySelectorAll("[data-vol-step]").forEach(panel => {
      panel.hidden = Number(panel.dataset.volStep) !== wizardStep;
    });
    document.querySelectorAll("[data-vol-progress]").forEach(item => {
      const active = Number(item.dataset.volProgress) <= wizardStep;
      item.classList.toggle("is-active", active);
      item.classList.toggle("is-current", Number(item.dataset.volProgress) === wizardStep);
    });
    if (wizardStep === 2) {
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
    $("vol-modal-context").textContent = `${selectedEvent.title} · ${roleDisplayLabel(selectedRole)}`;
    form.reset();
    form.querySelectorAll(".is-complete").forEach(field => field.classList.remove("is-complete"));
    $("vol-availability-start").min = selectedEvent.startTime || "";
    $("vol-availability-start").max = selectedEvent.endTime || "";
    $("vol-availability-end").min = selectedEvent.startTime || "";
    $("vol-availability-end").max = selectedEvent.endTime || "";
    $("vol-availability-start").value = availability?.start || selectedEvent.startTime || "";
    $("vol-availability-end").value = availability?.end || selectedEvent.endTime || "";
    $("vol-condensed-event").textContent = `${roleDisplayLabel(selectedRole)} · ${timeRange($("vol-availability-start").value, $("vol-availability-end").value)}`;
    renderSignupSidebar();
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    $("volunteer-modal").style.display = "flex";
    $("volunteer-exit-modal").style.display = "none";
    document.body.classList.add("vol-modal-open");
    showStep(1);
    $("vol-parent-first-name").focus();
  }

  function closeSignup() {
    const modal = $("volunteer-modal");
    if (modal) modal.style.display = "none";
    document.body.classList.remove("vol-modal-open");
    selectedEvent = null;
    selectedRole = null;
    wizardStep = 1;
  }

  function hasEnteredSignupData() {
    return [
      "vol-parent-first-name",
      "vol-parent-last-name",
      "vol-phone",
      "vol-email",
      "vol-student-name",
      "vol-notes",
    ].some(id => Boolean($(id)?.value.trim()));
  }

  function hideExitConfirmation() {
    const modal = $("volunteer-exit-modal");
    if (modal) modal.style.display = "none";
  }

  function requestCloseSignup() {
    if ($("volunteer-modal")?.style.display !== "flex") return;
    if (!hasEnteredSignupData()) {
      closeSignup();
      return;
    }
    const modal = $("volunteer-exit-modal");
    if (!modal) return;
    modal.style.display = "flex";
    setTimeout(() => $("vol-exit-stay")?.focus(), 0);
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
    if (wizardStep < 2) {
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

    if (!validateStep(1)) return;
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
    $("volunteer-events")?.addEventListener("click", event => {
      const detailsButton = event.target.closest(".vol-roster-details");
      if (detailsButton) openDetailsModal(detailsButton);
    });
    $("volunteer-signup-form")?.addEventListener("submit", submitSignup);
    const phoneField = $("vol-phone");
    const emailField = $("vol-email");
    phoneField?.addEventListener("input", () => {
      phoneField.value = formatPhoneNumber(phoneField.value);
      validatePhoneField(phoneField);
    });
    phoneField?.addEventListener("blur", () => validatePhoneField(phoneField));
    emailField?.addEventListener("input", () => validateEmailField(emailField));
    emailField?.addEventListener("blur", () => validateEmailField(emailField));
    document.querySelectorAll("[data-close-volunteer-modal]").forEach(element => {
      element.addEventListener("click", requestCloseSignup);
    });
    $("vol-exit-stay")?.addEventListener("click", hideExitConfirmation);
    $("vol-exit-discard")?.addEventListener("click", () => {
      hideExitConfirmation();
      closeSignup();
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
      const updateCondensedSelection = () => {
        if (!$("vol-condensed-event") || !selectedRole) return;
        $("vol-condensed-event").textContent = `${roleDisplayLabel(selectedRole)} · ${timeRange($("vol-availability-start").value, $("vol-availability-end").value)}`;
        renderSignupSidebar();
      };
      $(id)?.addEventListener("input", updateCondensedSelection);
      $(id)?.addEventListener("change", updateCondensedSelection);
    });
    document.querySelectorAll("#volunteer-signup-form input, #volunteer-signup-form textarea").forEach(field => {
      const updateCompletion = () => {
        const hasValue = Boolean(field.value.trim());
        field.classList.toggle("is-complete", hasValue && field.checkValidity());
      };
      field.addEventListener("input", updateCompletion);
      field.addEventListener("change", updateCompletion);
      field.addEventListener("blur", updateCompletion);
    });
    const printItinerary = () => {
      document.body.classList.add("vol-print-itinerary");
      window.print();
    };
    $("vol-print-itinerary")?.addEventListener("click", printItinerary);
    $("vol-save-pdf")?.addEventListener("click", saveVolunteerReviewPdf);
    window.addEventListener("afterprint", () => document.body.classList.remove("vol-print-itinerary"));
    $("volunteer-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-modal") requestCloseSignup();
    });
    $("volunteer-exit-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-exit-modal") hideExitConfirmation();
    });
    $("volunteer-thank-you-modal")?.addEventListener("click", event => {
      if (event.target.id === "volunteer-thank-you-modal") closeThankYou();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if ($("volunteer-exit-modal")?.style.display === "flex") hideExitConfirmation();
      else if ($("volunteer-details-modal")?.classList.contains("is-open")) closeDetailsModal();
      else if ($("volunteer-thank-you-modal")?.style.display === "flex") closeThankYou();
      else requestCloseSignup();
    });
    renderTurnstile();
  });
}());