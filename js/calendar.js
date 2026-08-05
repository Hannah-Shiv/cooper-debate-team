// ============================================================
// Cooper Debate Team — Tournament Calendar
// Auth-gated, Firestore-backed, FullCalendar v6
// ============================================================

const CAL_FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
  authDomain:        "cooper-debate-team.firebaseapp.com",
  projectId:         "cooper-debate-team",
  storageBucket:     "cooper-debate-team.firebasestorage.app",
  messagingSenderId: "112813790184",
  appId:             "1:112813790184:web:ac559cb64747d7fd590a5d"
};

firebase.initializeApp(CAL_FIREBASE_CONFIG);
const calAuth = firebase.auth();
const calDb   = firebase.firestore();

calAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ── Session state ─────────────────────────────────────────────
let calUserEmail = "";
let calUserRole  = "member";
let calInstance  = null;
let _tournaments = [];      // raw Firestore docs
let _editingId   = null;    // doc ID being edited (null = new)
let _countdownInterval = null;
let _showPastDeadlines = localStorage.getItem("showPastDeadlines") === "true";  // toggle for past entry-deadline chips

// ── Auth helpers (mirrors members-auth.js; members-auth.js is not loaded here) ──
function isApprovedMember(email) {
  return Array.isArray(APPROVED_MEMBERS) &&
    APPROVED_MEMBERS.some(m => m.toLowerCase() === email.toLowerCase());
}

// ── On page load ─────────────────────────────────────────────
calAuth.onAuthStateChanged(user => {
  try {
    if (user && isApprovedMember(user.email)) {
      showCalState("loading");
      initCalDashboard(user.email);
    } else if (user) {
      calAuth.signOut();
      window.location.href = "members.html";
    } else {
      window.location.href = "members.html";
    }
  } catch (err) {
    console.error("[Calendar] auth callback error:", err);
    window.location.href = "members.html";
  }
});

// ── Helpers ───────────────────────────────────────────────────
function showCalState(name) {
  ["loading", "denied", "dashboard"].forEach(s => {
    const el = document.getElementById("cal-state-" + s);
    if (el) el.style.display = s === name ? (s === "dashboard" ? "block" : "flex") : "none";
  });
}

function calEsc(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Initialise dashboard ──────────────────────────────────────
function initCalDashboard(email) {
  calUserEmail = email.toLowerCase();
  calUserRole  = getAdminRole(email);

  const emailEl = document.getElementById("cal-user-email");
  if (emailEl) emailEl.textContent = email;

  const badgeEl = document.getElementById("cal-role-badge");
  if (badgeEl) {
    if (calUserRole === "coach") {
      badgeEl.textContent = "🛡️ Coach";
      badgeEl.style.cssText += ";background:rgba(212,160,23,0.22);border-color:rgba(212,160,23,0.5);color:var(--gold);";
    } else if (calUserRole === "captain") {
      badgeEl.textContent = "⭐ Captain";
      badgeEl.style.cssText += ";background:rgba(168,85,247,0.15);border-color:rgba(168,85,247,0.4);color:#d8b4fe;";
    }
  }

  // Show post-event button for coach/captain
  const isEditor = calUserRole === "coach" || calUserRole === "captain";
  const postBtn = document.getElementById("post-event-btn");
  if (postBtn && isEditor) postBtn.style.display = "inline-flex";

  showCalState("dashboard");
  loadTournaments();
}

// ── Sign out ──────────────────────────────────────────────────
function calSignOut() {
  calAuth.signOut().then(() => { window.location.href = "members.html"; });
}

// ── Reset all month-view day cells to dark navy ───────────────
// Must be called BEFORE removeAllEvents/addEventSource so that
// stale inline colours from colorDayCells() are wiped first.
function resetAllCellColors() {
  const container = document.getElementById("cal-container");
  if (!container) return;
  container.querySelectorAll("td.fc-daygrid-day").forEach(td => {
    td.style.setProperty("background", "#050e28", "important");
    td.style.removeProperty("opacity");
  });
  // Re-show "Today" watermark — eventDidMount will hide it again if an event still exists
  const wm = container.querySelector(".cal-today-watermark");
  if (wm) wm.style.display = "";
}

// ── Firestore: load tournaments ───────────────────────────────
function loadTournaments() {
  calDb.collection("tournaments").orderBy("start").onSnapshot(snap => {
    _tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!calInstance) {
      initFullCalendar();
    } else {
      resetAllCellColors();          // wipe stale colours before re-render
      calInstance.removeAllEvents();
      calInstance.addEventSource(buildFcEvents(_tournaments));
    }
    renderNextBanner();
  }, err => console.warn("tournaments listener:", err.message));
}

