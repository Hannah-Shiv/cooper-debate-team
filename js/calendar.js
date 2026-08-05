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

// ── On page load ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  calAuth.onAuthStateChanged(user => {
    if (user && isApprovedMember(user.email)) {
      showCalState("loading");
      initCalDashboard(user.email);
    } else if (user) {
      calAuth.signOut();
      window.location.href = "members.html";
    } else {
      // Not signed in — send back to portal login
      window.location.href = "members.html";
    }
  });
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

// ── Firestore: load tournaments ───────────────────────────────
function loadTournaments() {
  calDb.collection("tournaments").orderBy("start").onSnapshot(snap => {
    _tournaments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!calInstance) {
      initFullCalendar();
    } else {
      calInstance.removeAllEvents();
      calInstance.addEventSource(buildFcEvents(_tournaments));
    }
    renderNextBanner();
  }, err => console.warn("tournaments listener:", err.message));
}

// ── Build FullCalendar event objects ──────────────────────────
function buildFcEvents(docs) {
  const events = [];
  docs.forEach(t => {
    const isDeadline = t.type === "deadline";
    events.push({
      id:    t.id,
      title: t.title,
      start: t.start?.toDate ? t.start.toDate() : new Date(t.start),
      end:   t.end?.toDate   ? t.end.toDate()   : (t.end ? new Date(t.end) : null),
      allDay: t.allDay !== false,
      backgroundColor: isDeadline ? "#b45309" : (t.isVirtual ? "#1d4ed8" : "#b30000"),
      borderColor:     isDeadline ? "#d97706" : (t.isVirtual ? "#3b82f6" : "#cc0000"),
      extendedProps:   t,
    });

    // Synthetic entry-deadline event — shown as its own amber chip on the calendar
    if (t.entryDeadline) {
      const dlDate = t.entryDeadline?.toDate ? t.entryDeadline.toDate() : new Date(t.entryDeadline);
      const isPast = dlDate < new Date();
      if (!isPast || _showPastDeadlines) {
        events.push({
          id:              t.id + "__deadline",
          title:           "⚠️ " + t.title + " — Entry Deadline",
          start:           dlDate,
          end:             null,
          allDay:          true,
          backgroundColor: "#b45309",
          borderColor:     "#d97706",
          extendedProps:   t,   // points to parent tournament so its modal opens
        });
      }
    }
  });
  return events;
}

// ── Initialise FullCalendar ───────────────────────────────────
function initFullCalendar() {
  const el = document.getElementById("cal-container");
  if (!el || typeof FullCalendar === "undefined") {
    setTimeout(initFullCalendar, 200);
    return;
  }
  calInstance = new FullCalendar.Calendar(el, {
    initialView:  "dayGridMonth",
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
    eventClick:   info => openEventDetail(info.event),
    eventContent: info => {
      const isDeadlineChip = info.event.id.endsWith("__deadline");
      const viewType = info.view.type;
      const isListView  = viewType.startsWith("list");
      const isWeekGrid  = viewType === "timeGridWeek";

      if (isDeadlineChip && (isListView || isWeekGrid)) {
        // Render a distinct badge + tournament name so the event is scannable
        // without relying on colour alone.
        const parentTitle = calEsc(info.event.extendedProps.title || "");
        return {
          html: `<span class="fc-deadline-chip-badge">⚠ Entry Deadline</span>`
              + `<span class="fc-deadline-chip-title">${parentTitle}</span>`
        };
      }
      // Default rendering for all other events / views
      return true;
    },
    eventDidMount: info => {
      // Soft strikethrough style for past events
      if (info.event.start < new Date()) {
        info.el.style.opacity = "0.55";
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
  const next = upcoming[0];
  const diff  = next.start.toDate() - now;
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const dateStr = next.start.toDate().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
  banner.style.display = "flex";
  banner.innerHTML = `
    <span class="next-label">Next Tournament</span>
    <span class="next-name">${calEsc(next.title)}</span>
    <span class="next-date">${dateStr}</span>
    <span class="next-countdown">${days}d ${hours}h away</span>
  `;
}

// ── Event detail modal ────────────────────────────────────────
function openEventDetail(fcEvent) {
  const t = fcEvent.extendedProps;
  const isEditor = calUserRole === "coach" || calUserRole === "captain";
  const isDeadline = t.type === "deadline";

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

  // Edit button
  const editBtn = isEditor
    ? `<button class="det-edit-btn" onclick="openPostModal('${calEsc(fcEvent.id)}')">✎ Edit</button>`
    : "";

  const typeLabel = isDeadline ? "⚠️ Entry Deadline" : (t.isVirtual ? "🖥 Virtual Tournament" : "🏆 Tournament");
  const accentColor = isDeadline ? "#d97706" : (t.isVirtual ? "#3b82f6" : "#cc0000");

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
  _editingId = editId || null;
  const existing = _editingId ? _tournaments.find(t => t.id === _editingId) : null;

  // Populate form
  document.getElementById("evt-title").value    = existing?.title || "";
  document.getElementById("evt-type").value     = existing?.type  || "tournament";
  document.getElementById("evt-start").value    = existing?.start ? toInputDate(existing.start) : "";
  document.getElementById("evt-end").value      = existing?.end   ? toInputDate(existing.end)   : "";
  document.getElementById("evt-virtual").checked = existing?.isVirtual || false;
  document.getElementById("evt-location").value  = existing?.location || "";
  document.getElementById("evt-deadline").value  = existing?.entryDeadline ? toInputDate(existing.entryDeadline) : "";
  document.getElementById("evt-schedule").value  = existing?.scheduleLink  || "";
  document.getElementById("evt-notes").value     = existing?.notes || "";

  const deleteBtn = document.getElementById("evt-delete-btn");
  if (deleteBtn) deleteBtn.style.display = _editingId ? "inline-flex" : "none";

  document.getElementById("post-modal-title").textContent =
    _editingId ? "✎ Edit Event" : "📅 Post Tournament Event";

  toggleVirtualLabel();
  document.getElementById("post-event-modal").style.display = "flex";
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
  const title    = document.getElementById("evt-title").value.trim();
  const type     = document.getElementById("evt-type").value;
  const startStr = document.getElementById("evt-start").value;
  const endStr   = document.getElementById("evt-end").value;
  const isVirtual = document.getElementById("evt-virtual").checked;
  const location  = document.getElementById("evt-location").value.trim();
  const deadlineStr = document.getElementById("evt-deadline").value;
  const scheduleLink = document.getElementById("evt-schedule").value.trim();
  const notes    = document.getElementById("evt-notes").value.trim();

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
    isVirtual,
    location:  location || null,
    entryDeadline: deadlineStr
      ? firebase.firestore.Timestamp.fromDate(new Date(deadlineStr + "T23:59:59"))
      : null,
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
  if (!confirm("Delete this tournament event? This cannot be undone.")) return;
  try {
    await calDb.collection("tournaments").doc(_editingId).delete();
    closePostModal();
    closeEventDetail();
  } catch (err) {
    alert("Could not delete event: " + err.message);
  }
}
