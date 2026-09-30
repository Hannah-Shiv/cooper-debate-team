/* Cooper Debate Team — public judge volunteer signup */
(function () {
  "use strict";

  const ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/publicVolunteerSignup";
  const ROSTER_ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/publicSeasonVolunteerRoster";
  const DEV_SEASON_ENDPOINT = "/api/dev/season-volunteers";
  const SEASON_SUBMISSION_HOSTS = Object.freeze(["cooperdebateteam.com", "www.cooperdebateteam.com"]);
  const SEASON_DRAFT_SESSION_KEY = "cooper-debate:season-volunteer:2026-2027";
  const WASDL_FULL_DAY_START = "08:00";
  const WASDL_FULL_DAY_END = "17:30";
  const WASDL_FULL_DAY_DURATION = 570;
  const SEASON = "2026-2027";
  const SEASON_TOURNAMENTS = Object.freeze([
    Object.freeze({ id: "2026-10-24", name: "Congressional Middle School", date: "Saturday, October 24, 2026", location: "Congressional School", address: "3229 Sleepy Hollow Rd, Falls Church, VA 22042", judgeTarget: 12 }),
    Object.freeze({ id: "2026-11-14", name: "Cooper Middle School", date: "Saturday, November 14, 2026", location: "Cooper Middle School", address: "977 Balls Hill Rd, McLean, VA 22101", judgeTarget: 12 }),
    Object.freeze({ id: "2026-12-05", name: "Longfellow Middle School", date: "Saturday, December 5, 2026", location: "Longfellow Middle School", address: "2000 Westmoreland St, Falls Church, VA 22043", judgeTarget: 12 }),
    Object.freeze({ id: "2027-01-30", name: "Norwood Middle School", date: "Saturday, January 30, 2027", location: "Norwood School", address: "8821 River Rd, Bethesda, MD 20817", judgeTarget: 12 }),
    Object.freeze({ id: "2027-02-20", name: "Online — Virtual Tournament", date: "Saturday, February 20, 2027", location: "Online", address: "Virtual tournament", judgeTarget: 12 }),
  ]);
  const APPROVED_MEAL_ITEMS = Object.freeze([
    "A complimentary lunch will be provided for all judges.",
    "Light refreshments (coffee, water, snacks) will be available throughout the day.",
    "Please let us know about any dietary restrictions in advance if possible.",
  ]);
  const APPROVED_MEAL_INFO = APPROVED_MEAL_ITEMS.join(" ");
  const APPROVED_RESOLUTION = "The United States federal government should substantially restrict the development and/or use of hyperscale data centers in the United States.";
  const APPROVED_EXPECTATIONS = Object.freeze([
    "You will be assigned to multiple rounds throughout the day.",
    "Each round is about a 60-minute session, followed by a short feedback period.",
    "You will evaluate constructive speeches, crossfire, and rebuttals using a provided ballot.",
    "Coaches and student volunteers will be available to answer questions and provide support.",
    "You may be paired with another judge for certain rounds.",
  ]);
  const APPROVED_ARRIVAL = Object.freeze([
    "Please arrive early, 8:00 AM for check-in.",
    "Enter through the main entrance from the parking lot.",
    "Check in at the Judge Registration table in the lobby.",
    "Parking is available in the main school parking lot.",
    "Look for signage and student volunteers if you need assistance.",
  ]);
  const APPROVED_IMPORTANT_INFORMATION = Object.freeze([
    "Tournament schedule and judge pairings will be provided at check-in.",
    "This is a middle school tournament. Rounds may include novice debaters.",
    "Be prepared for a day of thoughtful discussion, engaged students, and great debates!",
    "If you have questions during the event, please ask a coach or tournament volunteer.",
  ]);
  const APPROVED_CONTACT = Object.freeze([
    "If you have questions before the tournament, please contact:",
    "Coach Pamela Konde · pgkonde@fcps.edu",
    "On tournament day, look for a coach or any student volunteer — we're here to help!",
  ]);
  const FULL_TOURNAMENT_HOUR_OVERRIDES = Object.freeze({
    "volunteer-signup-acceptance-test": Object.freeze({ start: "08:00", end: "17:30" }),
  });
  let volunteerEvents = [];
  let seasonSignups = [];
  let seasonSignupsAvailable = false;
  let selectedEvent = null;
  let selectedRole = null;
  let confirmedPdfBlob = null;
  let confirmedLetterPreviewUrl = "";
  let wizardStep = 1;
  let turnstileLoaded = false;
  let turnstileWidgetId = null;
  let cancellationTurnstileWidgetId = null;
  let pendingCancellationToken = "";
  let developmentCancellationToken = "";
  let submitPendingTurnstile = false;
  let signupSubmitting = false;
  let selectedTournamentIds = new Set();
  let tabroomLinkOpened = false;

  let confirmedSignupId = "";
  let confirmedTestSubmission = false;
  let confirmedRetryToken = "";
  let confirmedRegistrationEmail = "";
  let cancellationReturnFocus = null;
  const $ = id => document.getElementById(id);
  const isDevelopmentPreview = () => ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
    window.location.hostname.endsWith(".replit.dev");
  const canSubmitSeasonAvailability = () => isDevelopmentPreview() ||
    SEASON_SUBMISSION_HOSTS.includes(window.location.hostname);
  const seasonSubmissionEndpoint = () => isDevelopmentPreview() ? DEV_SEASON_ENDPOINT : ENDPOINT;
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

  const fitEmailFieldText = field => {
    if (!field) return;
    field.style.removeProperty("font-size");
    if (!field.value || field.clientWidth <= 0) return;

    const style = getComputedStyle(field);
    const baseFontSize = Number.parseFloat(style.fontSize) || 14;
    const horizontalPadding = Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    const availableWidth = Math.max(0, field.clientWidth - horizontalPadding - 8);
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${style.fontStyle} ${style.fontWeight} ${baseFontSize}px ${style.fontFamily}`;
    const textWidth = context.measureText(field.value).width;
    if (textWidth <= availableWidth) {
      field.scrollLeft = 0;
      return;
    }

    const fittedFontSize = Math.max(8.3, Math.floor((baseFontSize * availableWidth / textWidth) * 10) / 10);
    field.style.setProperty("font-size", `${fittedFontSize}px`, "important");
    field.scrollLeft = 0;
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
    if (isFullTournament) return { label: "All day", className: "is-full" };
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
      { icon: "utensils", label: "Meals", value: APPROVED_MEAL_INFO },
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
      return [
        { id: "full", label: timeRange(WASDL_FULL_DAY_START, WASDL_FULL_DAY_END), detail: "Required WASDL full-day commitment", icon: "☀", start: WASDL_FULL_DAY_START, end: WASDL_FULL_DAY_END, duration: durationLabel(WASDL_FULL_DAY_DURATION) },
        { id: "custom", label: "Other (custom time range)", detail: "Choose your own start and end time", icon: "▣", start: "", end: "", duration: "" },
      ];
    }
    const total = end - start;
    const morningLength = Math.max(60, Math.floor((total / 2) / 30) * 30);
    const split = start + morningLength;
    return [
      { id: "full", label: timeRange(WASDL_FULL_DAY_START, WASDL_FULL_DAY_END), detail: "Required WASDL full-day commitment", icon: "☀", start: WASDL_FULL_DAY_START, end: WASDL_FULL_DAY_END, duration: durationLabel(WASDL_FULL_DAY_DURATION) },
      { id: "morning", label: timeRange(minutesToTime(start), minutesToTime(split)), detail: "Morning availability", icon: "☀", start: minutesToTime(start), end: minutesToTime(split), duration: durationLabel(morningLength) },
      { id: "afternoon", label: timeRange(minutesToTime(split), minutesToTime(end)), detail: "Afternoon availability", icon: "☀", start: minutesToTime(split), end: minutesToTime(end), duration: durationLabel(end - split) },
      { id: "custom", label: "Other (custom time range)", detail: "Choose your own start and end time", icon: "▣", start: event.startTime, end: event.endTime, duration: "" },
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
    const results = roster.closest(".vol-results-card");
    const tournamentView = results?.dataset.view === "tournament";
    const activeFilter = tournamentView
      ? results.querySelector(".vol-stats-tournament-select")?.value || ""
      : controls.querySelector(".vol-roster-tournament-filter")?.value || "";
    const awaitingTournament = tournamentView && !activeFilter;
    const activeSort = controls.querySelector(".vol-roster-sort-btn.active");
    const sortKey = activeSort?.dataset.sort || "name";
    const direction = activeSort?.dataset.direction === "desc" ? -1 : 1;
    const rows = Array.from(body.querySelectorAll(".vol-roster-row"));
    if (!rows.length) {
      const empty = body.querySelector(".vol-roster-empty");
      if (empty) empty.textContent = awaitingTournament
        ? "Choose a tournament above to see its volunteers."
        : "No volunteers are listed yet. Season availability will appear here when signups are available.";
      return;
    }

    const sortValue = row => sortKey === "coverage" && tournamentView && activeFilter
      ? (row.dataset.fullDayIds.split("|").includes(activeFilter) ? "full" : "partial")
      : row.dataset[sortKey] || "";
    rows.sort((a, b) =>
      sortValue(a).localeCompare(sortValue(b), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );

    const matches = (awaitingTournament ? [] : rows).filter(row => {
      const matchesSearch = !search || row.dataset.search.toLowerCase().includes(search);
      const matchesFilter = !activeFilter || row.dataset.tournamentIds.split("|").includes(activeFilter);
      return matchesSearch && matchesFilter;
    });
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(totalPages, Math.max(1, Number(controls.dataset.page || 1)));
    const pageStart = (currentPage - 1) * pageSize;
    const pageEnd = pageStart + pageSize;
    controls.dataset.page = String(currentPage);

    rows.forEach(row => {
      const isFull = tournamentView && activeFilter
        ? row.dataset.fullDayIds.split("|").includes(activeFilter)
        : row.dataset.coverage === "full";
      const tag = row.querySelector(".vol-coverage-tag");
      tag.classList.toggle("is-full", isFull);
      tag.classList.toggle("is-custom", !isFull);
      tag.textContent = isFull ? "Full day" : tournamentView ? "Other coverage" : "Varies by date";
      row.querySelector(".vol-roster-coverage small").hidden = !isFull || results.dataset.seasonRoster !== "true";
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
      body.appendChild(empty);
    }
    empty.textContent = awaitingTournament
      ? "Choose a tournament above to see its volunteers."
      : "No volunteers match these controls.";
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
    if (!window.CooperVolunteerDashboard) throw new Error("The volunteer roster dashboard could not load.");
    window.CooperVolunteerDashboard.render(root, {
      season: SEASON,
      tournaments: SEASON_TOURNAMENTS,
      signups: seasonSignups,
      available: seasonSignupsAvailable,
      testMode: isDevelopmentPreview(),
    });
    return;
    // Prefer season submissions; older event signups remain visible until the season roster is populated.
    const legacyByName = new Map();
    volunteerEvents.forEach(event => (event.signups || []).forEach(signup => {
      if (!signup.parentName || !signup.roleId) return;
      const key = signup.parentName.trim().toLocaleLowerCase();
      if (!legacyByName.has(key)) legacyByName.set(key, { parentName: signup.parentName, dates: [], fullDay: true });
      const entry = legacyByName.get(key);
      const fullDay = coverageForSignup(signup, event).className === "is-full";
      const [startHour, startMinute] = (signup.availabilityStart || "").split(":").map(Number);
      const [endHour, endMinute] = (signup.availabilityEnd || "").split(":").map(Number);
      const hours = Number.isFinite(startHour) && Number.isFinite(startMinute) &&
        Number.isFinite(endHour) && Number.isFinite(endMinute)
        ? Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60) : 0;
      entry.dates.push({ id: event.date || event.id, name: event.title, date: event.date, fullDay, hours });
      entry.fullDay = entry.fullDay && fullDay;
    }));
    const roster = seasonSignups.length
      ? seasonSignups.filter(signup => signup.parentName && Array.isArray(signup.selectedTournamentIds))
        .map(signup => ({
          parentName: signup.parentName,
          dates: SEASON_TOURNAMENTS.filter(tournament => signup.selectedTournamentIds.includes(tournament.id))
            .map(tournament => ({ id: tournament.id, name: tournament.name, date: tournament.date, fullDay: true, hours: 9.5 })),
          fullDay: true,
        }))
      : [...legacyByName.values()];
    const rosterMarkup = roster.map(person => {
      const initials = person.parentName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
      const dates = [...person.dates].sort((a, b) => a.id.localeCompare(b.id));
      return `
        <div class="vol-roster-row" role="row"
          data-name="${escapeHtml(person.parentName)}"
          data-datecount="${dates.length}"
          data-coverage="${person.fullDay ? "full" : "partial"}"
          data-full-day-ids="${escapeHtml(dates.filter(date => date.fullDay).map(date => date.id).join("|"))}"
          data-tournament-ids="${escapeHtml(dates.map(date => date.id).join("|"))}"
          data-search="${escapeHtml(`${person.parentName} ${dates.map(date => date.name).join(" ")}`)}">
          <div class="vol-roster-volunteer" role="cell" data-label="Volunteer Name">
            <span class="vol-roster-initials" aria-hidden="true">${escapeHtml(initials)}</span>
            <strong>${escapeHtml(person.parentName)}</strong>
          </div>
          <div class="vol-roster-availability" role="cell" data-label="Tournament Availability">
            ${dates.map(date => `<span class="vol-roster-date"><strong>${escapeHtml(date.name)}</strong><small>${escapeHtml(date.date ? dateLabel(date.date) : "Date to be announced")}</small></span>`).join("")}
          </div>
          <div class="vol-roster-coverage" role="cell" data-label="Coverage">
            <span class="vol-coverage-tag ${person.fullDay ? "is-full" : "is-custom"}">${person.fullDay ? "Full day" : "Varies by date"}</span>
            <small ${person.fullDay && seasonSignups.length ? "" : "hidden"}>8:00 AM–5:30 PM</small>
          </div>
        </div>`;
    }).join("");
    root.innerHTML = `
        <article class="vol-event-card vol-unified-card vol-results-card" data-view="tournament" data-season-roster="${seasonSignups.length > 0}">
          <div class="vol-roster-view-chooser" role="group" aria-label="Choose how to view volunteers">
            <span>What would you like to check?</span>
            <div class="vol-roster-view-options">
              <button type="button" data-roster-view="tournament" aria-pressed="true">By tournament</button>
              <button type="button" data-roster-view="volunteer" aria-pressed="false">By volunteer</button>
            </div>
          </div>
          <div class="vol-results-column">
            <section class="vol-roster-stats-panel" aria-label="Statistics for the selected tournament">
              <div class="vol-panel-purpose vol-panel-purpose--stats">
                <div class="vol-panel-purpose-art" aria-hidden="true">${modalIcon("users")}</div>
                <div class="vol-panel-purpose-flow">
                  <strong>Grouped by Tournament</strong>
                  <i class="vol-purpose-arrow" aria-hidden="true"></i>
                  <span class="vol-stats-context">Choose a tournament</span>
                </div>
                <div class="vol-panel-purpose-icon" aria-hidden="true">%</div>
              </div>
              <label class="vol-stats-picker">Tournament
                <select class="vol-stats-tournament-select">
                  <option value="">Select a tournament to view its statistics</option>
                  ${SEASON_TOURNAMENTS.map(tournament => `<option value="${escapeHtml(tournament.id)}">${escapeHtml(tournament.name)} · ${escapeHtml(dateLabel(tournament.id))}</option>`).join("")}
                </select>
              </label>
              <p class="vol-stats-prompt">Choose a tournament to see its volunteer availability and coverage.</p>
              <div class="vol-roster-metrics" aria-label="Selected tournament volunteer statistics" aria-live="polite" hidden>
                <div class="capacity"><div class="vol-metric-circle"><strong>0</strong></div><span>Available volunteers</span></div>
                <div class="confirmed"><div class="vol-metric-circle"><strong>0</strong></div><span>Full-day volunteers</span></div>
                <div class="fill-rate"><div class="vol-metric-circle"><strong>0</strong></div><span>Other coverage</span></div>
                <div class="available"><div class="vol-metric-circle"><strong>0</strong></div><span>Full-day hours offered</span></div>
              </div>
              <p class="vol-stats-explanation" hidden>Availability is not a confirmed judging assignment. Full-day hours count 9.5 hours per volunteer.</p>
              ${!seasonSignups.length && roster.length ? '<p class="vol-season-legacy-note">Showing earlier tournament signups until season availability is listed.</p>' : ""}
            </section>
            <section class="vol-public-roster" aria-label="Volunteers signed up to judge">
            <div class="vol-panel-purpose vol-panel-purpose--results">
              <div class="vol-panel-purpose-art" aria-hidden="true">${modalIcon("users")}</div>
              <div class="vol-panel-purpose-flow">
                 <strong>Grouped by Volunteer</strong>
                <i class="vol-purpose-arrow" aria-hidden="true"></i>
                   <span class="vol-roster-context">Choose a tournament</span>
              </div>
              <div class="vol-panel-purpose-icon" aria-hidden="true">✓</div>
            </div>
            <div class="vol-roster-summary">
              <div class="vol-roster-controls" aria-label="Search, sort, and filter volunteers">
                <label class="vol-roster-search-box">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input class="vol-roster-search-input" type="search" placeholder="Volunteer or tournament…" aria-label="Search volunteers or tournaments">
                </label>
                <div class="vol-roster-sort-box" aria-label="Sort volunteers">
                  <button type="button" class="vol-roster-sort-btn active" data-sort="name" data-label="Name" data-direction="asc">Name ↑</button>
                  <button type="button" class="vol-roster-sort-btn" data-sort="datecount" data-label="Dates" data-direction="asc">Dates</button>
                  <button type="button" class="vol-roster-sort-btn" data-sort="coverage" data-label="Coverage" data-direction="asc">Coverage</button>
                </div>
                <label class="vol-roster-filter-box"><span class="vol-season-sr-only">Filter by tournament date</span>
                  <select class="vol-roster-tournament-filter" aria-label="Filter by tournament date">
                    <option value="">All tournaments</option>
                    ${SEASON_TOURNAMENTS.map(tournament => `<option value="${escapeHtml(tournament.id)}">${escapeHtml(tournament.name)}</option>`).join("")}
                  </select>
                </label>
                <button type="button" class="vol-roster-reset-btn" aria-label="Reset volunteer search, sort, and filter">Reset</button>
              </div>
            </div>
            <div class="vol-roster-table" role="table" aria-label="Season volunteer roster">
              <div class="vol-roster-table-head" role="row">
                <span role="columnheader">Volunteer Name</span><span role="columnheader">Tournament Availability</span><span role="columnheader">Coverage</span>
              </div>
              <div class="vol-roster-table-body">${rosterMarkup || '<div class="vol-roster-empty" role="row">No volunteers are listed yet. Season availability will appear here when signups are available.</div>'}</div>
            </div>
            <div class="vol-roster-pagination" hidden><span class="vol-roster-page-info"></span><div class="vol-roster-page-nav" aria-label="Volunteer roster pages"></div></div>
            <p class="vol-public-roster-note">Volunteer names and tournament availability are public. Contact details, student names, and notes remain private.</p>
            </section>
          </div>
        </article>`;

    root.querySelectorAll(".vol-roster-controls").forEach(controls => {
      const results = controls.closest(".vol-results-card");
      const tournamentPicker = results.querySelector(".vol-stats-tournament-select");
      const metrics = results.querySelector(".vol-roster-metrics");
      const explanation = results.querySelector(".vol-stats-explanation");
      const prompt = results.querySelector(".vol-stats-prompt");
      const updateTournament = () => {
        const tournament = SEASON_TOURNAMENTS.find(item => item.id === tournamentPicker.value);
        results.querySelector(".vol-stats-context").textContent = tournament?.name || "Choose a tournament";
        results.querySelector(".vol-roster-context").textContent = results.dataset.view === "volunteer"
          ? "All tournament dates" : tournament?.name || "Choose a tournament";
        metrics.hidden = !tournament;
        explanation.hidden = !tournament;
        prompt.hidden = !!tournament;
        if (tournament) {
          const available = roster.filter(person => person.dates.some(date => date.id === tournament.id));
          const fullDay = available.filter(person => person.dates.some(date =>
            date.id === tournament.id && date.fullDay)).length;
          metrics.querySelector(".capacity strong").textContent = String(available.length);
          metrics.querySelector(".confirmed strong").textContent = String(fullDay);
          metrics.querySelector(".fill-rate strong").textContent = String(available.length - fullDay);
          const fullDayHours = available.reduce((total, person) => {
            const date = person.dates.find(item => item.id === tournament.id);
            return total + (date?.fullDay ? date.hours || 0 : 0);
          }, 0);
          metrics.querySelector(".available strong").textContent = String(Number(fullDayHours.toFixed(1)));
        }
        controls.dataset.page = "1";
        applyRosterControls(controls);
      };
      tournamentPicker.addEventListener("change", updateTournament);
      results.querySelectorAll("[data-roster-view]").forEach(button => button.addEventListener("click", () => {
        results.dataset.view = button.dataset.rosterView;
        results.querySelectorAll("[data-roster-view]").forEach(option =>
          option.setAttribute("aria-pressed", String(option === button)));
        controls.querySelector(".vol-roster-tournament-filter").value = "";
        results.querySelector(".vol-roster-context").textContent = results.dataset.view === "volunteer"
          ? "All tournament dates" : SEASON_TOURNAMENTS.find(item => item.id === tournamentPicker.value)?.name || "Choose a tournament";
        controls.dataset.page = "1";
        applyRosterControls(controls);
      }));
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
      controls.querySelector(".vol-roster-tournament-filter")?.addEventListener("change", () => {
        controls.dataset.page = "1";
        applyRosterControls(controls);
      });
      controls.querySelector(".vol-roster-reset-btn")?.addEventListener("click", () => {
        const search = controls.querySelector(".vol-roster-search-input");
        if (search) search.value = "";
        controls.querySelectorAll(".vol-roster-sort-btn").forEach(button => {
          button.classList.remove("active");
          button.dataset.direction = "asc";
          button.textContent = button.dataset.label;
        });
        controls.querySelector(".vol-roster-tournament-filter").value = "";
        controls.dataset.page = "1";
        applyRosterControls(controls);
        search?.focus();
      });
      controls.closest(".vol-public-roster")?.querySelector(".vol-roster-pagination")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-page]");
        if (!button || button.disabled) return;
        controls.dataset.page = button.dataset.page;
        applyRosterControls(controls);
        controls.closest(".vol-public-roster")?.querySelector(".vol-roster-table")?.scrollIntoView({ behavior:"smooth", block:"nearest" });
      });
      updateTournament();
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
      const [eventResult, rosterResult] = await Promise.allSettled([
        fetch(ENDPOINT, { headers: { Accept: "application/json" } }),
        fetch(isDevelopmentPreview() ? DEV_SEASON_ENDPOINT : ROSTER_ENDPOINT, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        }),
      ]);
      if (eventResult.status === "fulfilled" && eventResult.value.ok) {
        const payload = await eventResult.value.json();
        volunteerEvents = Array.isArray(payload.events) ? payload.events : [];
      } else {
        volunteerEvents = [];
        console.warn("Tournament event details could not load.");
      }
      seasonSignupsAvailable = false;
      seasonSignups = [];
      if (rosterResult.status === "fulfilled" && rosterResult.value.ok) {
        const payload = await rosterResult.value.json();
        if (payload.season === SEASON && Array.isArray(payload.seasonSignups)) {
          seasonSignups = payload.seasonSignups;
          seasonSignupsAvailable = true;
        } else {
          console.warn("Season volunteer roster response was incomplete.");
        }
      } else {
        console.warn("Season volunteer roster could not load.", rosterResult.reason || rosterResult.value?.status);
      }
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
    const reviewStatus = $("vol-review-submit-status");
    [status, reviewStatus].forEach(element => {
      if (!element) return;
      element.textContent = message || "";
      element.className = `vol-form-status${message ? (isError ? " is-error" : " is-success") : ""}`;
    });
  }

  function isTurnstileConfigured() {
    const key = window.COOPER_TURNSTILE_SITE_KEY;
    return typeof key === "string" && key.trim() && !key.includes("REPLACE");
  }

  function renderTurnstile() {
    const root = $("vol-turnstile");
    if (isDevelopmentPreview() || !canSubmitSeasonAvailability() || !root || !turnstileLoaded || !window.turnstile || turnstileWidgetId !== null || !isTurnstileConfigured()) return;
    turnstileWidgetId = window.turnstile.render(root, {
      sitekey: window.COOPER_TURNSTILE_SITE_KEY.trim(),
      theme: "dark",
      appearance: "always",
      callback: () => {
        setStatus("");
        if (!submitPendingTurnstile || signupSubmitting) return;
        submitPendingTurnstile = false;
        $("volunteer-signup-form")?.requestSubmit();
      },
      "error-callback": () => setStatus("Volunteer verification could not load. Please try again.", true),
      "expired-callback": () => setStatus("Verification expired. Please complete it again.", true),
    });
  }

  function renderCancellationTurnstile() {
    const root = $("vol-cancel-turnstile");
    if (isDevelopmentPreview() || $("vol-cancel-modal")?.hidden || !root || !turnstileLoaded || !window.turnstile ||
      cancellationTurnstileWidgetId !== null || !isTurnstileConfigured()) return;
    cancellationTurnstileWidgetId = window.turnstile.render(root, {
      sitekey: window.COOPER_TURNSTILE_SITE_KEY.trim(),
      theme: "dark",
    });
  }

  window.onTurnstileLoad = () => {
    turnstileLoaded = true;
    renderTurnstile();
    renderCancellationTurnstile();
  };

  function syncWithdrawButton() {
    const button = $("vol-withdraw");
    if (button) button.disabled = !confirmedRegistrationEmail;
  }

  function openCancellationModal({ confirm = false, trigger = null } = {}) {
    const modal = $("vol-cancel-modal");
    if (!modal) return;
    if (trigger) cancellationReturnFocus = trigger;
    $("vol-cancel-request").hidden = confirm;
    $("vol-cancel-confirm").hidden = !confirm;
    modal.querySelector('[role="dialog"]').setAttribute("aria-describedby",
      confirm ? "vol-cancel-confirm-status" : "vol-cancel-explainer");
    if (!confirm) {
      $("vol-cancel-email").value = confirmedRegistrationEmail || $("vol-cancel-email").value;
      pendingCancellationToken = "";
    }
    modal.hidden = false;
    document.body.classList.add("vol-cancel-modal-open");
    renderCancellationTurnstile();
    requestAnimationFrame(() => {
      (confirm ? $("vol-cancel-confirm-title") : $("vol-cancel-email"))
        ?.focus({ preventScroll: true });
    });
  }

  function closeCancellationModal() {
    $("vol-cancel-modal").hidden = true;
    document.body.classList.remove("vol-cancel-modal-open");
    pendingCancellationToken = "";
    if (cancellationReturnFocus?.isConnected) cancellationReturnFocus.focus({ preventScroll: true });
    cancellationReturnFocus = null;
  }

  function showSeasonCancellationConfirmation(token) {
    const panel = $("vol-cancel-confirm");
    const status = $("vol-cancel-confirm-status");
    if (!panel || !status) return;
    selectVolunteerView("signup");
    pendingCancellationToken = /^[a-f0-9]{64}$/.test(token || "") ? token : "";
    status.textContent = pendingCancellationToken
      ? "Nothing has been deleted yet. Choose Delete my website registration to confirm."
      : "This cancellation link is invalid. Request a new link.";
    $("vol-cancel-confirm-button").disabled = !pendingCancellationToken;
    openCancellationModal({ confirm: true });
    panel.querySelector("h4")?.setAttribute("tabindex", "-1");
  }

  function readSeasonCancellationLink() {
    if (!window.location.hash.startsWith("#cancel-season=")) return;
    const token = window.location.hash.slice("#cancel-season=".length);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    showSeasonCancellationConfirmation(token);
  }

  async function requestSeasonCancellation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = $("vol-cancel-request-status");
    const token = !isDevelopmentPreview() && window.turnstile && cancellationTurnstileWidgetId !== null
      ? window.turnstile.getResponse(cancellationTurnstileWidgetId)
      : "";
    if (!isDevelopmentPreview() && !token) {
      status.textContent = "Complete the verification before requesting a cancellation link.";
      renderCancellationTurnstile();
      return;
    }
    button.disabled = true;
    status.textContent = "Checking your request…";
    $("vol-cancel-test-link").hidden = true;
    try {
      const response = await fetch(seasonSubmissionEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "request-season-cancellation",
          email: $("vol-cancel-email").value,
          turnstileToken: token,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not request a cancellation link.");
      developmentCancellationToken = isDevelopmentPreview() ? result.testToken || "" : "";
      $("vol-cancel-test-link").hidden = !developmentCancellationToken;
      status.textContent = isDevelopmentPreview()
        ? developmentCancellationToken
          ? "Test confirmation is ready. No email was sent and no real registration was changed."
          : "No matching test registration exists in this preview. No email was sent."
        : "If a season registration exists for that email, a confirmation link will arrive shortly. Nothing has been deleted yet. If no email arrives, contact a coach.";
    } catch (error) {
      status.textContent = error.message || "Could not request a cancellation link.";
    } finally {
      button.disabled = false;
      if (!isDevelopmentPreview() && window.turnstile && cancellationTurnstileWidgetId !== null) {
        window.turnstile.reset(cancellationTurnstileWidgetId);
      }
    }
  }

  async function confirmSeasonCancellation() {
    if (!pendingCancellationToken) return;
    const button = $("vol-cancel-confirm-button");
    const status = $("vol-cancel-confirm-status");
    button.disabled = true;
    status.textContent = "Removing your website registration…";
    try {
      const response = await fetch(seasonSubmissionEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "confirm-season-cancellation",
          token: pendingCancellationToken,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.deleted) throw new Error(result.error || "Could not confirm the cancellation.");
      pendingCancellationToken = "";
      developmentCancellationToken = "";
      confirmedRegistrationEmail = "";
      syncWithdrawButton();
      $("vol-cancel-test-link").hidden = true;
      status.textContent = result.testSubmission
        ? "Test registration removed from the development roster. No Firebase record was changed or email sent."
        : result.emailStatus === "failed"
          ? "Your registration was deleted from Firebase and the website roster, but the receipt email could not be sent."
          : "Your registration was deleted from Firebase and the website roster. A receipt email was requested.";
      loadVolunteerEvents().catch(() => {});
    } catch (error) {
      status.textContent = error.message || "Could not confirm the cancellation.";
      button.disabled = false;
    }
  }

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
          <div class="vol-brief-resolution">${modalIcon("document")}<div><span>Resolution / topic</span><p>${escapeHtml(APPROVED_RESOLUTION)}</p></div></div>
          <div class="vol-brief-callout">${modalIcon("info")}<div><strong>Important information</strong><p>${escapeHtml(APPROVED_IMPORTANT_INFORMATION.join(" "))}</p></div></div>
          ${invitationUrl ? `<a class="vol-invitation-link" href="${escapeHtml(invitationUrl)}" target="_blank" rel="noopener">View full invitation ↗</a>` : ""}
        </div>
      </div>`;
    renderSignupSidebar();
  }

  function renderSignupSidebar() {
    const root = $("vol-signup-sidebar");
    if (!root || !selectedEvent || !selectedRole) return;
    const chosenTime = timeRange($("vol-availability-start")?.value, $("vol-availability-end")?.value);
    const informationItems = [
      { icon: "calendar", title: "Date", label: selectedEvent.date ? dateLabel(selectedEvent.date) : "The tournament date will be announced." },
      { icon: "clock", title: "Tournament hours", label: timeRange(selectedEvent.startTime, selectedEvent.endTime) || "Tournament hours will be announced." },
      { icon: "users", title: "Debate format", label: selectedEvent.debateFormat || "The debate format will be shared before the tournament." },
      { icon: "utensils", title: "Meals", label: APPROVED_MEAL_INFO },
      { icon: "pin", title: "Location", label: [selectedEvent.location, selectedEvent.address].filter(Boolean).join(" · ") || "The location will be announced." },
      { icon: "trophy", title: "Hosted by", label: selectedEvent.host || "Cooper Debate Team" },
      { icon: "document", title: "Resolution / topic", label: APPROVED_RESOLUTION },
      { icon: "info", title: "Important information", label: APPROVED_IMPORTANT_INFORMATION.join(" ") },
      { icon: "question", title: "What to expect", label: APPROVED_EXPECTATIONS.join(" ") },
      { icon: "users", title: "Coach contact", label: APPROVED_CONTACT.join(" "), email: "pgkonde@fcps.edu" },
    ];
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
        <div class="vol-side-row"><span>Your commitment</span><strong>${escapeHtml(roleDisplayLabel(selectedRole))} · ${escapeHtml(chosenTime)}</strong></div>
        <div id="vol-info-reader" class="vol-info-reader" role="tabpanel" aria-labelledby="vol-info-tab-0" aria-live="polite">
          ${informationDetailMarkup(informationItems[0])}
        </div>
        <div class="vol-info-tabs" role="tablist" aria-label="Helpful information topics">
          ${informationItems.map((item, index) => `
            <button id="vol-info-tab-${index}" class="vol-info-callout${index === 0 ? " is-active" : ""}" type="button" role="tab" aria-selected="${index === 0 ? "true" : "false"}" aria-controls="vol-info-reader" data-info-index="${index}">
              <span class="vol-info-trigger" aria-hidden="true">${modalIcon(item.icon)}</span>
              <strong>${escapeHtml(item.title)}</strong>
            </button>`).join("")}
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
    const email = $("vol-email").value.trim();
    const phone = $("vol-phone").value.trim();
    const notes = $("vol-notes").value.trim() || "No notes provided";
    const availability = timeRange($("vol-availability-start").value, $("vol-availability-end").value);
    root.innerHTML = `
      <div class="vol-review-intro">
        ${modalIcon("check")}
        <div><span>Almost finished</span><h3>Review your judge signup</h3><p>Confirm the details below, then complete the verification to reserve your availability.</p></div>
      </div>
      <section class="vol-review-card" aria-label="Judge signup details">
        <div class="vol-review-table-heading">${modalIcon("trophy")}<div><span>Signup verification</span><strong>${escapeHtml(selectedEvent.title)}</strong></div></div>
        <dl class="vol-review-table">
          <div class="vol-review-row">${modalIcon("debate")}<dt>Volunteer role</dt><dd>${escapeHtml(roleDisplayLabel(selectedRole))}</dd></div>
          <div class="vol-review-row">${modalIcon("clock")}<dt>Judging availability</dt><dd>${escapeHtml(availability)}</dd></div>
          <div class="vol-review-row">${modalIcon("users")}<dt>Volunteer name</dt><dd>${escapeHtml(parentName)}</dd></div>
          <div class="vol-review-row">${modalIcon("debate")}<dt>Your debater <small>Optional</small></dt><dd>${escapeHtml(studentName || "Not provided")}</dd></div>
          <div class="vol-review-row is-private">${modalIcon("document")}<dt>Email <small>Coach-only</small></dt><dd>${escapeHtml(email)}</dd></div>
          <div class="vol-review-row is-private">${modalIcon("info")}<dt>Phone <small>Coach-only</small></dt><dd>${escapeHtml(phone)}</dd></div>
          <div class="vol-review-row is-private is-notes">${modalIcon("document")}<dt>Notes <small>Coach-only</small></dt><dd>${escapeHtml(notes)}</dd></div>
        </dl>
        <div class="vol-review-privacy">${modalIcon("info")}<div><strong>Public roster preview</strong><p>${escapeHtml(parentName)}, ${studentName ? `${escapeHtml(studentName)}, ` : ""}${escapeHtml(roleDisplayLabel(selectedRole))}, and ${escapeHtml(availability)} will be public. Contact details and notes stay private.</p></div></div>
      </section>`;
    const emailCheck = $("vol-review-email-check");
    if (emailCheck) emailCheck.innerHTML = `
        ${modalIcon("document")}
        <div><strong>Double-check your email address</strong><p>Your confirmation and calendar invitation will be sent to <b>${escapeHtml(email)}</b>. Please make sure it is correct before you confirm.</p></div>
      `;
  }

  // The review sheet is intentionally drawn as one fixed US Letter image. This
  // keeps long names/notes inside the template and guarantees one PDF page.
  const pdfImage = src => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  const LETTER_ICON_PATHS = Object.freeze({
    confirmation: "images/volunteer-letter/judge-confirmation-gavel.png?v=1",
    signup: "images/volunteer-letter/signup-details.png?v=2",
    resolution: "images/volunteer-letter/tournament-resolution.png?v=2",
    expectations: "images/volunteer-letter/what-to-expect.png?v=2",
    arrival: "images/volunteer-letter/arrival-parking.png?v=2",
    meals: "images/volunteer-letter/meals-refreshments.png?v=2",
    information: "images/volunteer-letter/important-information.png?v=2",
    contact: "images/volunteer-letter/contact-support.png?v=2",
    privacy: "images/volunteer-letter/privacy.png?v=3",
  });

  async function buildVolunteerReviewPdf() {
    if (document.fonts?.load) {
      await document.fonts.load("48px 'Great Vibes'").catch(() => {});
    }
    const scale = 2.083333;
    const canvas = document.createElement("canvas");
    canvas.width = 1275;
    canvas.height = 1650;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const W = 612;
    const navy = "#062451";
    const gold = "#f6c928";
    const starYellow = "#ffd84d";
    const privacyGreen = "#2f9b62";
    const ink = "#102b59";
    const pale = "#eaf4fc";
    const line = "#c6dced";
    const white = "#fffdf7";
    const firstName = $("vol-parent-first-name")?.value.trim() || "";
    const volunteerName = `${firstName} ${$("vol-parent-last-name")?.value.trim() || ""}`.trim();
    const event = selectedEvent || {};
    const value = (item, fallback) => String(item || fallback || "Not provided");
    const compactNotes = notes => String(notes || "").replace(/\s+/g, " ").trim();
    const availability = timeRange($("vol-availability-start")?.value, $("vol-availability-end")?.value) || "To be announced";
    const location = value(event.location, "Location to be announced");
    const address = event.address || "";
    const resolution = APPROVED_RESOLUTION;
    const expected = [
      "You will be assigned to multiple rounds throughout the day.",
      "Each round is about a 60-minute session, followed by a short feedback period.",
      "You will evaluate constructive speeches, crossfire, and rebuttals using a provided ballot.",
      "Coaches and student volunteers will be available to answer questions and provide support.",
      "You may be paired with another judge for certain rounds.",
    ];
    const importantItems = [
      "Tournament schedule and judge pairings will be provided at check-in.",
      "This is a middle school tournament. Rounds may include novice debaters.",
      "Be prepared for a day of thoughtful discussion, engaged students, and great debates!",
      "If you have questions during the event, please ask a coach or tournament volunteer.",
    ];
    const scaledFont = font => font.replace(/(\d+(?:\.\d+)?)px/, (_, size) => `${Number(size) * 1.1}px`);
    const sectionBodyFont = font => font.replace(/(\d+(?:\.\d+)?)px/, (_, size) => `${Number(size) * 1.15}px`);
    const wrap = (text, maxWidth, font) => {
      ctx.font = scaledFont(font);
      ctx.letterSpacing = "0px";
      const rows = [];
      String(text || "").split(/\n/).forEach(paragraph => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let row = "";
        words.forEach(word => {
          const next = row ? `${row} ${word}` : word;
          if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = word; }
          else row = next;
        });
        if (row) rows.push(row);
      });
      return rows;
    };
    const fitHeadline = (headline, maxWidth, maxLines = 1) => {
      for (let size = 20; size >= 12; size -= .5) {
        const font = `700 ${size}px Georgia`;
        const rows = wrap(headline, maxWidth, font);
        if (rows.length <= maxLines) return { font, rows, leading: size + 2 };
      }
      const font = "700 12px Georgia";
      return { font, rows: wrap(headline, maxWidth, font).slice(0, maxLines), leading: 14 };
    };
    const fitTournamentTitle = (title, maxWidth) => {
      for (let size = 13; size >= 4.5; size -= .25) {
        const font = `italic 700 ${size}px Georgia`;
        ctx.font = scaledFont(font);
        if (ctx.measureText(title).width <= maxWidth) return font;
      }
      return "italic 700 4.5px Georgia";
    };
    const fitNotes = (notes, maxWidth, maxHeight) => {
      for (let size = 7.5; size >= 2; size -= .25) {
        const font = `${size}px Arial`;
        const rows = wrap(notes, maxWidth, font);
        const leading = size * 1.35;
        if (rows.length * leading <= maxHeight) return { font, rows, leading };
      }
      const font = "2px Arial";
      return { font, rows: wrap(notes, maxWidth, font), leading: 2.7 };
    };
    const text = (str, x, y, maxWidth, font, color = ink, maxLines = 4, leading = 11) => {
      const rows = wrap(str, maxWidth, font).slice(0, maxLines);
      ctx.font = scaledFont(font); ctx.letterSpacing = "0px"; ctx.fillStyle = color; ctx.textBaseline = "top";
      rows.forEach((row, index) => ctx.fillText(row, x, y + index * leading));
      return y + rows.length * leading;
    };
    const labeledParagraph = (label, body, x, y, maxWidth, font, boldFont, color = ink, leading = 11.5) => {
      ctx.letterSpacing = "0px";
      ctx.font = scaledFont(boldFont);
      const labelWidth = ctx.measureText(`${label} `).width;
      ctx.font = scaledFont(font);
      const words = String(body || "").trim().split(/\s+/).filter(Boolean);
      let firstLine = "";
      while (words.length) {
        const next = firstLine ? `${firstLine} ${words[0]}` : words[0];
        if (ctx.measureText(next).width > maxWidth - labelWidth && firstLine) break;
        firstLine = next;
        words.shift();
      }
      const remainingRows = wrap(words.join(" "), maxWidth, font);
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      ctx.font = scaledFont(boldFont);
      ctx.fillText(label, x, y);
      ctx.font = scaledFont(font);
      if (firstLine) ctx.fillText(firstLine, x + labelWidth, y);
      remainingRows.forEach((row, index) => ctx.fillText(row, x, y + (index + 1) * leading));
    };
    const rounded = (x, y, w, h, r, fill, stroke) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .7; ctx.stroke(); }
    };
    const drawContainedImage = (image, x, y, width, height) => {
      if (!image) return;
      const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const renderedWidth = image.naturalWidth * ratio;
      const renderedHeight = image.naturalHeight * ratio;
      ctx.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight);
    };
    const bar = (x, y, w, title, icon, accent = gold) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, 24, 5);
      ctx.clip();
      ctx.fillStyle = navy; ctx.fillRect(x, y, w, 24);
      ctx.fillStyle = accent; ctx.fillRect(x, y, 5, 24);
      ctx.restore();
      let fittedSize = 8.2;
      ctx.font = `700 ${fittedSize}px Arial`;
      while (ctx.measureText(title.toUpperCase()).width > w - 40 && fittedSize > 6.5) {
        fittedSize -= .25;
        ctx.font = `700 ${fittedSize}px Arial`;
      }
      drawContainedImage(icon, x + 8, y + 3, 18, 18);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.letterSpacing = "0px"; ctx.fillStyle = "#fff";
      ctx.fillText(title.toUpperCase(), x + 30, y + 7);
    };
    const drawStar = (centerX, centerY, outerRadius, innerRadius) => {
      ctx.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? outerRadius : innerRadius;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };
    const bullets = (items, x, y, width, font = "7.7px Arial", gap = 17, maxLines = 2, leading = 9) => {
      let cursor = y;
      items.slice(0, 6).forEach(item => {
        const itemText = typeof item === "object" ? item.text : item;
        const itemFont = typeof item === "object" && item.font ? item.font : font;
        ctx.fillStyle = navy; ctx.beginPath(); ctx.arc(x + 4, cursor + 5, 5.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = starYellow; drawStar(x + 4, cursor + 5, 3.22, 1.44);
        cursor = text(itemText, x + 14, cursor, width - 14, itemFont, ink, maxLines, leading) + 4;
      });
      return cursor;
    };
    ctx.fillStyle = white; ctx.fillRect(0, 0, W, 792);
    ctx.textBaseline = "top";
    ctx.fillStyle = navy; ctx.fillRect(0, 0, W, 92);
    ctx.fillStyle = gold; ctx.fillRect(0, 90, W, 2);
    const loadedAssets = await Promise.all([
      pdfImage("images/volunteer-letter/cooper-debate-badge.png"),
      pdfImage("images/index-footer-jaguar.png"),
      ...Object.values(LETTER_ICON_PATHS).map(pdfImage),
    ]);
    const [badge, jaguar, ...iconImages] = loadedAssets;
    const icons = Object.fromEntries(Object.keys(LETTER_ICON_PATHS).map((key, index) => [key, iconImages[index]]));
    drawContainedImage(badge, 13, 7, 76, 76);
    if (jaguar) ctx.drawImage(jaguar, 537.4, 10.9, 57.2, 68.2);
    ctx.textAlign = "center";
    ctx.font = "400 31px 'Great Vibes', cursive"; ctx.fillStyle = "#fffdf1"; ctx.wordSpacing = "3px"; ctx.fillText("Cooper Debate Team", 306, 13);
    ctx.wordSpacing = "0px";
    ctx.font = scaledFont("700 9px Arial"); ctx.fillStyle = gold; ctx.letterSpacing = "2px"; ctx.fillText("SPEAK  ·  REASON  ·  LEAD", 306, 49);
    ctx.font = scaledFont("8px Arial"); ctx.letterSpacing = "1.2px"; ctx.fillStyle = "#d9e6f5"; ctx.fillText("COOPER MIDDLE SCHOOL  ·  MCLEAN, VIRGINIA", 306, 68);
    ctx.letterSpacing = "0px";
    rounded(22, 100, 365, 44, 8, gold);
    rounded(29, 104, 36, 36, 6, navy);
    drawContainedImage(icons.confirmation, 31, 106, 32, 32);
    ctx.fillStyle = navy; ctx.fillRect(74, 106, 2, 32);
    ctx.textAlign = "left";
    ctx.font = scaledFont("700 11.5px Georgia"); ctx.fillStyle = navy; ctx.fillText("TOURNAMENT  JUDGE  CONFIRMATION", 88, 114);
    const personalizedHeadline = `${firstName ? `${firstName}, thank you` : "Thank you"} for representing Cooper!`;
    const headline = fitHeadline(personalizedHeadline, 365);
    ctx.font = scaledFont(headline.font); ctx.fillStyle = navy;
    headline.rows.forEach((row, i) => ctx.fillText(row, 22, 153 + i * headline.leading));
    text("Thank you for volunteering to judge at the upcoming tournament! You are representing the Cooper Debate Team at this event. To support a fair and unbiased tournament, you will not judge Cooper teams and may be assigned to rounds involving other schools.", 22, 181, 365, "8.5px Arial", ink, 4, 10.5);
    text("This document confirms your signup details and includes important tournament information. Please review everything carefully.", 22, 226, 365, "8.5px Arial", ink, 2, 10.5);
    rounded(402, 100, 188, 141, 8, "#dceefa", navy);
    ctx.font = "700 7px Arial"; ctx.fillStyle = navy; ctx.fillText("TOURNAMENT INFORMATION", 416, 110);
    const tournamentTitle = value(event.title, "Upcoming Tournament");
    ctx.font = scaledFont(fitTournamentTitle(tournamentTitle, 160)); ctx.fillStyle = navy;
    ctx.fillText(tournamentTitle, 416, 126);
    text(`${event.date ? dateLabel(event.date) : "Date to be announced"}`, 416, 157, 160, "8.5px Arial", ink, 2, 10);
    text(`${location}${address ? `\n${address}` : ""}`, 416, 184, 160, "8px Arial", ink, 3, 13);
    text(`Hosted by: ${value(event.host, "Cooper Debate Team")}`, 416, 222, 160, "700 7.5px Arial", ink, 2, 9);

    const left = 22, right = 304, colW = 276, rightW = 286;
    bar(left, 254, colW, "Your Signup Details", icons.signup);
    rounded(left, 278, colW, 224, 5, pale, line);
    const rows = [
      ["Role", roleDisplayLabel(selectedRole)], ["Volunteer Name", volunteerName],
      ["Your Debater", $("vol-student-name")?.value.trim() || "Not provided"],
      ["Email", $("vol-email")?.value.trim() || "Not provided"], ["Phone", $("vol-phone")?.value.trim() || "Not provided"],
      ["Availability", availability], ["Location", `${location}${address ? `\n${address}` : ""}`],
      ["Notes", compactNotes($("vol-notes")?.value) || "No notes provided."],
    ];
    let rowY = 282;
    rows.forEach(([label, val], index) => {
      const h = index >= 6 ? (index === 7 ? 61 : 39) : 20;
      if (index % 2 === 0) { ctx.fillStyle = "#d9eafa"; ctx.fillRect(left, rowY, colW, h); }
      ctx.font = scaledFont(sectionBodyFont("700 7.5px Arial")); ctx.fillStyle = ink; ctx.fillText(label, left + 9, rowY + 6);
      if (index === 7) {
        const fittedNotes = fitNotes(val, colW - 18, h - 24);
        ctx.font = scaledFont(fittedNotes.font); ctx.fillStyle = ink;
        fittedNotes.rows.forEach((row, lineIndex) => ctx.fillText(row, left + 9, rowY + 19 + lineIndex * fittedNotes.leading));
      } else {
        text(val, left + 91, rowY + 5, colW - 101, sectionBodyFont("7.5px Arial"), ink, index === 6 ? 3 : 2, 10.35);
      }
      rowY += h;
    });
    bar(right, 254, rightW, "Tournament Resolution", icons.resolution);
    rounded(right, 278, rightW, 74, 5, "#f5f9fc", line);
    labeledParagraph("Resolved:", resolution, right + 10, 290, rightW - 20, sectionBodyFont("8px Arial"), sectionBodyFont("700 8px Arial"));
    bar(right, 362, rightW, "What to Expect", icons.expectations);
    rounded(right, 386, rightW, 116, 5, "#f5f9fc", line);
    bullets(expected, right + 10, 395, rightW - 20, "7.5px Arial", 15);

    const boxY = 512, boxGap = 8, boxW = (W - 44 - boxGap * 3) / 4;
    const boxTitles = ["Arrival & Parking", "Refreshments", "Information", "Contact Support"];
    const boxIcons = [icons.arrival, icons.meals, icons.information, icons.contact];
    const boxFills = ["#eef5fb", "#fff8df", "#f3effa", "#fff2e5"];
    const boxLines = ["#c9deed", "#eadca7", "#d9cdec", "#ebcfb1"];
    const boxItems = [
      ["Please arrive early, 8:00 AM for check-in.", "Enter through the main entrance from the parking lot.", "Check in at the Judge Registration table in the lobby.", "Parking is available in the main school parking lot.", "Look for signage and student volunteers if you need assistance."],
      APPROVED_MEAL_ITEMS,
      importantItems,
      ["If you have questions before the tournament, please contact:", { text: "Coach Pamela Konde\npgkonde@fcps.edu", font: sectionBodyFont("700 6.5px Arial") }, "On tournament day, look for a coach or any student volunteer — we're here to help!"],
    ];
    boxTitles.forEach((title, index) => {
      const x = 22 + index * (boxW + boxGap);
      bar(x, boxY, boxW, title, boxIcons[index], gold);
      rounded(x, boxY + 24, boxW, 151, 5, boxFills[index], boxLines[index]);
      const maxItemLines = index >= 2 ? 4 : 3;
      bullets(boxItems[index], x + 8, boxY + 35, boxW - 16, sectionBodyFont("6.5px Arial"), 14, maxItemLines, 8.65);
    });
    rounded(22, 697, 278, 69, 6, "#e9f5f0", "#c8e1d6");
    bar(22, 697, 278, "Privacy", icons.privacy, privacyGreen);
    text("Your contact information and notes are shared only with the Cooper Debate coaching staff and are used solely for tournament-related communication.", 34, 730, 252, "7.5px Arial", ink, 3, 9);
    rounded(308, 697, 282, 69, 6, "#fff0b9", "#f0d36b");
    ctx.textAlign = "left";
    ctx.fillStyle = navy; ctx.font = scaledFont("700 13px Georgia"); ctx.fillText("Thank you again for representing", 322, 706);
    ctx.fillText("the Cooper Debate Team!", 322, 721);
    ctx.font = scaledFont("italic 700 8.5px Georgia"); ctx.fillText("We look forward to seeing you at the tournament!", 322, 741);
    ctx.textAlign = "left";

    confirmedLetterPreviewUrl = canvas.toDataURL("image/jpeg", .92);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .92));
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const stream = `q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ`;
    const encoder = new TextEncoder();
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
      `<< /Type /XObject /Subtype /Image /Width 1275 /Height 1650 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    ];
    const chunks = [encoder.encode("%PDF-1.4\n")];
    const offsets = [0];
    let offset = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(offset);
      const prefix = encoder.encode(`${index + 1} 0 obj\n${object}`);
      const suffix = encoder.encode(index === 4 ? "\nendstream\nendobj\n" : "\nendobj\n");
      chunks.push(prefix, index === 4 ? bytes : new Uint8Array(0), suffix);
      offset += prefix.length + (index === 4 ? bytes.length : 0) + suffix.length;
    });
    const xrefOffset = offset;
    const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(item => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: "application/pdf" });
  }

  function confirmationPdfFilename(event) {
    const tournamentName = String(event?.title || "Tournament")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const rawDate = String(event?.date || "");
    const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let tournamentDate = "Date_To_Be_Announced";
    if (dateMatch) {
      const [, year, monthValue, dayValue] = dateMatch;
      const day = Number(dayValue);
      const suffix = day % 100 >= 11 && day % 100 <= 13
        ? "th"
        : ({ 1:"st", 2:"nd", 3:"rd" }[day % 10] || "th");
      const month = new Intl.DateTimeFormat("en-US", { month:"long", timeZone:"UTC" })
        .format(new Date(Date.UTC(Number(year), Number(monthValue) - 1, day)));
      tournamentDate = `${month}_${day}${suffix}_${year}`;
    }
    return `Judge_Volunteer_For_${tournamentName || "Tournament"}_On_${tournamentDate}.pdf`;
  }

  async function saveVolunteerReviewPdf() {
    const filename = confirmationPdfFilename(selectedEvent);
    try {
      if ("showSaveFilePicker" in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
        });
        const blob = confirmedPdfBlob || await buildVolunteerReviewPdf();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const blob = confirmedPdfBlob || await buildVolunteerReviewPdf();
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

  async function printVolunteerReviewPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Please allow pop-ups to print your confirmation.", true);
      return;
    }
    printWindow.document.write("<title>Preparing judge confirmation…</title><p style=\"font-family:Arial,sans-serif;padding:24px\">Preparing your judge confirmation…</p>");
    try {
      const blob = confirmedPdfBlob || await buildVolunteerReviewPdf();
      const url = URL.createObjectURL(blob);
      printWindow.location.replace(url);
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (_) {
          // The PDF is already open and can still be printed from its viewer.
        }
      }, 900);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (_) {
      printWindow.close();
      setStatus("The PDF could not be prepared for printing. Please try again.", true);
    }
  }

  function selectVolunteerView(view, focusTab = false) {
    const chosen = view === "results" ? "results" : "signup";
    document.querySelector(".volunteer-change")?.removeAttribute("open");
    document.querySelectorAll("[data-volunteer-view]").forEach(tab => {
      const selected = tab.dataset.volunteerView === chosen;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    $("volunteer-signup-panel").hidden = chosen !== "signup";
    $("volunteer-results-panel").hidden = chosen !== "results";
  }

  function showStep(step, { focus = true } = {}) {
    wizardStep = Math.max(1, Math.min(3, step));
    document.querySelectorAll("[data-vol-step]").forEach(panel => {
      panel.hidden = Number(panel.dataset.volStep) !== wizardStep;
      if (!panel.hidden) {
        panel.classList.remove("is-entering");
        requestAnimationFrame(() => panel.classList.add("is-entering"));
        const heading = panel.querySelector(".vol-season-screen-heading h3");
        if (heading && focus) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }
    });
    document.querySelectorAll("[data-vol-progress]").forEach(item => {
      const active = Number(item.dataset.volProgress) <= wizardStep;
      item.classList.toggle("is-active", active);
      item.classList.toggle("is-current", Number(item.dataset.volProgress) === wizardStep);
      if (Number(item.dataset.volProgress) === wizardStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    const percentage = Math.round(wizardStep / 3 * 100);
    const progressTrack = $("vol-progress-track");
    const progressFill = $("vol-progress-fill");
    const progressPercent = $("vol-progress-percent");
    const progressLabels = ["Tournament dates", "Your information", "Review & submit"];
    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", String(percentage));
      progressTrack.setAttribute("aria-valuetext", `Step ${wizardStep} of 3: ${progressLabels[wizardStep - 1]}`);
    }
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressPercent) progressPercent.textContent = `${percentage}% complete`;
    renderSeasonAvailabilitySummary();
    if (wizardStep === 3) renderSeasonReview();
    if (wizardStep === 3) renderTurnstile();
    const submitButton = $("vol-submit");
    const canSubmit = canSubmitSeasonAvailability();
    if (submitButton) submitButton.disabled = wizardStep === 3 && !canSubmit;
    setStatus("");
  }

  function validateStep(step) {
    if (step === 1) {
      const error = $("vol-season-selection-error");
      const hasSelection = selectedTournamentIds.size > 0;
      const committed = $("vol-full-day-commitment")?.checked === true;
      if (error) error.hidden = hasSelection;
      if ($("vol-day-confirmation-error")) $("vol-day-confirmation-error").hidden = committed;
      if (!hasSelection) $("vol-season-tournament-choices")?.querySelector("input")?.focus();
      else if (!committed) $("vol-full-day-commitment")?.focus();
      return hasSelection && committed;
    }
    const panel = document.querySelector(`[data-vol-step="${step}"]`);
    const fields = panel ? [...panel.querySelectorAll("input[required], textarea[required]")] : [];
    return fields.every(field => {
      if (field.checkValidity()) return true;
      field.reportValidity();
      return false;
    });
  }

  function readSeasonFormValues() {
    return {
      parentFirstName: $("vol-parent-first-name")?.value || "",
      parentLastName: $("vol-parent-last-name")?.value || "",
      email: $("vol-email")?.value || "",
      phone: $("vol-phone")?.value || "",
      studentName: $("vol-student-name")?.value || "",
      tabroomUsernameOrEmail: $("vol-tabroom-identifier")?.value || "",
      notes: $("vol-notes")?.value || "",
    };
  }

  function syncFullDayCommitment() {
    const confirmed = $("vol-full-day-commitment")?.checked === true;
    $("vol-full-day-commitment")?.closest(".vol-day-commitment-card")?.classList.toggle("is-confirmed", confirmed);
    const continueButton = $("vol-day-continue");
    if (continueButton) {
      continueButton.disabled = !confirmed;
      continueButton.textContent = confirmed
        ? "CONTINUE TO YOUR INFORMATION →"
        : "CONFIRM THE FULL-DAY COMMITMENT ABOVE";
    }
    if (confirmed && $("vol-day-confirmation-error")) $("vol-day-confirmation-error").hidden = true;
  }

  function persistSeasonDraft() {
    try {
      const form = readSeasonFormValues();
      const fullDayCommitment = $("vol-full-day-commitment")?.checked === true;
      const hasData = fullDayCommitment || selectedTournamentIds.size > 0 || Object.values(form).some(value => value.trim());
      if (!hasData) {
        window.sessionStorage.removeItem(SEASON_DRAFT_SESSION_KEY);
        return true;
      }
      const draft = {
        season: SEASON,
        form,
        selectedTournamentIds: SEASON_TOURNAMENTS
          .filter(tournament => selectedTournamentIds.has(tournament.id))
          .map(tournament => tournament.id),
        fullDayCommitment,
        savedAt: new Date().toISOString(),
      };
      window.sessionStorage.setItem(SEASON_DRAFT_SESSION_KEY, JSON.stringify(draft));
      return true;
    } catch (error) {
      console.warn("Season signup draft could not be saved in this browser session.", error);
      return false;
    }
  }

  function restoreSeasonDraft() {
    try {
      const saved = window.sessionStorage.getItem(SEASON_DRAFT_SESSION_KEY);
      if (!saved) return { restored: false, error: false };
      let draft;
      try {
        draft = JSON.parse(saved);
      } catch (_) {
        window.sessionStorage.removeItem(SEASON_DRAFT_SESSION_KEY);
        return { restored: false, error: true };
      }
      if (!draft || draft.season !== SEASON || !draft.form || typeof draft.form !== "object") {
        window.sessionStorage.removeItem(SEASON_DRAFT_SESSION_KEY);
        return { restored: false, error: true };
      }
      const fields = {
        parentFirstName: "vol-parent-first-name",
        parentLastName: "vol-parent-last-name",
        email: "vol-email",
        phone: "vol-phone",
        studentName: "vol-student-name",
        tabroomUsernameOrEmail: "vol-tabroom-identifier",
        notes: "vol-notes",
      };
      Object.entries(fields).forEach(([key, id]) => {
        if (typeof draft.form[key] === "string" && $(id)) $(id).value = draft.form[key];
      });
      const allowedIds = new Set(SEASON_TOURNAMENTS.map(tournament => tournament.id));
      selectedTournamentIds = new Set(
        Array.isArray(draft.selectedTournamentIds)
          ? draft.selectedTournamentIds.filter(id => allowedIds.has(id))
          : []
      );
      if ($("vol-full-day-commitment")) $("vol-full-day-commitment").checked = draft.fullDayCommitment === true;
      return { restored: true, error: false };
    } catch (error) {
      console.warn("Season signup draft could not be restored from this browser session.", error);
      return { restored: false, error: true };
    }
  }

  function clearSeasonDraft() {
    try {
      window.sessionStorage.removeItem(SEASON_DRAFT_SESSION_KEY);
      return true;
    } catch (error) {
      console.warn("Season signup draft could not be removed from this browser session.", error);
      return false;
    }
  }

  function updateSeasonSelectionCount() {
    const count = $("vol-season-selection-count");
    if (!count) return;
    const number = count.querySelector(".vol-selection-number");
    const copy = count.querySelector(".vol-selection-copy");
    if (number) number.textContent = String(selectedTournamentIds.size);
    if (copy) copy.textContent = `of ${SEASON_TOURNAMENTS.length} tournament dates selected`;
  }

  function renderSeasonTournamentChoices() {
    const root = $("vol-season-tournament-choices");
    if (!root) return;
    root.innerHTML = SEASON_TOURNAMENTS.map((tournament, index) => {
      const physicalAddress = tournament.address.match(/^(.+), ([^,]+), ([A-Z]{2}) \d{5}(?:-\d{4})?$/);
      return `
      <label class="vol-season-tournament-card${selectedTournamentIds.has(tournament.id) ? " is-selected" : ""}" for="vol-season-tournament-${index}">
        <input id="vol-season-tournament-${index}" type="checkbox" name="selectedTournamentIds" value="${escapeHtml(tournament.id)}" ${selectedTournamentIds.has(tournament.id) ? "checked" : ""} aria-label="${escapeHtml(`${tournament.name}, ${tournament.date}, full day 8:00 AM to 5:30 PM`)}">
        <span class="vol-season-card-date">${escapeHtml(tournament.date)}</span>
        <strong>${escapeHtml(tournament.name)}</strong>
        <span class="vol-season-card-venue">
          <span class="vol-season-card-location">${escapeHtml(tournament.location)}</span>
          <span class="vol-season-card-address">${escapeHtml(physicalAddress ? physicalAddress[1] : tournament.address)}</span>
          ${physicalAddress ? `<span class="vol-season-card-city">${escapeHtml(physicalAddress[2])}, ${escapeHtml(physicalAddress[3])}</span>` : ""}
        </span>
        <span class="vol-season-card-hours">8:00 AM – 5:30 PM · Full day</span>
        <span class="vol-season-selected-pill" aria-hidden="true">Selected</span>
      </label>`;
    }).join("");
    root.querySelectorAll("input[name='selectedTournamentIds']").forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) selectedTournamentIds.add(input.value);
        else selectedTournamentIds.delete(input.value);
        input.closest(".vol-season-tournament-card")?.classList.toggle("is-selected", input.checked);
        updateSeasonSelectionCount();
        if (selectedTournamentIds.size) {
          const error = $("vol-season-selection-error");
          if (error) error.hidden = true;
        }
        renderSeasonAvailabilitySummary();
        if (!persistSeasonDraft()) {
          const reminder = $("vol-tabroom-return-reminder");
          if (reminder) reminder.textContent = "This browser session could not save your draft. Keep this tab open until you submit or copy your details elsewhere.";
        }
      });
    });
    updateSeasonSelectionCount();
  }

  function renderSeasonAvailabilitySummary() {
    const summary = $("vol-season-selection-summary");
    if (!summary) return;
    const selected = SEASON_TOURNAMENTS.filter(tournament => selectedTournamentIds.has(tournament.id));
    const count = $("vol-season-summary-count");
    const list = $("vol-season-summary-list");
    if (count) count.textContent = `${selected.length} of ${SEASON_TOURNAMENTS.length} tournament dates selected`;
    if (list) list.innerHTML = selected.length
      ? selected.map(tournament => `<li><span aria-hidden="true">✓</span><svg class="vol-summary-tournament-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#vol-icon-${tournament.name.toLowerCase().includes("online") ? "document" : "school"}"></use></svg><strong>${escapeHtml(tournament.name)}</strong><time datetime="${escapeHtml(tournament.id)}"><svg class="vol-summary-date-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#vol-icon-calendar"></use></svg>${escapeHtml(tournament.date.replace(/^[^,]+, /, ""))}</time></li>`).join("")
      : `<li class="vol-season-summary-empty">Choose at least one date to continue.</li>`;
  }

  function renderSeasonReview() {
    const root = $("vol-review");
    if (!root) return;
    const selected = SEASON_TOURNAMENTS.filter(tournament => selectedTournamentIds.has(tournament.id));
    const parentName = `${$("vol-parent-first-name")?.value.trim() || ""} ${$("vol-parent-last-name")?.value.trim() || ""}`.trim();
    const details = [
      ["Parent / volunteer", parentName, "users"],
      ["Email", $("vol-email")?.value.trim(), "mail"],
      ["Cell phone", $("vol-phone")?.value.trim(), "phone"],
      ["Student / debater", $("vol-student-name")?.value.trim() || "Not provided", "school"],
      ["Tabroom username / email", $("vol-tabroom-identifier")?.value.trim(), "debate"],
      ["Notes for the coach", $("vol-notes")?.value.trim() || "None", "document"],
    ];
    root.innerHTML = `
      <section class="vol-season-review-section">
        <div class="vol-review-card-heading"><span class="vol-review-card-icon vol-review-card-icon--person" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#vol-icon-users"></use></svg></span><div><h4>Your information</h4><p>Review your contact details and Tabroom account.</p></div><button type="button" class="vol-season-edit-selection" data-vol-back="2">Edit your information</button></div>
        <dl>${details.map(([label, value, icon]) => `<div><svg class="vol-review-row-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#vol-icon-${icon}"></use></svg><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "")}</dd></div>`).join("")}</dl>
      </section>
      <section class="vol-season-review-section">
        <div class="vol-season-review-heading">
          <span class="vol-review-card-icon vol-review-card-icon--calendar" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#vol-icon-calendar"></use></svg></span>
          <div><h4>Your full-day tournament commitments</h4><p>${selected.length} of ${SEASON_TOURNAMENTS.length} dates · Available 8:00 AM–5:30 PM for every date listed</p></div>
          <button type="button" class="vol-season-edit-selection" data-vol-back="1">Edit tournament dates</button>
        </div>
        <ul class="vol-season-review-tournaments">${selected.map(tournament => `<li><span aria-hidden="true">✓</span><svg class="vol-review-tournament-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#vol-icon-${tournament.name.toLowerCase().includes("online") ? "document" : "school"}"></use></svg><div><strong>${escapeHtml(tournament.name)}</strong><span><svg class="vol-review-date-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#vol-icon-calendar"></use></svg>${escapeHtml(tournament.date)} · Full day, 8:00 AM–5:30 PM</span></div></li>`).join("")}</ul>
      </section>`;
    const emailCheck = $("vol-review-email-check");
    if (emailCheck) emailCheck.innerHTML = `
      <span class="vol-review-card-icon vol-review-card-icon--mail" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#vol-icon-mail"></use></svg></span>
      <div><strong>Double-check your email address</strong><p>Your season-availability confirmation will be sent to:</p><b class="vol-review-email-pill">${escapeHtml($("vol-email")?.value.trim())}</b></div>`;
  }

  function openSignup({ focus = false } = {}) {
    selectedEvent = null;
    selectedRole = null;
    const form = $("volunteer-signup-form");
    if (!form) return;
    confirmedPdfBlob = null;
    confirmedSignupId = "";
    confirmedTestSubmission = false;
    confirmedRetryToken = "";
    selectedTournamentIds = new Set();
    tabroomLinkOpened = false;
    form.reset();
    const draftStatus = restoreSeasonDraft();
    syncFullDayCommitment();
    form.querySelectorAll(".is-complete").forEach(field => field.classList.remove("is-complete"));
    renderSeasonTournamentChoices();
    renderSeasonAvailabilitySummary();
    if ($("vol-season-selection-error")) $("vol-season-selection-error").hidden = true;
    const tabroomReminder = $("vol-tabroom-return-reminder");
    if (tabroomReminder) {
      tabroomReminder.textContent = draftStatus.restored
        ? "Your saved season draft has been restored in this browser session. If you just created a Tabroom account, enter its username or email before continuing."
        : "After creating an account, return here and enter its username or email to continue.";
    }
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    $("volunteer-modal").style.display = "block";
    $("volunteer-exit-modal").style.display = "none";
    showStep(1, { focus });
    if (draftStatus.error) {
      setStatus("Your saved season draft could not be restored. Please re-enter your information; if you need to update a previous signup, contact a Cooper Debate coach.", true);
    }
  }

  function closeSignup() {
    document.body.classList.remove("vol-modal-open");
    openSignup();
  }

  function hasEnteredSignupData() {
    const enteredData = [
      "vol-parent-first-name",
      "vol-parent-last-name",
      "vol-phone",
      "vol-email",
      "vol-student-name",
      "vol-tabroom-identifier",
      "vol-notes",
    ].some(id => Boolean($(id)?.value.trim()));
    return selectedTournamentIds.size > 0 || $("vol-full-day-commitment")?.checked === true || enteredData;
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

  function renderThankYouEmailStatus(emailStatus) {
    const note = $("vol-thank-you-email-note");
    if (!note) return;
    const accepted = emailStatus === "accepted" || emailStatus === "sent";
    note.querySelector("span").textContent = accepted
      ? "A confirmation email was accepted for delivery. If it does not arrive soon, check your spam or junk folder."
      : emailStatus === "test"
        ? "Test only: no confirmation email or PDF was sent. Download the test PDF below to preview it. The real signup database was not changed."
      : emailStatus === "failed"
        ? "Your season availability was saved, but the confirmation email could not be sent. Please contact the coach if you need a copy."
        : "Your season availability was saved. A confirmation email may take a few minutes to arrive.";
    note.classList.toggle("is-email-delayed", !accepted && emailStatus !== "test");
  }
  function openThankYou(emailStatus) {
    const modal = $("volunteer-thank-you-modal");
    if (!modal) return;
    renderThankYouEmailStatus(emailStatus);
    const editButton = $("vol-thank-you-edit");
    if (editButton) editButton.hidden = false;
    const pdfButton = $("vol-thank-you-test-pdf");
    if (pdfButton) pdfButton.hidden = !confirmedTestSubmission || !isDevelopmentPreview();
    if ($("vol-test-pdf-status")) $("vol-test-pdf-status").textContent = "";
    const preview = $("vol-confirmation-letter-preview");
    if (preview && confirmedLetterPreviewUrl) preview.src = confirmedLetterPreviewUrl;
    modal.style.display = "flex";
    document.body.classList.add("vol-modal-open");
    requestAnimationFrame(() => {
      const card = modal.querySelector(".vol-thank-you-card");
      if (card) card.scrollTop = 0;
      modal.querySelector(".vol-modal-close")?.focus({ preventScroll:true });
    });
  }

  function closeThankYou() {
    const modal = $("volunteer-thank-you-modal");
    if (modal) modal.style.display = "none";
    closeSignup();
    confirmedPdfBlob = null;
    confirmedTestSubmission = false;
    confirmedLetterPreviewUrl = "";
  }

  async function downloadTestSeasonPdf() {
    const button = $("vol-thank-you-test-pdf");
    const status = $("vol-test-pdf-status");
    if (!button || !status || !confirmedTestSubmission || !isDevelopmentPreview() || !confirmedSignupId) return;
    button.disabled = true;
    status.textContent = "Preparing your test PDF…";
    try {
      const response = await fetch(
        `${DEV_SEASON_ENDPOINT}/${encodeURIComponent(confirmedSignupId)}/confirmation.pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            email: $("vol-email").value.trim(),
            phone: $("vol-phone").value.trim(),
            studentName: $("vol-student-name").value.trim(),
            notes: $("vol-notes").value.trim(),
            tabroomUsernameOrEmail: $("vol-tabroom-identifier").value.trim(),
          }),
        }
      );
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error("The test PDF could not be prepared. Please try again.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Cooper_Debate_2026-27_Judge_Availability_TEST.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "Test PDF downloaded. No email was sent.";
    } catch (error) {
      status.textContent = error.message || "The test PDF could not be downloaded. Please try again.";
    } finally {
      button.disabled = false;
    }
  }

  function reopenSeasonAvailability() {
    const thankYou = $("volunteer-thank-you-modal");
    if (thankYou) thankYou.style.display = "none";
    selectVolunteerView("signup");
    $("volunteer-exit-modal").style.display = "none";
    document.body.classList.remove("vol-modal-open");
    showStep(1);
    const selectedDate = $("vol-season-tournament-choices")?.querySelector("input:checked");
    (selectedDate || $("vol-season-tournament-choices")?.querySelector("input"))?.focus({ preventScroll: true });
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (signupSubmitting) return;
    if (wizardStep < 3) {
      if (validateStep(wizardStep)) showStep(wizardStep + 1);
      return;
    }

    const button = $("vol-submit");
    const turnstileToken = window.turnstile && turnstileWidgetId !== null
      ? window.turnstile.getResponse(turnstileWidgetId)
      : "";
    if (!canSubmitSeasonAvailability()) {
      setStatus("This development preview cannot submit season availability. Your information has not been sent or saved.", true);
      return;
    }

    if (!validateStep(1)) {
      showStep(1);
      return;
    }
    if (!validateStep(2)) {
      showStep(2);
      return;
    }
    if (!turnstileToken && !isDevelopmentPreview()) {
      submitPendingTurnstile = true;
      setStatus("Complete the volunteer verification to submit your season availability.", false);
      return;
    }
    submitPendingTurnstile = false;
    const payload = {
      action: "submit-season-availability",
      season: SEASON,
      selectedTournamentIds: SEASON_TOURNAMENTS
        .filter(tournament => selectedTournamentIds.has(tournament.id))
        .map(tournament => tournament.id),
      parentFirstName: $("vol-parent-first-name").value,
      parentLastName: $("vol-parent-last-name").value,
      email: $("vol-email").value,
      phone: $("vol-phone").value,
      studentName: $("vol-student-name").value,
      notes: $("vol-notes").value,
      tabroomUsernameOrEmail: $("vol-tabroom-identifier").value,
      fullDayCommitment: $("vol-full-day-commitment")?.checked === true,
      company: $("vol-company").value,
      turnstileToken,
    };

    signupSubmitting = true;
    button.disabled = true;
    button.textContent = "Submitting season availability…";
    setStatus("");

    try {
      const response = await fetch(seasonSubmissionEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.submissionId) {
        throw new Error(result.error || "Your season availability could not be saved. Please try again or contact the coach.");
      }
      confirmedSignupId = result.submissionId;
      confirmedTestSubmission = result.testSubmission === true;
      confirmedRetryToken = "";
      confirmedRegistrationEmail = payload.email.trim();
      syncWithdrawButton();
      persistSeasonDraft();
      const confirmationMessage = result.testSubmission
        ? `Test submission ${result.updatedExisting ? "updated" : "saved"} in this development preview. This is not a real registration.`
        : result.updatedExisting
          ? "Your season availability has been updated."
          : "Your season availability has been submitted.";
      if ($("vol-thank-you-message")) $("vol-thank-you-message").textContent = confirmationMessage;
      const editNote = $("vol-thank-you-edit-note");
      if (editNote && result.testSubmission) {
        editNote.textContent = "Use the same email address and select every test date you want to keep. Test records disappear when the development server restarts.";
      }
      setStatus(confirmationMessage, false);
      openThankYou(result.emailStatus);
      loadVolunteerEvents().catch(() => {});
    } catch (error) {
      setStatus(error.message || "Unable to save your signup. Please try again.", true);
    } finally {
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      signupSubmitting = false;
      button.disabled = false;
      button.textContent = "Submit season availability";
    }
  }

  async function retryConfirmationEmail() {
    const button = $("vol-retry-email");
    if (!button || !confirmedSignupId || !confirmedRetryToken) return;
    button.disabled = true;
    button.textContent = "Resending…";
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "retry-confirmation-email",
          signupId: confirmedSignupId,
          retryToken: confirmedRetryToken,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to retry the confirmation email.");
      renderThankYouEmailStatus(result.emailStatus);
    } catch (error) {
      renderThankYouEmailStatus("failed");
      const note = $("vol-thank-you-email-note");
      if (note) note.querySelector("span").textContent =
        `${error.message || "The email retry could not be completed."} Your signup is still saved; please try again shortly.`;
    } finally {
      button.disabled = false;
      button.textContent = "Resend Email";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const workspace = $("volunteer-signup-workspace");
    const signup = $("volunteer-modal");
    if (workspace && signup) {
      workspace.appendChild(signup);
      selectVolunteerView("signup");
      openSignup();
    }
    const viewTabs = [...document.querySelectorAll("[data-volunteer-view]")];
    viewTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectVolunteerView(tab.dataset.volunteerView));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0
          : event.key === "End" ? viewTabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + viewTabs.length) % viewTabs.length;
        selectVolunteerView(viewTabs[nextIndex].dataset.volunteerView, true);
      });
    });
    const changeMenu = document.querySelector(".volunteer-change");
    document.addEventListener("pointerdown", event => {
      if (changeMenu?.open && !changeMenu.contains(event.target)) changeMenu.open = false;
    });
    loadVolunteerEvents();
    $("vol-withdraw")?.addEventListener("click", event => {
      if (confirmedRegistrationEmail) openCancellationModal({ trigger: event.currentTarget });
    });
    $("vol-cancel-request-open")?.addEventListener("click", event => {
      openCancellationModal({ trigger: event.currentTarget });
    });
    $("vol-cancel-close")?.addEventListener("click", closeCancellationModal);
    $("vol-cancel-new-link")?.addEventListener("click", () => openCancellationModal());
    $("vol-cancel-modal")?.addEventListener("click", event => {
      if (event.target.id === "vol-cancel-modal") closeCancellationModal();
    });
    $("vol-cancel-request-form")?.addEventListener("submit", requestSeasonCancellation);
    $("vol-cancel-confirm-button")?.addEventListener("click", confirmSeasonCancellation);
    $("vol-cancel-test-link")?.addEventListener("click", () => {
      showSeasonCancellationConfirmation(developmentCancellationToken);
    });
    window.addEventListener("hashchange", readSeasonCancellationLink);
    readSeasonCancellationLink();
    $("volunteer-events")?.addEventListener("click", event => {
      const detailsButton = event.target.closest(".vol-roster-details");
      if (detailsButton) openDetailsModal(detailsButton);
    });
    $("volunteer-signup-form")?.addEventListener("submit", submitSignup);
    $("vol-full-day-commitment")?.addEventListener("change", syncFullDayCommitment);
    $("volunteer-signup-form")?.addEventListener("click", event => {
      const nextButton = event.target.closest("[data-season-next]");
      if (nextButton) {
        if (validateStep(wizardStep)) showStep(Number(nextButton.dataset.seasonNext));
        return;
      }
      const backButton = event.target.closest("[data-vol-back]");
      if (backButton) showStep(Number(backButton.dataset.volBack));
    });
    const phoneField = $("vol-phone");
    const emailField = $("vol-email");
    phoneField?.addEventListener("input", () => {
      phoneField.value = formatPhoneNumber(phoneField.value);
      validatePhoneField(phoneField);
    });
    phoneField?.addEventListener("blur", () => validatePhoneField(phoneField));
    emailField?.addEventListener("input", () => {
      validateEmailField(emailField);
      fitEmailFieldText(emailField);
    });
    emailField?.addEventListener("change", () => fitEmailFieldText(emailField));
    emailField?.addEventListener("blur", () => {
      validateEmailField(emailField);
      fitEmailFieldText(emailField);
    });
    window.addEventListener("resize", () => fitEmailFieldText(emailField));
    document.querySelectorAll("[data-close-volunteer-modal]").forEach(element => {
      element.addEventListener("click", requestCloseSignup);
    });
    $("vol-exit-stay")?.addEventListener("click", hideExitConfirmation);
    $("vol-exit-discard")?.addEventListener("click", () => {
      hideExitConfirmation();
      const removed = clearSeasonDraft();
      if (!removed) {
        const message = $("vol-exit-message");
        if (message) message.textContent = "This browser could not clear the saved draft. Keep editing and try again, or close the browser session to remove session-only data.";
        $("volunteer-exit-modal").style.display = "flex";
        return;
      }
      closeSignup();
    });
    document.querySelectorAll("[data-close-volunteer-thank-you]").forEach(element => {
      element.addEventListener("click", closeThankYou);
    });
    $("vol-thank-you-edit")?.addEventListener("click", reopenSeasonAvailability);
    $("vol-thank-you-test-pdf")?.addEventListener("click", downloadTestSeasonPdf);
    $("vol-create-tabroom-account")?.addEventListener("click", () => {
      tabroomLinkOpened = true;
      const saved = persistSeasonDraft();
      $("vol-tabroom-return-reminder").textContent = saved
        ? "Your current selections and details are saved in this browser session. Tabroom opened in a new tab—return here afterward and enter your account username or email."
        : "This browser could not save a draft. Keep this tab open while you create your Tabroom account, then return here and enter your username or email.";
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && tabroomLinkOpened) {
        $("vol-tabroom-return-reminder").textContent = "Welcome back. Enter the username or email for the Tabroom account you created so the coach can link it to your selected tournaments.";
        $("vol-tabroom-identifier")?.focus({ preventScroll: true });
        tabroomLinkOpened = false;
      }
    });
    document.querySelectorAll("#volunteer-signup-form input, #volunteer-signup-form textarea").forEach(field => {
      const updateCompletion = () => {
        const hasValue = Boolean(field.value.trim());
        field.classList.toggle("is-complete", hasValue && field.checkValidity());
      };
      field.addEventListener("input", updateCompletion);
      field.addEventListener("change", updateCompletion);
      field.addEventListener("blur", updateCompletion);
      const saveDraft = () => {
        if (persistSeasonDraft()) return;
        const reminder = $("vol-tabroom-return-reminder");
        if (reminder) reminder.textContent = "This browser session could not save your draft. Keep this tab open until you submit or copy your details elsewhere.";
      };
      field.addEventListener("input", saveDraft);
      field.addEventListener("change", saveDraft);
    });
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
      if (!$("vol-cancel-modal")?.hidden && event.key === "Tab") {
        const controls = [...$("vol-cancel-modal").querySelectorAll(
          'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), [tabindex="-1"]'
        )].filter(element => element.getClientRects().length && element.tabIndex >= 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (!$("vol-cancel-modal")?.hidden) {
        closeCancellationModal();
        return;
      }
      if ($("volunteer-exit-modal")?.style.display === "flex") hideExitConfirmation();
      else if ($("volunteer-details-modal")?.classList.contains("is-open")) closeDetailsModal();
      else if ($("volunteer-thank-you-modal")?.style.display === "flex") closeThankYou();
      else requestCloseSignup();
    });
    renderTurnstile();
  });
}());