// ── Event colour/time defaults by type ───────────────────────
function evtColors(type) {
  switch (type) {
    case "practice": return { bg: "#65a30d", text: "#000000" };
    case "meeting":  return { bg: "#ffd700", text: "#000000" };
    default:         return { bg: "#991b1b", text: "#ffffff" }; // tournament
  }
}
function evtDefaultTimes(type) {
  switch (type) {
    case "practice": return { start: "14:30", end: "16:30" };
    case "meeting":  return { start: "14:30", end: "15:30" };
    default:         return { start: "08:00", end: "17:00" }; // tournament
  }
}

// ── Color every day cell in a date range (month view) ─────────
// allDay events: FC end is exclusive. Timed events: end day is inclusive.
function colorDayCells(container, evStart, evEnd, evAllDay, color, isPast) {
  const cur = new Date(evStart);
  cur.setHours(0, 0, 0, 0);

  let stop;
  if (evEnd) {
    stop = new Date(evEnd);
    stop.setHours(0, 0, 0, 0);
    if (!evAllDay) stop.setDate(stop.getDate() + 1); // timed: include end day
  } else {
    stop = new Date(cur);
    stop.setDate(stop.getDate() + 1); // single-day fallback
  }

  while (cur < stop) {
    const ds = cur.toISOString().slice(0, 10);
    const cell = container.querySelector(`td.fc-daygrid-day[data-date="${ds}"]`);
    if (cell) {
      cell.style.setProperty("background", color, "important");
      if (isPast) cell.style.setProperty("opacity", "0.6", "important");
    }
    cur.setDate(cur.getDate() + 1);
  }
}

// ── Build FullCalendar event objects ──────────────────────────
function buildFcEvents(docs) {
  const events = [];
  docs.forEach(t => {
    const colors  = evtColors(t.type);

    let startDate = t.start?.toDate ? t.start.toDate() : new Date(t.start);
    let endDate   = t.end?.toDate   ? t.end.toDate()   : (t.end ? new Date(t.end) : null);
    let allDay    = t.allDay !== false;

    // If start/end times are saved, make it a timed event for week/day views.
    if (t.startTime && t.endTime) {
      const [sh, sm] = t.startTime.split(":").map(Number);
      const [eh, em] = t.endTime.split(":").map(Number);
      startDate = new Date(startDate); startDate.setHours(sh, sm, 0, 0);
      const base = endDate ? new Date(endDate) : new Date(startDate);
      base.setHours(eh, em, 0, 0);
      endDate = base;
      allDay  = false;
    }

    events.push({
      id:              t.id,
      title:           t.title,
      start:           startDate,
      end:             endDate,
      allDay:          allDay,
      backgroundColor: colors.bg,
      borderColor:     colors.bg,
      textColor:       colors.text,
      extendedProps:   t,
    });

    // Background event — fills the full column width in week/day views
    if (!allDay && startDate && endDate) {
      events.push({
        id:              t.id + "__bg",
        start:           startDate,
        end:             endDate,
        allDay:          false,
        display:         "background",
        backgroundColor: colors.bg,
        extendedProps:   { _isBg: true },
      });
    }

    // Synthetic entry-deadline chip
    if (t.entryDeadline) {
      const dlDate = t.entryDeadline?.toDate ? t.entryDeadline.toDate() : new Date(t.entryDeadline);
      const isPast = dlDate < new Date();
      if (!isPast || _showPastDeadlines) {
        events.push({
          id:              t.id + "__deadline",
          title:           t.title + " — Entry Deadline",
          start:           dlDate,
          end:             null,
          allDay:          true,
          backgroundColor: "#ffd700",
          borderColor:     "#ffd700",
          textColor:       "#000000",
          extendedProps:   t,
        });
      }
    }
  });
  return events;
}

// ── Initialise FullCalendar ───────────────────────────────────
const VALID_VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listYear"];
const _savedView  = VALID_VIEWS.includes(localStorage.getItem("calLastView"))
  ? localStorage.getItem("calLastView")
  : "dayGridMonth";

