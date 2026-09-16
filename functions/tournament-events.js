"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const EVENT_TYPES = new Set(["external", "internal", "tryout"]);
const TRYOUT_SEASON = "2026-2027";
const TRYOUT_SESSIONS = [
  { id: "tryout-2026-sep22", session: "sep22", date: "2026-09-22", title: "Cooper Debate Tryouts — September 22", location: "Cafeteria" },
  { id: "tryout-2026-sep23", session: "sep23", date: "2026-09-23", title: "Cooper Debate Tryouts — September 23", location: "Lecture Hall" },
];

/**
 * The one-time marker deliberately makes deletion durable: after this migration
 * has completed, an administrator may delete either tournament without this
 * helper silently recreating it.
 */
async function ensureTryoutTournamentModel(db) {
  const markerRef = db.collection("system_migrations").doc("tournament-model-tryouts-2026");
  const eventCollection = db.collection("volunteer_events");
  const signupCollection = db.collection("tryout_signups");
  const scheduleCollection = db.collection("tryout_schedule");
  await db.runTransaction(async transaction => {
    const markerSnap = await transaction.get(markerRef);
    const eventRefs = TRYOUT_SESSIONS.map(item => eventCollection.doc(item.id));
    const eventSnaps = [];
    for (const ref of eventRefs) eventSnaps.push(await transaction.get(ref));
    const ownerRefs = TRYOUT_SESSIONS.map(item =>
      db.collection("tournament_session_owners").doc(`${TRYOUT_SEASON}-${item.session}`)
    );
    const ownerSnaps = [];
    for (const ref of ownerRefs) ownerSnaps.push(await transaction.get(ref));
    const [signupSnap, scheduleSnap] = await Promise.all([
      transaction.get(signupCollection.where("season", "==", TRYOUT_SEASON)),
      transaction.get(scheduleCollection.where("season", "==", TRYOUT_SEASON)),
    ]);
    TRYOUT_SESSIONS.forEach((item, index) => {
      if (eventSnaps[index].exists && !ownerSnaps[index].exists) transaction.set(ownerRefs[index], {
        season: TRYOUT_SEASON, session: item.session, tournamentId: item.id,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
    if (!markerSnap.exists) {
      TRYOUT_SESSIONS.forEach((item, index) => {
        if (!eventSnaps[index].exists) transaction.set(eventRefs[index], {
          title: item.title, date: item.date, location: item.location,
          startTime: "14:30", endTime: "16:30", eventType: "tryout",
          season: TRYOUT_SEASON, partnerSession: item.session,
          partnerSignupsEnabled: true, volunteerSignupsEnabled: false,
          published: true, cancelled: false,
          roles: [{ id: "internal-judge", label: "Internal Judge", description: "Cooper tryout judge", capacity: 1, signedUp: 0 }],
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
      });
      signupSnap.docs.forEach(doc => {
        const data = doc.data();
        const item = TRYOUT_SESSIONS.find(candidate => candidate.session === data.session);
        if (item && data.tournamentId !== item.id) transaction.update(doc.ref, { tournamentId: item.id });
      });
      scheduleSnap.docs.forEach(doc => {
        const data = doc.data();
        const item = TRYOUT_SESSIONS.find(candidate => candidate.session === data.session);
        if (item && data.tournamentId !== item.id) transaction.update(doc.ref, { tournamentId: item.id });
      });
      transaction.set(markerRef, { completedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}

function sanitizeEventType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  return EVENT_TYPES.has(type) ? type : "external";
}

function isPublicVolunteerEvent(event, todayInNewYork) {
  if (!event || event.published !== true || event.cancelled === true) return false;
  // Missing is the legacy/default-enabled value.  Only an explicit false opts out.
  if (event.volunteerSignupsEnabled === false) return false;
  const date = typeof event.date === "string" ? event.date : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayInNewYork;
}

function newYorkCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

module.exports = {
  EVENT_TYPES,
  TRYOUT_SEASON,
  TRYOUT_SESSIONS,
  ensureTryoutTournamentModel,
  sanitizeEventType,
  isPublicVolunteerEvent,
  newYorkCalendarDate,
};