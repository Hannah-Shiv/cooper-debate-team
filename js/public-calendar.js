/* Public Tournament Calendar — read-only projection of coach-published events. */
(function () {
  "use strict";

  const PUBLIC_SEASON = "2026-27";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    storageBucket: "cooper-debate-team.firebasestorage.app",
    messagingSenderId: "112813790184",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d"
  };

  // These confirmed schedule dates bridge the public calendar until coaches
  // publish matching events from the member calendar. A matching published
  // event wins.
  const KICKOFF_EVENTS = [
    { id:"kickoff-info", title:"Debate Info Session", type:"meeting", start:"2026-09-10T09:35:00-04:00", end:"2026-09-10T10:25:00-04:00", allDay:false, location:"Lecture Hall" },
    { id:"kickoff-fair", title:"Activity Fair · A Session", type:"meeting", start:"2026-09-14T12:00:00Z", allDay:true, location:"" },
    { id:"kickoff-application", title:"Debate Team Applications Due", type:"deadline", start:"2026-09-16T12:00:00Z", allDay:true, location:"" },
    { id:"kickoff-tryouts-1", title:"Debate Team Tryouts", type:"practice", start:"2026-09-22T14:30:00-04:00", end:"2026-09-22T16:30:00-04:00", allDay:false, location:"Cafeteria" },
    { id:"kickoff-tryouts-2", title:"Debate Team Tryouts", type:"practice", start:"2026-09-23T14:30:00-04:00", end:"2026-09-23T16:30:00-04:00", allDay:false, location:"Lecture Hall" },
    { id:"kickoff-parent-meeting", title:"Parent meeting", type:"meeting", start:"2026-09-29T19:30:00-04:00", allDay:false, location:"Google Meet", isVirtual:true },
    { id:"kickoff-judge-training", title:"Parent judge training", type:"meeting", start:"2026-10-03T08:30:00-04:00", end:"2026-10-03T12:00:00-04:00", allDay:false, location:"BASIS Independent McLean" },
    { id:"kickoff-tournament-1", title:"MS PF #1", type:"tournament", start:"2026-10-24T12:00:00Z", allDay:true, location:"Congressional School · Falls Church" },
    { id:"kickoff-tournament-2", title:"MS PF #2 · Cooper hosts", type:"tournament", start:"2026-11-14T12:00:00Z", allDay:true, location:"Cooper Middle School · McLean" },
    { id:"kickoff-tournament-3", title:"MS PF #3", type:"tournament", start:"2026-12-05T12:00:00Z", allDay:true, location:"Longfellow Middle School · McLean" },
    { id:"kickoff-tournament-4", title:"MS PF #4", type:"tournament", start:"2027-01-30T12:00:00Z", allDay:true, location:"Norwood School · Bethesda" },
    { id:"kickoff-tournament-5", title:"PF #5 · Online", type:"tournament", start:"2027-02-20T12:00:00Z", allDay:true, location:"Virtual extravaganza tournament", isVirtual:true },
    { id:"kickoff-metro-finals", title:"Public Forum & Policy Metro Finals", type:"tournament", start:"2027-03-12T12:00:00Z", end:"2027-03-14T12:00:00Z", allDay:true, location:"George C. Marshall · PF one day in person; Policy Friday/Saturday" }
  ].map(event => ({ ...event, season: PUBLIC_SEASON, bootstrap: true }));

  let calendar = null;
  let events = [...KICKOFF_EVENTS];
  let latestPublishedEvents = [];
  let countdownTimer = null;

  const byId = id => document.getElementById(id);
  const esc = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[char]);

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function nyDateKey(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString("en-CA", { timeZone:"America/New_York" }) : "";
  }

  function eventColors(type) {
    if (type === "practice") return { bg:"#166534", text:"#ffffff" };
    if (type === "meeting") return { bg:"#ffd700", text:"#000000" };
    if (type === "deadline") return { bg:"#9a3412", text:"#ffffff" };
    return { bg:"#7f1d1d", text:"#ffffff" };
  }

  function toESTDateStr(date) {
    return date.toLocaleDateString("en-CA", { timeZone:"America/New_York" });
  }

  // Match the private calendar's month view: the event color fills every
  // relevant day cell, including the complete span of multi-day events.
  function colorDayCells(container, start, end, allDay, color, isPast, textColor) {
    let currentKey = nyDateKey(start);
    if (!currentKey) return;
    const nextDayKey = key => {
      const noon = new Date(`${key}T12:00:00Z`);
      noon.setUTCDate(noon.getUTCDate() + 1);
      return noon.toISOString().slice(0, 10);
    };
    let stopKey;
    if (end) {
      stopKey = nyDateKey(end);
      if (!allDay) stopKey = nextDayKey(stopKey);
    } else {
      stopKey = nextDayKey(currentKey);
    }

    while (currentKey < stopKey) {
      const cell = container.querySelector(`td.fc-daygrid-day[data-date="${currentKey}"]`);
      if (cell) {
        cell.style.setProperty("background", color, "important");
        if (isPast) cell.style.setProperty("opacity", "0.6", "important");
        const dateNumber = cell.querySelector(".fc-daygrid-day-number");
        if (dateNumber) dateNumber.style.setProperty("color", textColor, "important");
      }
      currentKey = nextDayKey(currentKey);
    }
  }

  function resetCellColors() {
    const mount = byId("public-calendar");
    if (!mount) return;
    mount.querySelectorAll("td.fc-daygrid-day").forEach(cell => {
      const background = cell.classList.contains("fc-day-today") ? "#173965" : "#102a52";
      cell.style.setProperty("background", background, "important");
      cell.style.removeProperty("opacity");
      const dateNumber = cell.querySelector(".fc-daygrid-day-number");
      if (dateNumber) dateNumber.style.setProperty("color", "#ffffff", "important");
    });
  }

  function hasSavedTimes(event) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(event.startTime || "") &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(event.endTime || "");
  }

  function applyNewYorkTime(baseDate, time) {
    const dateKey = nyDateKey(baseDate);
    if (!dateKey) return toDate(baseDate);
    const asUtc = new Date(`${dateKey}T${time}:00Z`);
    const nyHour = Number(new Intl.DateTimeFormat("en-US", {
      timeZone:"America/New_York",
      hour:"numeric",
      hourCycle:"h23"
    }).format(asUtc));
    return new Date(asUtc.getTime() + (asUtc.getUTCHours() - nyHour) * 3600000);
  }

  function eventStart(event) {
    return hasSavedTimes(event) ? applyNewYorkTime(event.start, event.startTime) : toDate(event.start);
  }

  function eventEnd(event) {
    if (hasSavedTimes(event)) return applyNewYorkTime(event.end || event.start, event.endTime);
    return toDate(event.end);
  }

  function typeLabel(type) {
    return ({
      tournament:"Tournament",
      practice:"Practice",
      meeting:"Meeting",
      deadline:"Deadline"
    })[type] || "Event";
  }

  function currentOrNextMonthDate() {
    const now = new Date();
    const currentMonth = now.toLocaleDateString("en-CA", { timeZone:"America/New_York" }).slice(0, 7);
    const next = events
      .map(event => ({ event, date:eventStart(event) }))
      .filter(item => item.date && item.date > now)
      .sort((a, b) => a.date - b.date)[0];
    return next && nyDateKey(next.date).slice(0, 7) > currentMonth ? next.date : now;
  }

  function publicEventsForSeason() {
    const timestamp = value => value?.toDate ? value.toDate().getTime() : 0;
    const scheduleKey = event => `${event.type || "tournament"}|${nyDateKey(event.start)}`;
    const confirmedByKey = new Map(KICKOFF_EVENTS.map(event => [scheduleKey(event), event]));
    const publishedByDate = new Map();
    latestPublishedEvents.forEach(event => {
      const key = scheduleKey(event);
      const existing = publishedByDate.get(key);
      if (!existing || timestamp(event.updatedAt) >= timestamp(existing.updatedAt)) {
        publishedByDate.set(key, event);
      }
    });
    const publishedEvents = [...publishedByDate.values()].map(event => {
      const confirmed = confirmedByKey.get(scheduleKey(event));
      if (!confirmed) return event;
      return {
        ...event,
        ...confirmed,
        id: event.id,
        countdownTitle: event.title
      };
    });
    const publishedKeys = new Set(publishedEvents.map(scheduleKey));
    const bootstrap = KICKOFF_EVENTS.filter(event => !publishedKeys.has(scheduleKey(event)));
    return [...bootstrap, ...publishedEvents]
      .filter(event => event.season === PUBLIC_SEASON)
      .sort((a, b) => eventStart(a) - eventStart(b));
  }

  function fcEvents() {
    return events.map(event => ({
      ...(() => {
        const colors = eventColors(event.type);
        return {
          backgroundColor: colors.bg,
          borderColor: colors.bg,
          textColor: colors.text
        };
      })(),
      id: event.id,
      title: event.title,
      // FullCalendar's named-time-zone fallback treats Date objects as UTC.
      // Keep the intended wall-clock time for bootstrap events in Agenda view.
      start: event.bootstrap && event.allDay === false && typeof event.start === "string"
        ? event.start.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "")
        : eventStart(event),
      end: event.bootstrap && event.allDay === false && typeof event.end === "string"
        ? event.end.replace(/(?:Z|[+-]\d{2}:\d{2})$/, "")
        : eventEnd(event),
      allDay: !hasSavedTimes(event) && event.allDay !== false,
      classNames: ["public-cal-event", `public-cal-event--${event.type || "event"}`],
      extendedProps: event
    }));
  }

  function setStatus(message, isError) {
    const status = byId("public-calendar-status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function renderCalendar(initial) {
    const mount = byId("public-calendar");
    const empty = byId("public-calendar-empty");
    if (!mount || !empty || typeof FullCalendar === "undefined") return;
    empty.hidden = events.length > 0;
    mount.hidden = events.length === 0;
    if (!events.length) return;

    if (!calendar) {
      const requestedView = new URLSearchParams(window.location.search).get("view");
      const initialCalendarView = requestedView === "agenda" ? "listMonth" : "dayGridMonth";
      calendar = new FullCalendar.Calendar(mount, {
        timeZone: "America/New_York",
        initialView: initialCalendarView,
        initialDate: currentOrNextMonthDate(),
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,listMonth"
        },
        buttonText: { today:"Today", month:"Month", listMonth:"Agenda" },
        height: "auto",
        dayMaxEvents: 3,
        events: fcEvents(),
        eventClick(info) {
          info.jsEvent.preventDefault();
          openEvent(info.event.extendedProps);
        },
        eventContent(info) {
          return { html:`<span class="public-cal-event-title">${esc(info.event.title)}</span>` };
        },
        dayCellDidMount(info) {
          info.el.style.setProperty("background", info.isToday ? "#173965" : "#102a52", "important");
          if (info.isToday) {
            const frame = info.el.querySelector(".fc-daygrid-day-frame");
            if (frame && !frame.querySelector(".public-cal-today-watermark")) {
              const watermark = document.createElement("span");
              watermark.className = "public-cal-today-watermark";
              watermark.textContent = "Today";
              frame.appendChild(watermark);
            }
          }
        },
        eventDidMount(info) {
          if (info.view.type === "listMonth") {
            const timeCell = info.el.querySelector(".fc-list-event-time");
            if (timeCell && info.event.allDay) timeCell.textContent = "All Day";
            return;
          }
          if (info.view.type !== "dayGridMonth") return;
          // FullCalendar normalizes all-day starts to midnight internally.
          // Use the original public event dates so New York all-day events
          // keep their background fill on the same day as their label.
          const publicEvent = info.event.extendedProps;
          const colors = eventColors(publicEvent.type);
          const todayCell = mount.querySelector("td.fc-daygrid-day.fc-day-today");
          if (todayCell) {
            const todayKey = todayCell.getAttribute("data-date");
            const startKey = nyDateKey(eventStart(publicEvent));
            const endKey = info.event.end ? nyDateKey(eventEnd(publicEvent)) : startKey;
            if (todayKey >= startKey && todayKey <= endKey) {
              const watermark = todayCell.querySelector(".public-cal-today-watermark");
              if (watermark) watermark.style.display = "none";
            }
          }
          colorDayCells(
            mount,
            eventStart(publicEvent),
            eventEnd(publicEvent),
            info.event.allDay,
            colors.bg,
            eventStart(publicEvent) < new Date(),
            colors.text
          );
          info.el.style.setProperty("background", "transparent", "important");
          info.el.style.setProperty("border", "none", "important");
          info.el.style.setProperty("box-shadow", "none", "important");
          info.el.style.setProperty("color", colors.text, "important");
        }
      });
      calendar.render();
      // The calendar may be created while its tab is visually hidden. A
      // follow-up size pass keeps the month grid visible on narrow screens.
      requestAnimationFrame(() => calendar.updateSize());
    } else {
      resetCellColors();
      calendar.removeAllEvents();
      calendar.addEventSource(fcEvents());
      if (initial) calendar.gotoDate(currentOrNextMonthDate());
    }
  }

  function renderCountdown() {
    const banner = byId("public-tournament-countdown");
    if (!banner) return;
    const now = new Date();
    const next = events
      .filter(event => event.type === "tournament" && eventStart(event) > now)
      .sort((a, b) => eventStart(a) - eventStart(b))[0];
    if (!next) {
      banner.style.display = "none";
      return;
    }
    const nextStart = eventStart(next);
    const diff = nextStart - now;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const titleParts = (next.countdownTitle || next.title).split(/:\s*/, 2);
    const headline = titleParts[0];
    const resolution = titleParts[1] || "";
    const weekday = nextStart.toLocaleDateString("en-US", { timeZone:"America/New_York", weekday:"long" });
    const month = nextStart.toLocaleDateString("en-US", { timeZone:"America/New_York", month:"short" });
    const day = nextStart.toLocaleDateString("en-US", { timeZone:"America/New_York", day:"numeric" });
    const countdownValue = days > 0 ? days : hours;
    const countdownUnit = days > 0 ? "Days" : "Hours";
    banner.innerHTML = `<div class="public-countdown-label">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M8 14h.01m4 0h.01m4 0h.01m-8 3h.01m4 0h.01"/></svg>
        <span>Upcoming</span><strong>Tournament</strong>
      </div>
      <div class="public-countdown-name">
        <span class="public-countdown-headline">${esc(headline)}</span>
        ${resolution ? `<span class="public-countdown-resolution">${esc(resolution)}</span>` : ""}
      </div>
      <div class="public-countdown-date">
        <span class="public-countdown-weekday">${esc(weekday)}</span>
        <span class="public-countdown-month">${esc(month)}</span>
        <strong class="public-countdown-day">${esc(day)}</strong>
      </div>
      <div class="public-countdown-time">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 5V2"/></svg>
        <strong class="public-countdown-value">${countdownValue}</strong>
        <span class="public-countdown-unit">${countdownUnit}</span>
        <span class="public-countdown-detail">Until tournament</span>
      </div>`;
    banner.style.display = "grid";
  }

  function updateView(resetMonth) {
    events = publicEventsForSeason();
    renderCalendar(resetMonth);
    renderCountdown();
  }

  function formatEventDate(event) {
    const start = eventStart(event);
    const end = eventEnd(event);
    if (!start) return "";
    const options = { timeZone:"America/New_York", weekday:"long", month:"long", day:"numeric", year:"numeric" };
    let text = start.toLocaleDateString("en-US", options);
    if (event.allDay === false || hasSavedTimes(event)) {
      text += ` · ${start.toLocaleTimeString("en-US", { timeZone:"America/New_York", hour:"numeric", minute:"2-digit" })}`;
      if (end) text += `–${end.toLocaleTimeString("en-US", { timeZone:"America/New_York", hour:"numeric", minute:"2-digit" })}`;
    }
    return text;
  }

  function openEvent(event) {
    const modal = byId("public-event-modal");
    if (!modal) return;
    byId("public-event-kind").textContent = typeLabel(event.type);
    byId("public-event-title").textContent = event.title || "Event";
    byId("public-event-date").textContent = `📅 ${formatEventDate(event)}`;
    const location = byId("public-event-location");
    location.textContent = event.isVirtual ? "🖥 Online event" : (event.location ? `📍 ${event.location}` : "");
    location.hidden = !location.textContent;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    byId("public-event-close").focus();
  }

  function closeEvent() {
    const modal = byId("public-event-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function listenForPublishedEvents() {
    if (!window.firebase) {
      setStatus("The public calendar could not start.", true);
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      firebase.firestore().collection("public_calendar_events").orderBy("start")
        .onSnapshot(snapshot => {
          latestPublishedEvents = snapshot.docs.map(doc => ({ id:doc.id, ...doc.data() }));
          updateView(false);
          setStatus("Calendar updates automatically when coaches publish an event.");
        }, error => {
          console.warn("Public calendar feed unavailable:", error.message);
          setStatus("Showing the currently confirmed schedule. Additional events will appear once published.", false);
        });
    } catch (error) {
      console.warn("Public calendar setup failed:", error.message);
      setStatus("Showing the currently confirmed schedule.", false);
    }
  }

  function init() {
    byId("public-event-close")?.addEventListener("click", closeEvent);
    byId("public-event-modal")?.addEventListener("click", event => {
      if (event.target === event.currentTarget) closeEvent();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeEvent();
    });
    window.addEventListener("public-calendar-visible", event => {
      if (event.detail?.visible && calendar) calendar.updateSize();
    });
    updateView(true);
    countdownTimer = window.setInterval(renderCountdown, 60000);
    listenForPublishedEvents();
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once:true })
    : init();
}());