function initFullCalendar() {
  const el = document.getElementById("cal-container");
  if (!el || typeof FullCalendar === "undefined") {
    setTimeout(initFullCalendar, 200);
    return;
  }
  calInstance = new FullCalendar.Calendar(el, {
    initialView:  _savedView,
    headerToolbar: {
      left:   "prev,next today",
      center: "title",
      right:  "togglePastDeadlines dayGridMonth,timeGridWeek,timeGridDay,listYear"
    },
    customButtons: {
      togglePastDeadlines: {
        text: "Show past deadlines",
        click() {
          _showPastDeadlines = !_showPastDeadlines;
          localStorage.setItem("showPastDeadlines", _showPastDeadlines);
          // Update button label
          const btn = el.querySelector(".fc-togglePastDeadlines-button");
          if (btn) btn.textContent = _showPastDeadlines ? "Hide past deadlines" : "Show past deadlines";
          // Refresh events
          calInstance.removeAllEvents();
          calInstance.addEventSource(buildFcEvents(_tournaments));
        }
      }
    },
    buttonText: {
      today:        "Today",
      month:        "Month",
      week:         "Week",
      day:          "Day",
      listYear:     "Agenda"
    },
    height:       "auto",
    nowIndicator: true,
    dayMaxEvents: 3,
    events:       buildFcEvents(_tournaments),
    eventClick: info => {
      if (info.event.extendedProps._isBg) return; // background fill — not clickable
      openEventDetail(info.event);
    },
    eventContent: info => {
      if (info.event.extendedProps._isBg) return false; // no content for background events
      const title = calEsc(info.event.title || "");
      return { html: `<span class="cal-evt-title">${title}</span>` };
    },
    dayCellDidMount: info => {
      info.el.style.setProperty("background", "#050e28", "important");
      // Inject "Today" watermark — hidden by eventDidMount if an event lands here
      if (info.isToday) {
        const frame = info.el.querySelector(".fc-daygrid-day-frame");
        if (frame && !frame.querySelector(".cal-today-watermark")) {
          const lbl = document.createElement("div");
          lbl.className = "cal-today-watermark";
          lbl.textContent = "Today";
          frame.appendChild(lbl);
        }
      }
    },
    viewDidMount: info => {
      localStorage.setItem("calLastView", info.view.type);
      // Force dark-navy on column header cells
      setTimeout(() => {
        const hdrs = info.el.querySelectorAll(".fc-col-header-cell");
        hdrs.forEach(th => th.style.setProperty("background", "#1e44a0", "important"));
      }, 0);
    },
    eventDidMount: info => {
      if (info.event.extendedProps._isBg) return; // background fill handled by FC

      const viewType   = info.view.type;
      const isDeadline = info.event.id.endsWith("__deadline");
      // Deadline chips keep yellow; all other events use type-based colors
      const colors     = isDeadline ? { bg: "#ffd700", text: "#000000" }
                                    : evtColors(info.event.extendedProps.type);
      const isPast     = info.event.start < new Date();

      if (viewType === "dayGridMonth") {
        // Hide "Today" watermark if an event falls on today's cell
        const todayCell = document.querySelector("td.fc-daygrid-day.fc-day-today");
        if (todayCell) {
          const wm = todayCell.querySelector(".cal-today-watermark");
          if (wm) wm.style.display = "none";
        }
        // Color every day in the range (handles multi-day tournaments)
        const container = document.getElementById("cal-container");
        colorDayCells(
          container,
          info.event.start,
          info.event.end,
          info.event.allDay,
          colors.bg,
          isPast
        );
        info.el.style.setProperty("background", "transparent", "important");
        info.el.style.setProperty("border",     "none",        "important");
        info.el.style.setProperty("box-shadow", "none",        "important");
        info.el.style.setProperty("color",      colors.text,   "important");

      } else if (viewType === "timeGridWeek" || viewType === "timeGridDay") {
        // Background event fills full column — regular event shows text only
        info.el.style.setProperty("background",   "transparent", "important");
        info.el.style.setProperty("border",       "none",        "important");
        info.el.style.setProperty("box-shadow",   "none",        "important");
        info.el.style.setProperty("color",        colors.text,   "important");
        if (isPast) info.el.style.setProperty("opacity", "0.65", "important");
      }
    }
  });
  calInstance.render();

  // Restore button label to match persisted preference
  if (_showPastDeadlines) {
    const btn = el.querySelector(".fc-togglePastDeadlines-button");
    if (btn) btn.textContent = "Hide past deadlines";
  }
}

// ── Next-tournament banner ─────────────────────────────────────
function renderNextBanner() {
  const banner = document.getElementById("next-tournament-banner");
  if (!banner) return;
  const now = new Date();
  const upcoming = _tournaments
    .filter(t => t.type !== "deadline" && t.start?.toDate && t.start.toDate() > now)
    .sort((a, b) => a.start.toDate() - b.start.toDate());
  if (!upcoming.length) { banner.style.display = "none"; return; }
  const next    = upcoming[0];
  const diff    = next.start.toDate() - now;
  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const dateStr = next.start.toDate().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
  const dayWord  = days === 1 ? "1 day" : `${days} days`;
  const hourWord = hours === 1 ? "1 hour" : `${hours} hours`;
  const countdownText = days > 0 ? `${dayWord} ${hourWord} left` : `${hourWord} left`;
  banner.style.display = "flex";
  banner.innerHTML = `
    <span class="next-trophy">🏆</span>
    <span class="next-label">Next Tournament</span>
    <span class="next-name">${calEsc(next.title)}</span>
    <span class="next-date">📅 ${dateStr}</span>
    <span class="next-countdown">⏱ ${countdownText}</span>
  `;
}

// ── Event detail modal ────────────────────────────────────────
function openEventDetail(fcEvent) {
  const t = fcEvent.extendedProps;
  const isEditor = calUserRole === "coach" || calUserRole === "captain";
  // Deadline chips have id ending in __deadline; extendedProps point to the parent tournament
  const isDeadline = fcEvent.id.endsWith("__deadline");

  const start  = fcEvent.start || (t.start?.toDate ? t.start.toDate() : new Date(t.start));
  const end    = fcEvent.end   || (t.end?.toDate   ? t.end.toDate()   : null);

  const fmtDate = d => d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  const fmtTime = d => d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });

  let dateHtml = fmtDate(start);
  if (end && end.toDateString() !== start.toDateString()) {
    dateHtml += ` – ${fmtDate(end)}`;
  } else if (!t.allDay && !isDeadline) {
    dateHtml += ` at ${fmtTime(start)}`;
  }
  if (!isDeadline && (t.startTime || t.endTime)) {
    const fmt12 = s => {
      if (!s) return "";
      const [h, m] = s.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12  = h % 12 || 12;
      return `${h12}:${String(m).padStart(2,"0")} ${ampm} EST`;
    };
    if (t.startTime && t.endTime) {
      dateHtml += ` &nbsp;·&nbsp; ${fmt12(t.startTime)} – ${fmt12(t.endTime)}`;
    } else if (t.startTime) {
      dateHtml += ` &nbsp;·&nbsp; Starts ${fmt12(t.startTime)}`;
    }
  }

  // Countdown
  const now  = new Date();
  const diff = start - now;
  let countdownHtml = "";
  if (diff > 0) {
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    countdownHtml = `<div class="det-countdown">⏳ ${days} day${days!==1?"s":""}, ${hours} hour${hours!==1?"s":""} away</div>`;
  } else {
    countdownHtml = `<div class="det-countdown past">✓ Already passed</div>`;
  }

  // Location block
  let locationHtml = "";
  if (t.isVirtual) {
    locationHtml = `
      <div class="det-section">
        <div class="det-section-label">Location</div>
        <div class="det-virtual-badge">🖥 Online</div>
        ${t.location ? `<a class="det-link-btn" href="${calEsc(t.location)}" target="_blank" rel="noopener">Join Meeting →</a>` : ""}
      </div>`;
  } else if (t.location) {
    const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(t.location)}&output=embed`;
    locationHtml = `
      <div class="det-section">
        <div class="det-section-label">Location</div>
        <div class="det-address">${calEsc(t.location)}</div>
        <iframe class="det-map"
          src="${mapSrc}"
          loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>
        <div class="det-directions-row">
          <input class="det-from-input" id="det-from-input" type="text" placeholder="Your starting address…"/>
          <button class="det-dir-btn" onclick="openDirections('${calEsc(t.location).replace(/'/g,"\\'")}')">Get Directions →</button>
        </div>
      </div>`;
  }

  // Entry deadline
  let deadlineHtml = "";
  if (t.entryDeadline) {
    const dl    = t.entryDeadline?.toDate ? t.entryDeadline.toDate() : new Date(t.entryDeadline);
    const dlDiff = dl - now;
    const dlDays = Math.floor(dlDiff / 86400000);
    const dlHrs  = Math.floor((dlDiff % 86400000) / 3600000);
    const dlStr  = fmtDate(dl);
    const dlCount = dlDiff > 0
      ? `${dlDays}d ${dlHrs}h left`
      : "Passed";
    deadlineHtml = `
      <div class="det-section">
        <div class="det-section-label">Entry Deadline</div>
        <div class="det-deadline-row">
          <span class="det-deadline-date">⚠️ ${dlStr}</span>
          <span class="det-deadline-count ${dlDiff <= 0 ? 'past' : ''}">${dlCount}</span>
        </div>
      </div>`;
  }

  // Schedule link
  let scheduleHtml = "";
  if (t.scheduleLink) {
    scheduleHtml = `
      <div class="det-section">
        <a class="det-link-btn" href="${calEsc(t.scheduleLink)}" target="_blank" rel="noopener">📋 View Round Schedule →</a>
      </div>`;
  }

  // Notes
  let notesHtml = "";
  if (t.notes) {
    notesHtml = `
      <div class="det-section">
        <div class="det-section-label">Notes</div>
        <div class="det-notes">${calEsc(t.notes)}</div>
      </div>`;
  }

  // Google Calendar link
  const gcLink = buildGcalLink(t, start, end);

  // Edit + Delete buttons (coaches/captains only)
  const editTargetId = fcEvent.id.replace(/__deadline$/, "");
  const editBtn = isEditor
    ? `<button class="det-edit-btn" onclick="openPostModal('${calEsc(editTargetId)}')">✎ Edit</button>`
    : "";
  // Deadline chips are synthetic — deleting them would remove the whole parent
  // tournament, which is confusing. Only show Delete on actual events.
  const deleteBtn = (isEditor && !isDeadline)
    ? `<button class="det-delete-btn" onclick="deleteEventFromDetail('${calEsc(editTargetId)}','${calEsc(t.title)}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        Delete
      </button>`
    : "";

  const typeLabel = isDeadline  ? "⚠️ Entry Deadline"
    : t.type === "practice"     ? "🟢 Practice"
    : t.type === "meeting"      ? "📋 Meeting"
    : (t.isVirtual ? "🖥 Tournament (Virtual)" : "🏆 Tournament");
  const accentColor = isDeadline ? "#b45309"
    : t.type === "practice"     ? "#65a30d"
    : t.type === "meeting"      ? "#b45309"
    : "#cc0000";

  document.getElementById("det-modal-body").innerHTML = `
    <div class="det-type-badge" style="background:${accentColor}22;color:${accentColor};border-color:${accentColor}55">${typeLabel}</div>
    <h2 class="det-title">${calEsc(t.title)}</h2>
    <div class="det-date">${dateHtml}</div>
    ${countdownHtml}
    ${locationHtml}
    ${deadlineHtml}
    ${scheduleHtml}
    ${notesHtml}
    <div class="det-footer">
      ${deleteBtn}
      <a class="det-gcal-btn" href="${gcLink}" target="_blank" rel="noopener">+ Add to Google Calendar</a>
      ${editBtn}
    </div>
  `;

  document.getElementById("det-modal").style.display = "flex";
}

function closeEventDetail() {
  document.getElementById("det-modal").style.display = "none";
}

function openDirections(destination) {
  const from = (document.getElementById("det-from-input")?.value || "").trim();
  const url  = from
    ? `https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(destination)}`
    : `https://www.google.com/maps/search/${encodeURIComponent(destination)}`;
  window.open(url, "_blank", "noopener");
}

function buildGcalLink(t, start, end) {
  const fmt = d => {
    // allDay events: YYYYMMDD; timed events: YYYYMMDDTHHmmssZ
    if (t.allDay !== false) {
      return d.toISOString().slice(0, 10).replace(/-/g, "");
    }
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  const s = fmt(start);
  const e = fmt(end || new Date(start.getTime() + 86400000));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(t.title)}` +
    `&dates=${s}/${e}` +
    `&details=${encodeURIComponent(t.notes || "")}` +
    `&location=${encodeURIComponent(t.location || "")}`;
}

// ── Post / Edit event modal ───────────────────────────────────
function openPostModal(editId) {
  // Strip __deadline suffix so we always look up the parent tournament
  _editingId = editId ? editId.replace(/__deadline$/, "") : null;
  const existing = _editingId ? _tournaments.find(t => t.id === _editingId) : null;

  const type = existing?.type || "tournament";
  const defaults = evtDefaultTimes(type);

  // Populate form
  document.getElementById("evt-title").value      = existing?.title || "";
  document.getElementById("evt-type").value       = type;
  document.getElementById("evt-start").value      = existing?.start ? toInputDate(existing.start) : "";
  document.getElementById("evt-end").value        = existing?.end   ? toInputDate(existing.end)   : "";
  document.getElementById("evt-start-time").value = existing?.startTime || defaults.start;
  document.getElementById("evt-end-time").value   = existing?.endTime   || defaults.end;
  document.getElementById("evt-virtual").checked  = existing?.isVirtual || false;
  document.getElementById("evt-location").value   = existing?.location || "";
  document.getElementById("evt-schedule").value   = existing?.scheduleLink  || "";
  document.getElementById("evt-notes").value      = existing?.notes || "";

  const deleteBtn = document.getElementById("evt-delete-btn");
  if (deleteBtn) deleteBtn.style.display = _editingId ? "inline-flex" : "none";

  document.getElementById("post-modal-title").textContent =
    _editingId ? "✎ Edit Event" : "📅 Post Event";

  toggleVirtualLabel();
  document.getElementById("post-event-modal").style.display = "flex";
}

// Auto-fill default times when event type changes
function onTypeChange() {
  const type     = document.getElementById("evt-type").value;
  const defaults = evtDefaultTimes(type);
  // Only overwrite if user hasn't already set custom times
  const startEl = document.getElementById("evt-start-time");
  const endEl   = document.getElementById("evt-end-time");
  startEl.value = defaults.start;
  endEl.value   = defaults.end;
}

function closePostModal() {
  document.getElementById("post-event-modal").style.display = "none";
  _editingId = null;
}

function toggleVirtualLabel() {
  const isVirtual = document.getElementById("evt-virtual").checked;
  const locLabel  = document.getElementById("evt-location-label");
  if (locLabel) locLabel.textContent = isVirtual ? "Meeting Link (optional)" : "Venue Address (optional)";
}

function toInputDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}

async function saveEvent() {
  const title     = document.getElementById("evt-title").value.trim();
  const type      = document.getElementById("evt-type").value;
  const startStr  = document.getElementById("evt-start").value;
  const endStr    = document.getElementById("evt-end").value;
  const startTime = document.getElementById("evt-start-time").value || "08:00";
  const endTime   = document.getElementById("evt-end-time").value   || "16:30";
  const isVirtual = document.getElementById("evt-virtual").checked;
  const location  = document.getElementById("evt-location").value.trim();
  const scheduleLink = document.getElementById("evt-schedule").value.trim();
  const notes     = document.getElementById("evt-notes").value.trim();

  if (!title || !startStr) {
    alert("Event title and start date are required.");
    return;
  }

  const startDate = new Date(startStr + "T00:00:00");
  const endDate   = endStr ? new Date(endStr + "T23:59:59") : null;

  const data = {
    title,
    type,
    start:     firebase.firestore.Timestamp.fromDate(startDate),
    end:       endDate ? firebase.firestore.Timestamp.fromDate(endDate) : null,
    allDay:    true,
    startTime,
    endTime,
    isVirtual,
    location:  location || null,
    scheduleLink: scheduleLink || null,
    notes:     notes || null,
    postedBy:  calUserEmail,
    postedByRole: calUserRole,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const saveBtn = document.getElementById("evt-save-btn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    if (_editingId) {
      await calDb.collection("tournaments").doc(_editingId).update(data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await calDb.collection("tournaments").add(data);
    }
    closePostModal();
    closeEventDetail();
  } catch (err) {
    alert("Could not save event: " + err.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Event"; }
  }
}

async function deleteEvent() {
  if (!_editingId) return;
  if (!confirm("Delete this event? This cannot be undone.")) return;
  try {
    await calDb.collection("tournaments").doc(_editingId).delete();
    closePostModal();
    closeEventDetail();
  } catch (err) {
    alert("Could not delete event: " + err.message);
  }
}

// Delete directly from the detail modal (no edit modal needed)
async function deleteEventFromDetail(eventId, eventTitle) {
  if (!eventId) return;
  const label = eventTitle ? `"${eventTitle}"` : "this event";
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    await calDb.collection("tournaments").doc(eventId).delete();
    closeEventDetail();
    // Snapshot listener will call resetAllCellColors() + re-render automatically
  } catch (err) {
    alert("Could not delete event: " + err.message);
  }
}
