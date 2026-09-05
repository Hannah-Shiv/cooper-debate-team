// Cooper Debate Team — Cloud Function
// Triggered when a new announcement or tournament is added to Firestore.
// Sends an FCM push notification to every registered device token.

const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest }         = require("firebase-functions/v2/https");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { initializeApp }     = require("firebase-admin/app");
const { getAuth }           = require("firebase-admin/auth");
const { getMessaging }      = require("firebase-admin/messaging");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret }      = require("firebase-functions/params");
const crypto = require("node:crypto");
const { createVolunteerEmailService } = require("./volunteer-email");
const { createApplicationEmailService } = require("./application-email");
const { createTryoutBoardHandler } = require("./tryout-board");

initializeApp();

exports.tryoutBoard = onRequest(
  { region: "us-central1", cors: true },
  createTryoutBoardHandler({
    db: getFirestore(),
    clientAddress: submissionClientAddress,
  })
);

/**
 * Fetches all FCM tokens from Firestore, sends a multicast notification,
 * and deletes any tokens that FCM reports as stale/invalid.
 *
 * @param {string} title  - Notification title.
 * @param {string} body   - Notification body.
 * @param {string} link   - URL opened when the notification is tapped.
 * @param {string[]} [skipTokensForEmails=[]] - Lower-cased email addresses
 *        whose tokens should be excluded from this send (e.g. the author).
 */
async function sendToAllTokens(title, body, link, skipTokensForEmails = []) {
  const db = getFirestore();

  const tokensSnap = await db.collection("fcm-tokens").get();
  if (tokensSnap.empty) return;

  const tokens = [];
  tokensSnap.forEach(doc => {
    if (skipTokensForEmails.includes(doc.id.toLowerCase())) return;
    const t = doc.data().token;
    if (t) tokens.push(t);
  });

  if (tokens.length === 0) return;

  let response;
  try {
    response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        notification: {
          icon:  "https://cooperdebateteam.com/images/cooper-debate-badge.png",
          badge: "https://cooperdebateteam.com/images/cooper-debate-badge.png",
          requireInteraction: false,
        },
        fcm_options: { link },
      },
    });
  } catch (err) {
    console.error(
      "sendToAllTokens: sendEachForMulticast threw an unhandled error.",
      {
        errorCode:    err && err.code,
        errorMessage: err && err.message,
        title,
        tokenCount:   tokens.length,
      }
    );
    return; // Gracefully exit without crashing the Cloud Function
  }

  // Clean up stale/invalid tokens
  const staleTokens = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error && resp.error.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        staleTokens.push(tokens[idx]);
      }
    }
  });

  if (staleTokens.length > 0) {
    const batch = db.batch();
    const affectedEmails = [];
    tokensSnap.forEach(doc => {
      if (staleTokens.includes(doc.data().token)) {
        affectedEmails.push(doc.id); // doc.id is the member's email
        batch.delete(doc.ref);
      }
    });
    await batch.commit();

    // Log a notification-errors record so the coach can see who lost their token
    await db.collection("notification-errors").add({
      emails:      affectedEmails,
      count:       affectedEmails.length,
      trigger:     title,   // which notification exposed the stale token
      detectedAt:  FieldValue.serverTimestamp(),
    });
  }
}

exports.notifyOnAnnouncement = onDocumentCreated(
  "announcements/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const data = snap.data();
    if (!data) return null;

    const postedBy = (data.postedBy || "").toLowerCase();

    const bodyText = data.details
      ? data.details.substring(0, 100)
      : "Tap to open the Members Portal.";

    await sendToAllTokens(
      `Cooper Debate — ${data.category || "General"}`,
      `${data.title}: ${bodyText}`,
      "https://cooperdebateteam.com/members.html",
      postedBy ? [postedBy] : []
    );

    return null;
  }
);

exports.notifyOnTournament = onDocumentCreated(
  "tournaments/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const data = snap.data();
    if (!data) return null;

    // Distinguish tournament events from entry deadlines
    const isDeadline = (data.type || "").toLowerCase().includes("deadline");
    const eventKind  = isDeadline ? "Entry Deadline" : "Tournament";

    // Build a human-readable date string from the start field (Firestore Timestamp)
    // Fall back to data.date for any legacy documents that use the older field name.
    let dateStr = "";
    const rawDate = data.start || data.date;
    if (rawDate) {
      try {
        const d = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
        dateStr = " — " + d.toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
      } catch (_) { /* ignore parse errors */ }
    }

    const name     = data.name || data.title || "New event";
    const bodyText = `${name}${dateStr}`;

    await sendToAllTokens(
      `Cooper Debate — ${eventKind}`,
      bodyText,
      "https://cooperdebateteam.com/members.html"
    );

    return null;
  }
);

// ── Public calendar projection ─────────────────────────────────
// Keep the public site on a deliberately narrow collection. Member event
// notes, schedule links, member names, and editor metadata never leave the
// private `tournaments` collection.
function publicCalendarSeason(start) {
  const date = start && typeof start.toDate === "function" ? start.toDate() : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  if (!year || !month) return "";
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function publicCalendarEvent(data) {
  if (!data || data.isPublic !== true || !data.start || !data.title) return null;
  const season = publicCalendarSeason(data.start);
  if (!season) return null;
  return {
    title:     cleanText(data.title, 300),
    type:      ["tournament", "practice", "meeting", "deadline"].includes(data.type) ? data.type : "tournament",
    start:     data.start,
    end:       data.end || null,
    allDay:    data.allDay !== false,
    startTime: cleanTime(data.startTime),
    endTime:   cleanTime(data.endTime),
    isVirtual: data.isVirtual === true,
    location:  cleanText(data.location, 200),
    season,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function syncPublicCalendarEvent(id, data) {
  const target = getFirestore().collection("public_calendar_events").doc(id);
  const publicEvent = publicCalendarEvent(data);
  if (!publicEvent) {
    await target.delete();
    return null;
  }
  await target.set(publicEvent, { merge: true });
  return null;
}

exports.syncPublicCalendarOnCreate = onDocumentCreated(
  "tournaments/{docId}",
  async event => syncPublicCalendarEvent(event.params.docId, event.data?.data())
);

exports.syncPublicCalendarOnUpdate = onDocumentUpdated(
  "tournaments/{docId}",
  async event => syncPublicCalendarEvent(event.params.docId, event.data?.after?.data())
);

exports.removePublicCalendarOnDelete = onDocumentDeleted(
  "tournaments/{docId}",
  async event => getFirestore().collection("public_calendar_events").doc(event.params.docId).delete()
);

// ── Public tournament volunteer signup ─────────────────────────
// The browser receives only published event details, role availability, and
// the parent/debater names and availability that families have agreed to show.
// Contact details remain coach-only; writes are validated with the Admin SDK.
const COACH_EMAILS = new Set([
  "pgkonde@fcps.edu",
  "1806950@fcpsschools.net",
]);

async function hasFullAdminAccess(email) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) return false;
  const membership = await getFirestore().collection("portal_members").doc(normalizedEmail).get();
  if (!membership.exists) return COACH_EMAILS.has(normalizedEmail);
  const data = membership.data() || {};
  return data.active === true &&
    (COACH_EMAILS.has(normalizedEmail) || ["coach", "website-admin"].includes(data.role));
}
const turnstileSecret = defineSecret("TURNSTILE_SECRET_KEY");
const resendSecret = defineSecret("RESEND_API_KEY");
const applicationSheetSyncSecret = defineSecret("APPLICATION_SHEET_SYNC_SECRET");
const TURNSTILE_HOSTNAMES = new Set([
  "cooperdebateteam.com",
  "www.cooperdebateteam.com",
]);
const APPLICATION_ORIGINS = new Set([
  "https://cooperdebateteam.com",
  "https://www.cooperdebateteam.com",
]);
const volunteerEmail = createVolunteerEmailService({
  db: getFirestore(),
  resendSecret,
});
const applicationEmail = createApplicationEmailService({
  db: getFirestore(),
  resendSecret,
  coachEmails: [...COACH_EMAILS],
});

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(phone) {
  return String(phone || "").replace(/\D/g, "").length === 10;
}

function cleanEmail(value) {
  return cleanText(value, 160).toLowerCase();
}

function sameSecret(expected, received) {
  if (!expected || !received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function volunteerRetryTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function applicationContentHash(application) {
  return crypto.createHash("sha256").update(JSON.stringify(application)).digest("hex");
}

function submissionClientAddress(req) {
  const forwarded = cleanText(req.headers["x-forwarded-for"], 512);
  // Google proxies append the observed caller address to the forwarding chain.
  // Prefer that final value instead of trusting an arbitrary caller-supplied prefix.
  return (forwarded ? forwarded.split(",").at(-1) : req.ip || "").trim();
}

async function reserveApplicationRateLimit(db, req) {
  const fingerprint = crypto.createHash("sha256")
    .update(submissionClientAddress(req) || "unknown")
    .digest("hex");
  const reference = db.collection("application_submission_limits").doc(fingerprint);
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    const data = existing.exists ? existing.data() : {};
    const startedAtMs = Number(data.windowStartedAtMs) || now;
    const inWindow = now - startedAtMs < windowMs;
    const count = inWindow ? Number(data.count || 0) : 0;
    if (count >= 3) {
      throw new Error("Please wait a few minutes before submitting another application.");
    }
    transaction.set(reference, {
      count: count + 1,
      windowStartedAtMs: inWindow ? startedAtMs : now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function emailRetryAt(attemptCount) {
  const baseDelayMs = 15 * 60 * 1000;
  const cappedAttempt = Math.max(0, Math.min(5, Number(attemptCount) || 0));
  return Timestamp.fromMillis(Date.now() + baseDelayMs * (2 ** cappedAttempt));
}

function normalizeApplication(body) {
  const source = body && typeof body.application === "object" && body.application
    ? body.application
    : {};
  const studentSource = source.student && typeof source.student === "object" ? source.student : {};
  const parentSource = source.parent && typeof source.parent === "object" ? source.parent : {};
  const commitmentSource = source.commitments && typeof source.commitments === "object" ? source.commitments : {};
  const eventSource = source.eventDetails && typeof source.eventDetails === "object" ? source.eventDetails : {};
  const answerSource = source.answers && typeof source.answers === "object" ? source.answers : {};
  const studentId = cleanText(studentSource.studentId, 64);
  const student = {
    firstName: cleanText(studentSource.firstName, 60),
    lastName: cleanText(studentSource.lastName, 60),
    grade: cleanText(studentSource.grade, 24),
    studentId,
    schoolEmail: studentId ? `${studentId}@fcpsschools.net` : "",
    personalEmail: cleanEmail(studentSource.personalEmail),
    debateExperience: cleanText(studentSource.debateExperience, 200),
    partner: cleanText(studentSource.partner, 180),
  };
  const parent = {
    firstName: cleanText(parentSource.firstName, 60),
    lastName: cleanText(parentSource.lastName, 60),
    email: cleanEmail(parentSource.email),
    phone: cleanText(parentSource.phone, 40),
    relationship: cleanText(parentSource.relationship, 32),
  };
  const commitments = {
    tuesdayMeetings: commitmentSource.tuesdayMeetings === true,
    saturdayTournaments: commitmentSource.saturdayTournaments === true,
    partnerCommitment: commitmentSource.partnerCommitment === true,
    researchPreparation: commitmentSource.researchPreparation === true,
    teamFee: commitmentSource.teamFee === true,
    judgeVolunteer: commitmentSource.judgeVolunteer === true,
    transportation: commitmentSource.transportation === true,
    googleMeets: commitmentSource.googleMeets === true,
    etiquette: commitmentSource.etiquette === true,
  };
  const tournamentDateLabels = new Map([
    ["October 24th", "October 24th, 2026"],
    ["November 14th", "November 14th, 2026"],
    ["December 5th", "December 5th, 2026"],
    ["January 30th", "January 30th, 2027"],
    ["February 20th", "February 20th, 2027"],
  ]);
  const allowedTournamentDates = new Set(tournamentDateLabels.values());
  const tournamentDates = [...new Set((Array.isArray(eventSource.tournamentDates) ? eventSource.tournamentDates : [])
    .map(value => cleanText(value, 40))
    .map(value => tournamentDateLabels.get(value) || value)
    .filter(value => allowedTournamentDates.has(value)))];
  const eventDetails = {
    qstSession: cleanText(eventSource.qstSession, 40),
    september22Attendance: cleanText(eventSource.september22Attendance, 8),
    september23Attendance: cleanText(eventSource.september23Attendance, 8),
    tournamentDates,
    tabroomAccount: cleanText(eventSource.tabroomAccount, 80),
    contractAgreement: cleanText(eventSource.contractAgreement, 8),
    contractReturn: cleanText(eventSource.contractReturn, 8),
  };
  const answers = {
    whyJoin: cleanText(answerSource.whyJoin, 2500),
    experienceDetail: cleanText(answerSource.experienceDetail, 1800),
    scheduleConflicts: cleanText(answerSource.scheduleConflicts, 1800),
    anythingElse: cleanText(answerSource.anythingElse, 1600),
    questionsForCoach: cleanText(answerSource.questionsForCoach, 1800),
  };
  const application = {
    season: "2026-2027",
    student,
    parent,
    commitments,
    eventDetails,
    answers,
    parentAgreement: source.parentAgreement === true,
    parentSignature: cleanText(source.parentSignature, 120),
  };

  if (
    !student.firstName || !student.lastName || !student.studentId || !student.partner ||
    !["7th Grade", "8th Grade"].includes(student.grade) ||
    !validEmail(student.schoolEmail) || !student.schoolEmail.endsWith("@fcpsschools.net") ||
    !validEmail(student.personalEmail) || student.personalEmail.endsWith("@fcpsschools.net") ||
    !parent.firstName || !parent.lastName || !validEmail(parent.email) || !parent.phone ||
    !["Mother", "Father", "Guardian", "Other"].includes(parent.relationship) ||
    !["Yes", "No / Already Passed"].includes(eventDetails.qstSession) ||
    !["Yes", "No"].includes(eventDetails.september22Attendance) ||
    !["Yes", "No"].includes(eventDetails.september23Attendance) ||
    eventDetails.tournamentDates.length < 3 ||
    !["Yes", "No", "I don't have a home or personal email", "I already have one"].includes(eventDetails.tabroomAccount) ||
    !["Yes", "No"].includes(eventDetails.contractAgreement) ||
    !["Yes", "No"].includes(eventDetails.contractReturn) ||
    (student.debateExperience === "Other experience" && !answers.experienceDetail) ||
    !answers.whyJoin || !answers.questionsForCoach || !application.parentSignature || !application.parentAgreement ||
    Object.values(commitments).some(confirmed => !confirmed)
  ) {
    throw new Error("Please complete every required application field before submitting.");
  }
  return application;
}

function normalizeSheetApplication(source) {
  const applicationSource = source && typeof source === "object" ? source : {};
  const studentSource = applicationSource.student && typeof applicationSource.student === "object"
    ? applicationSource.student
    : {};
  const commitmentSource = applicationSource.commitments && typeof applicationSource.commitments === "object"
    ? applicationSource.commitments
    : {};
  const eventSource = applicationSource.eventDetails && typeof applicationSource.eventDetails === "object"
    ? applicationSource.eventDetails
    : {};
  const answerSource = applicationSource.answers && typeof applicationSource.answers === "object"
    ? applicationSource.answers
    : {};
  const schoolEmail = cleanEmail(studentSource.schoolEmail);
  const responseEmail = cleanEmail(studentSource.responseEmail);
  const gradeText = cleanText(studentSource.grade, 40);
  const grade = /\b7(th)?\b/i.test(gradeText)
    ? "7th Grade"
    : /\b8(th)?\b/i.test(gradeText)
      ? "8th Grade"
      : gradeText;
  const tournamentDateLabels = new Map([
    ["October 24th", "October 24th, 2026"],
    ["November 14th", "November 14th, 2026"],
    ["December 5th", "December 5th, 2026"],
    ["January 30th", "January 30th, 2027"],
    ["February 20th", "February 20th, 2027"],
  ]);
  const allowedTournamentDates = new Set(tournamentDateLabels.values());
  const tournamentDates = [...new Set((Array.isArray(eventSource.tournamentDates)
    ? eventSource.tournamentDates
    : [])
    .map(value => cleanText(value, 80))
    .map(value => tournamentDateLabels.get(value) || value)
    .filter(value => allowedTournamentDates.has(value)))];
  const studentId = cleanText(studentSource.studentId, 64) ||
    (schoolEmail.endsWith("@fcpsschools.net") ? schoolEmail.split("@")[0] : "");
  const student = {
    firstName: cleanText(studentSource.firstName, 60),
    lastName: cleanText(studentSource.lastName, 60),
    grade,
    studentId,
    schoolEmail,
    responseEmail,
    personalEmail: responseEmail && !responseEmail.endsWith("@fcpsschools.net") ? responseEmail : "",
    debateExperience: cleanText(studentSource.debateExperience, 1800),
    partner: cleanText(studentSource.partner, 500),
  };
  const commitments = {
    tuesdayMeetings: commitmentSource.tuesdayMeetings === true,
    saturdayTournaments: commitmentSource.saturdayTournaments === true,
    partnerCommitment: commitmentSource.partnerCommitment === true,
    researchPreparation: commitmentSource.researchPreparation === true,
    teamFee: commitmentSource.teamFee === true,
    judgeVolunteer: commitmentSource.judgeVolunteer === true,
    transportation: commitmentSource.transportation === true,
    googleMeets: commitmentSource.googleMeets === true,
    etiquette: commitmentSource.etiquette === true,
  };
  const eventDetails = {
    qstSession: cleanText(eventSource.qstSession, 500),
    september22Attendance: cleanText(eventSource.september22Attendance, 500),
    september23Attendance: cleanText(eventSource.september23Attendance, 500),
    tournamentDates,
    tabroomAccount: cleanText(eventSource.tabroomAccount, 500),
    contractAgreement: cleanText(eventSource.contractAgreement, 500),
    contractReturn: cleanText(eventSource.contractReturn, 500),
  };
  const answers = {
    whyJoin: cleanText(answerSource.whyJoin, 5000),
    experienceDetail: cleanText(answerSource.experienceDetail, 5000),
    requiredEssay: cleanText(answerSource.requiredEssay, 50000),
    scheduleConflicts: cleanText(answerSource.scheduleConflicts, 5000),
    anythingElse: cleanText(answerSource.anythingElse, 5000),
    questionsForCoach: cleanText(answerSource.questionsForCoach, 5000),
  };
  const application = {
    season: "2026-2027",
    student,
    parent: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      relationship: "",
    },
    commitments,
    eventDetails,
    answers,
    parentAgreement: false,
    parentSignature: "",
  };

  if (
    !student.firstName ||
    !student.lastName ||
    !["7th Grade", "8th Grade"].includes(student.grade) ||
    !validEmail(student.schoolEmail) ||
    !student.schoolEmail.endsWith("@fcpsschools.net") ||
    !student.partner ||
    !answers.whyJoin ||
    !answers.requiredEssay
  ) {
    throw new Error(
      "The sheet row must include the student's full name, grade, FCPS school email, partner response, why-debate response, and required essay."
    );
  }
  return application;
}

function cleanTime(value) {
  const time = cleanText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

function cleanDate(value) {
  const date = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day ? date : "";
}

function calendarEventSignature(data) {
  return JSON.stringify({
    title: cleanText(data.title, 160),
    date: cleanDate(data.date),
    startTime: cleanTime(data.startTime),
    endTime: cleanTime(data.endTime),
    location: cleanText(data.location, 200),
    address: cleanText(data.address, 240),
    mealInfo: cleanText(data.mealInfo, 180),
    resolution: cleanText(data.resolution, 900),
    judgeInstructions: cleanText(data.judgeInstructions, 900),
    expectations: cleanText(data.expectations, 1200),
    coachName: cleanText(data.coachName, 120),
    coachEmail: cleanText(data.coachEmail, 160),
    coachPhone: cleanText(data.coachPhone, 40),
    invitationUrl: cleanText(data.invitationUrl, 500),
    details: cleanText(data.details, 700),
  });
}

function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function cleanRoles(roles) {
  return Array.isArray(roles) ? roles.map(role => ({
    id:          cleanText(role.id, 80),
    label:       cleanText(role.label, 100),
    description: cleanText(role.description, 280),
    capacity:    Number(role.capacity) || 0,
    signedUp:    Number(role.signedUp) || 0,
  })).filter(role => role.id && role.label && role.capacity > 0) : [];
}

function cleanConfirmationPdfBase64(value) {
  const encoded = cleanText(value, 900000);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return "";
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > 700000 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return "";
  return encoded;
}

const FULL_TOURNAMENT_HOUR_OVERRIDES = new Map([
  ["volunteer-signup-acceptance-test", { start: "08:00", end: "17:30" }],
]);

function fullTournamentHours(id, data) {
  return FULL_TOURNAMENT_HOUR_OVERRIDES.get(id) || {
    start: cleanTime(data.startTime),
    end: cleanTime(data.endTime),
  };
}

function publicVolunteerEvent(id, data) {
  const fullWindow = fullTournamentHours(id, data);
  return {
    id,
    title:          cleanText(data.title, 160),
    date:           cleanText(data.date, 32),
    location:        cleanText(data.location, 200),
    address:         cleanText(data.address, 240),
    startTime:       cleanTime(data.startTime),
    endTime:         cleanTime(data.endTime),
    fullAvailabilityStartTime: fullWindow.start,
    fullAvailabilityEndTime:   fullWindow.end,
    mealInfo:        cleanText(data.mealInfo, 180),
    debateFormat:    cleanText(data.debateFormat, 120),
    resolution:      cleanText(data.resolution, 900),
    host:            cleanText(data.host, 160),
    judgeInstructions: cleanText(data.judgeInstructions, 900),
    expectations:    cleanText(data.expectations, 1200),
    coachName:       cleanText(data.coachName, 120),
    coachEmail:      cleanText(data.coachEmail, 160),
    coachPhone:      cleanText(data.coachPhone, 40),
    invitationUrl:   cleanText(data.invitationUrl, 500),
    details:         cleanText(data.details, 700),
    signupDeadline:  cleanText(data.signupDeadline, 32),
    roles: cleanRoles(data.roles).map(role => ({
      id:          role.id,
      label:       role.label,
      description: role.description,
      capacity:    role.capacity,
      taken:       Math.min(role.signedUp, role.capacity),
    })),
  };
}

function publicVolunteerSignup(data) {
  return {
    parentName:        cleanText(data.parentName, 120),
    studentName:       cleanText(data.studentName, 120),
    roleId:            cleanText(data.roleId, 80),
    roleLabel:         cleanText(data.roleLabel, 100),
    availabilityStart: cleanTime(data.availabilityStart),
    availabilityEnd:   cleanTime(data.availabilityEnd),
  };
}

async function verifyTurnstile(token) {
  const secret = turnstileSecret.value();
  if (!secret) {
    throw new Error("Volunteer verification has not been configured yet.");
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) throw new Error("Volunteer verification is temporarily unavailable.");

  const result = await response.json();
  if (!result.success || !TURNSTILE_HOSTNAMES.has(result.hostname)) {
    throw new Error("Please complete the volunteer verification and try again.");
  }
}

exports.publicVolunteerSignup = onRequest(
  { region: "us-central1", cors: true, secrets: [turnstileSecret, resendSecret] },
  async (req, res) => {
    const db = getFirestore();

    if (req.method === "GET") {
      try {
        const snap = await db.collection("volunteer_events")
          .where("published", "==", true)
          .get();
        const events = await Promise.all(snap.docs.map(async doc => {
          const event = publicVolunteerEvent(doc.id, doc.data());
          const signupSnap = await db.collection("volunteer_signups")
            .where("eventId", "==", doc.id)
            .get();
          return {
            ...event,
            signups: signupSnap.docs
              .map(signup => publicVolunteerSignup(signup.data()))
              .filter(signup => signup.parentName && signup.roleId),
          };
        }));
        const publishedEvents = events
          .filter(event => event.title && event.roles.length)
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        res.status(200).json({ events: publishedEvents });
      } catch (error) {
        console.error("publicVolunteerSignup GET failed:", error);
        res.status(500).json({ error: "Volunteer opportunities are temporarily unavailable." });
      }
      return;
    }

    if (req.method !== "POST") {
      res.set("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const body = req.body || {};
    if (body.action === "retry-confirmation-email") {
      const retrySignupId = cleanText(body.signupId, 64);
      const retryToken = cleanText(body.retryToken, 256);
      if (!/^[a-f0-9]{64}$/.test(retrySignupId) || !/^[a-f0-9]{64}$/.test(retryToken)) {
        res.status(400).json({ error: "This email retry link is invalid." });
        return;
      }
      let retrySignup;
      let retryEvent;
      try {
        const retrySignupRef = db.collection("volunteer_signups").doc(retrySignupId);
        retrySignup = await db.runTransaction(async transaction => {
          const signupSnap = await transaction.get(retrySignupRef);
          if (!signupSnap.exists) throw new Error("This volunteer signup could not be found.");
          const signup = signupSnap.data();
          const expectedHash = cleanText(signup.emailRetryTokenHash, 64);
          const receivedHash = volunteerRetryTokenHash(retryToken);
          if (!sameSecret(expectedHash, receivedHash)) {
            throw new Error("This email retry link is invalid.");
          }
          const lastRetryAtMs = Number(signup.lastManualEmailRetryAtMs) || 0;
          if (lastRetryAtMs && Date.now() - lastRetryAtMs < 30 * 1000) {
            throw new Error("Please wait 30 seconds before retrying the email again.");
          }
          const manualRetryAtMs = Date.now();
          transaction.set(retrySignupRef, {
            lastManualEmailRetryAtMs: manualRetryAtMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return {
            id: signupSnap.id,
            ...signup,
            lastManualEmailRetryAtMs: manualRetryAtMs,
          };
        });
        const retryEventSnap = await db.collection("volunteer_events").doc(retrySignup.eventId).get();
        if (!retryEventSnap.exists) {
          res.status(409).json({ error: "The tournament details are temporarily unavailable." });
          return;
        }
        retryEvent = { id: retryEventSnap.id, ...retryEventSnap.data() };
      } catch (error) {
        const retryError = cleanText(error && error.message, 400);
        console.error("Volunteer confirmation email retry authorization failed.", {
          signupId: retrySignupId,
          error: retryError,
        });
        if (retryError === "This email retry link is invalid.") {
          res.status(403).json({ error: retryError });
          return;
        }
        if (retryError === "This volunteer signup could not be found.") {
          res.status(404).json({ error: retryError });
          return;
        }
        if (retryError === "Please wait 30 seconds before retrying the email again.") {
          res.status(429).json({ error: retryError });
          return;
        }
        res.status(503).json({
          error: "The saved signup could not be checked right now. Please try again shortly.",
        });
        return;
      }

      try {
        const emailResult = await volunteerEmail.sendSignupConfirmation(
          retrySignup,
          retryEvent,
          `manual-${retrySignup.lastManualEmailRetryAtMs}`
        );
        console.info("Volunteer confirmation email retry completed.", {
          signupId: retrySignupId,
          accepted: emailResult.accepted === true,
          pending: emailResult.pending === true,
        });
        res.status(200).json({
          ok: true,
          signupSaved: true,
          signupId: retrySignupId,
          retryToken,
          emailStatus: emailResult.accepted ? "accepted" : "delayed",
        });
      } catch (error) {
        console.error("Volunteer confirmation email retry delivery failed.", {
          signupId: retrySignupId,
          error: cleanText(error && error.message, 400),
        });
        res.status(200).json({
          ok: true,
          signupSaved: true,
          signupId: retrySignupId,
          retryToken,
          emailStatus: "failed",
        });
      }
      return;
    }

    const eventId = cleanText(body.eventId, 160);
    const roleId = cleanText(body.roleId, 80);
    const parentFirstName = cleanText(body.parentFirstName, 60);
    const parentLastName = cleanText(body.parentLastName, 60);
    const parentName = `${parentFirstName} ${parentLastName}`.trim();
    const email = cleanText(body.email, 160).toLowerCase();
    const phone = cleanText(body.phone, 40);
    const studentName = cleanText(body.studentName, 120);
    const notes = cleanText(body.notes, 600);
    const availabilityStart = cleanTime(body.availabilityStart);
    const availabilityEnd = cleanTime(body.availabilityEnd);
    const turnstileToken = cleanText(body.turnstileToken, 4096);
    const confirmationPdfBase64 = cleanConfirmationPdfBase64(body.confirmationPdfBase64);

    // Hidden honeypot field. Bots should not receive a useful success response.
    if (body.company) {
      res.status(200).json({ ok: true });
      return;
    }

    if (!eventId || !roleId || !parentFirstName || !parentLastName || !validEmail(email) || !validPhone(phone) || !availabilityStart || !availabilityEnd) {
      res.status(400).json({ error: "Please provide your first and last name, contact details, and judging availability." });
      return;
    }
    if (!confirmationPdfBase64) {
      res.status(400).json({ error: "The confirmation one-pager could not be verified. Please refresh and try again." });
      return;
    }
    if (timeMinutes(availabilityStart) >= timeMinutes(availabilityEnd)) {
      res.status(400).json({ error: "Your availability end time must be after your start time." });
      return;
    }
    if (!turnstileToken) {
      res.status(400).json({ error: "Please complete the volunteer verification." });
      return;
    }

    const eventRef = db.collection("volunteer_events").doc(eventId);
    const signupId = crypto.createHash("sha256")
      .update(`${eventId}:${roleId}:${email}`)
      .digest("hex");
    const signupRef = db.collection("volunteer_signups").doc(signupId);
    const duplicateKey = crypto.createHash("sha256")
      .update(`${eventId}:${email}`)
      .digest("hex");
    const duplicateRef = db.collection("volunteer_signup_keys").doc(duplicateKey);
    const emailRetryToken = crypto.randomBytes(32).toString("hex");
    const emailRetryTokenHash = volunteerRetryTokenHash(emailRetryToken);
    const confirmationRequestId = crypto.randomBytes(12).toString("hex");

    try {
      await verifyTurnstile(turnstileToken);
      let selectedRole;
      let selectedEvent;
      let savedSignupData;
      let updatedExistingSignup = false;
      let resolvedSignupId = signupId;
      await db.runTransaction(async transaction => {
        const [eventSnap, signupSnap, duplicateSnap] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(signupRef),
          transaction.get(duplicateRef),
        ]);

        if (!eventSnap.exists || !eventSnap.data().published) {
          throw new Error("This volunteer opportunity is no longer available.");
        }
        selectedEvent = { id: eventSnap.id, ...eventSnap.data() };
        const eventStartTime = cleanTime(selectedEvent.startTime);
        const eventEndTime = cleanTime(selectedEvent.endTime);
        const fullWindow = fullTournamentHours(eventId, selectedEvent);
        const allowedStartTime = fullWindow.start || eventStartTime;
        const allowedEndTime = fullWindow.end || eventEndTime;
        if (
          allowedStartTime && allowedEndTime &&
          (timeMinutes(availabilityStart) < timeMinutes(allowedStartTime) ||
            timeMinutes(availabilityEnd) > timeMinutes(allowedEndTime))
        ) {
          throw new Error("Please choose a judging window within the published tournament hours.");
        }
        const roles = cleanRoles(selectedEvent.roles);
        const roleIndex = roles.findIndex(role => role.id === roleId);
        if (roleIndex < 0) {
          throw new Error("That volunteer role is no longer available.");
        }

        selectedRole = roles[roleIndex];
        const updateExistingSignup = (existingRef, existingData) => {
          const previousRoleIndex = roles.findIndex(role => role.id === cleanText(existingData.roleId, 80));
          if (previousRoleIndex !== roleIndex) {
            if (selectedRole.signedUp >= selectedRole.capacity) {
              throw new Error("That volunteer role was just filled. Please choose another opening.");
            }
            if (previousRoleIndex >= 0) {
              roles[previousRoleIndex].signedUp = Math.max(0, roles[previousRoleIndex].signedUp - 1);
            }
            roles[roleIndex].signedUp += 1;
            transaction.update(eventRef, {
              roles,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          savedSignupData = {
            ...existingData,
            eventId,
            roleId,
            roleLabel: selectedRole.label,
            parentFirstName,
            parentLastName,
            parentName,
            email,
            phone,
            studentName,
            notes,
            availabilityStart,
            availabilityEnd,
            duplicateKey,
            confirmationPdfBase64,
            confirmationRequestId,
            emailRetryTokenHash,
          };
          transaction.set(existingRef, {
            ...savedSignupData,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          updatedExistingSignup = true;
        };
        if (signupSnap.exists) {
          updateExistingSignup(signupRef, signupSnap.data());
          return;
        }
        if (duplicateSnap.exists) {
          const existingSignupId = cleanText(duplicateSnap.data().signupId, 64);
          if (!/^[a-f0-9]{64}$/.test(existingSignupId)) {
            throw new Error("Your existing signup could not be reopened. Please contact the coach for help.");
          }
          const existingSignupRef = db.collection("volunteer_signups").doc(existingSignupId);
          const existingSignupSnap = await transaction.get(existingSignupRef);
          if (!existingSignupSnap.exists) {
            throw new Error("Your existing signup could not be reopened. Please contact the coach for help.");
          }
          resolvedSignupId = existingSignupId;
          updateExistingSignup(existingSignupRef, existingSignupSnap.data());
          return;
        }
        if (selectedRole.signedUp >= selectedRole.capacity) {
          throw new Error("That volunteer role was just filled. Please choose another opening.");
        }

        roles[roleIndex].signedUp += 1;
        transaction.update(eventRef, {
          roles,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(signupRef, {
          eventId,
          roleId,
          roleLabel: selectedRole.label,
          parentFirstName,
          parentLastName,
          parentName,
          email,
          phone,
          studentName,
          notes,
          availabilityStart,
          availabilityEnd,
          duplicateKey,
          confirmationPdfBase64,
          confirmationRequestId,
          emailRetryTokenHash,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(duplicateRef, {
          eventId,
          signupId,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      const savedSignup = savedSignupData ? {
        id: resolvedSignupId,
        ...savedSignupData,
      } : {
        id: resolvedSignupId,
        eventId,
        roleId,
        roleLabel: selectedRole.label,
        parentFirstName,
        parentLastName,
        parentName,
        email,
        phone,
        studentName,
        notes,
        availabilityStart,
        availabilityEnd,
        duplicateKey,
        confirmationPdfBase64,
        confirmationRequestId,
      };
      let emailStatus = "delayed";
      try {
        const emailResult = await volunteerEmail.sendSignupConfirmation(
          savedSignup,
          selectedEvent,
          `confirm-${savedSignup.confirmationRequestId}`
        );
        emailStatus = emailResult.accepted ? "accepted" : "delayed";
        console.info("Volunteer signup saved and confirmation email processed.", {
          signupId: resolvedSignupId,
          emailStatus,
          pending: emailResult.pending === true,
        });
      } catch (emailError) {
        emailStatus = "failed";
        console.error("Volunteer signup saved but confirmation email failed.", {
          signupId: resolvedSignupId,
          error: cleanText(emailError && emailError.message, 400),
        });
      }
      res.status(201).json({
        ok: true,
        signupSaved: true,
        signupId: resolvedSignupId,
        retryToken: emailRetryToken,
        emailStatus,
        message: updatedExistingSignup
          ? "Your existing signup has been updated and a new confirmation email has been sent."
          : "You’re signed up. Thank you for supporting Cooper Debate!",
      });
    } catch (error) {
      const message = error && error.message
        ? error.message
        : "We could not complete your signup. Please try again.";
      console.error("publicVolunteerSignup POST failed:", error);
      res.status(400).json({ error: message });
    }
  }
);

// ── Public team application submission ───────────────────────────
// Applications are validated and written by the Admin SDK. Browser clients
// never receive read access to these private records.
exports.submitApplication = onRequest(
  {
    region: "us-central1",
    cors: [...APPLICATION_ORIGINS],
    secrets: [resendSecret, turnstileSecret],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    if (!APPLICATION_ORIGINS.has(cleanText(req.headers.origin, 200))) {
      res.status(403).json({ error: "Applications must be submitted through the Cooper Debate Team website." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (cleanText(body.honey, 200)) {
      // Bots should not receive a useful signal that their submission was rejected.
      res.status(200).json({ ok: true });
      return;
    }

    const submissionId = cleanText(body.submissionId, 80);
    const turnstileToken = cleanText(body.turnstileToken, 4096);
    if (!/^[a-zA-Z0-9_-]{20,80}$/.test(submissionId)) {
      res.status(400).json({ error: "Your application reference is invalid. Please review the form and try again." });
      return;
    }

    let application;
    try {
      application = normalizeApplication(body);
    } catch (error) {
      res.status(400).json({ error: cleanText(error.message, 240) || "Please review your application and try again." });
      return;
    }
    if (!turnstileToken) {
      res.status(400).json({ error: "Please complete the verification before submitting your application." });
      return;
    }

    const db = getFirestore();
    const applicationRef = db.collection("applications").doc(submissionId);
    const contentHash = applicationContentHash(application);
    let applicationSaved = false;
    let savedApplication = null;
    try {
      let existing = await applicationRef.get();
      if (existing.exists && existing.data().contentHash !== contentHash) {
        res.status(409).json({ error: "This application reference is already in use. Please refresh the page and try again." });
        return;
      }
      applicationSaved = existing.exists;
      savedApplication = existing.exists ? existing.data() : null;

      if (!existing.exists) {
        await verifyTurnstile(turnstileToken);
        await reserveApplicationRateLimit(db, req);
        try {
          await applicationRef.create({
            ...application,
            contentHash,
            emailStatus: "pending",
          emailPendingAt: FieldValue.serverTimestamp(),
            emailAttemptCount: 0,
            nextEmailAttemptAt: Timestamp.now(),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          applicationSaved = true;
          savedApplication = { emailAttemptCount: 0 };
        } catch (error) {
          // A double click or network retry can race the first create. Reuse
          // the same submission reference only when its saved content matches.
          existing = await applicationRef.get();
          if (!existing.exists || existing.data().contentHash !== contentHash) throw error;
          applicationSaved = true;
          savedApplication = existing.data();
        }
      }

      const attemptCount = Number(savedApplication && savedApplication.emailAttemptCount || 0) + 1;
      await applicationRef.set({
        emailStatus: "sending",
        emailAttemptCount: attemptCount,
        emailAttemptStartedAt: FieldValue.serverTimestamp(),
        nextEmailAttemptAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await applicationEmail.sendApplicationCopies(submissionId, application);
      await applicationRef.set({
        emailStatus: "accepted",
        emailAcceptedAt: FieldValue.serverTimestamp(),
        nextEmailAttemptAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error("submitApplication POST failed:", {
        submissionId,
        error: cleanText(error && error.message, 400),
      });
      if (applicationSaved) {
        await applicationRef.set({
          emailStatus: "failed",
          nextEmailAttemptAt: emailRetryAt(Number(savedApplication && savedApplication.emailAttemptCount || 0) + 1),
          emailError: cleanText(error && error.message, 300) || "Email delivery could not be completed.",
          emailFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
        res.status(502).json({
          error: "Your application was saved, but the email copies could not be requested yet. Please try submitting again in a moment.",
        });
      } else {
        res.status(429).json({
          error: cleanText(error && error.message, 240) || "Please wait a few minutes before trying again.",
        });
      }
    }
  }
);

// Google Forms write to a response sheet before this endpoint receives the
// normalized row. The Apps Script caller is authenticated with a shared
// Secret Manager value; no browser can create or update application records
// through this endpoint.
exports.syncApplicationFromSheet = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [applicationSheetSyncSecret],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const expectedSecret = applicationSheetSyncSecret.value();
    const receivedSecret = cleanText(req.headers["x-application-sheet-secret"], 512);
    if (!sameSecret(expectedSecret, receivedSecret)) {
      res.status(expectedSecret ? 401 : 503).json({
        error: expectedSecret
          ? "The application sheet sync request could not be authenticated."
          : "Application sheet sync is not configured yet.",
      });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const source = body.source && typeof body.source === "object" ? body.source : {};
    const spreadsheetId = cleanText(source.spreadsheetId, 160);
    const sheetName = cleanText(source.sheetName, 120);
    const rowNumber = Number(source.rowNumber);
    if (
      !spreadsheetId ||
      !sheetName ||
      !Number.isInteger(rowNumber) ||
      rowNumber < 2 ||
      rowNumber > 1000000
    ) {
      res.status(400).json({ error: "The sheet response source is incomplete." });
      return;
    }

    let application;
    try {
      application = normalizeSheetApplication(body.application);
    } catch (error) {
      res.status(400).json({
        error: cleanText(error.message, 300) || "The sheet response is missing required application fields.",
      });
      return;
    }

    const sourceSubmittedAt = cleanText(source.submittedAt, 120);
    const sourceKey = sourceSubmittedAt
      ? [
          spreadsheetId,
          sheetName,
          sourceSubmittedAt,
          application.student.schoolEmail,
          application.student.firstName,
          application.student.lastName,
        ].join("\u001f")
      : `${spreadsheetId}\u001f${sheetName}\u001f${rowNumber}`;
    const applicationId = `sheet-${crypto.createHash("sha256").update(sourceKey).digest("hex")}`;
    const applicationRef = getFirestore().collection("applications").doc(applicationId);
    const submittedAtMillis = Date.parse(sourceSubmittedAt);
    const submittedAtTimestamp = Number.isFinite(submittedAtMillis)
      ? Timestamp.fromMillis(submittedAtMillis)
      : null;
    const sourceRecord = {
      type: "google-form-sheet",
      spreadsheetId,
      sheetName,
      rowNumber,
      submittedAt: sourceSubmittedAt,
      sourceKeyHash: crypto.createHash("sha256").update(sourceKey).digest("hex"),
    };
    const contentHash = applicationContentHash(application);
    let created = false;
    let reviewStatus = "pending";

    try {
      await getFirestore().runTransaction(async transaction => {
        const existing = await transaction.get(applicationRef);
        const existingData = existing.exists ? existing.data() : {};
        created = !existing.exists;
        reviewStatus = ["pending", "accepted", "declined"].includes(existingData.reviewStatus)
          ? existingData.reviewStatus
          : "pending";
        transaction.set(applicationRef, {
          ...application,
          contentHash,
          reviewStatus,
          source: sourceRecord,
          sheetSyncStatus: "synced",
          sheetSyncError: FieldValue.delete(),
          sheetSyncedAt: FieldValue.serverTimestamp(),
          createdAt: existingData.createdAt || submittedAtTimestamp || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      res.status(created ? 201 : 200).json({
        ok: true,
        applicationId,
        reviewStatus,
      });
    } catch (error) {
      console.error("syncApplicationFromSheet failed:", {
        applicationId,
        message: cleanText(error && error.message, 400),
      });
      res.status(500).json({ error: "The application could not be saved to Firestore." });
    }
  }
);

// Application records are deliberately browser read-only. Coaches use this
// endpoint to leave an authenticated, attributable admissions decision without
// changing the separate email-delivery workflow.
exports.manageApplicationReview = onRequest(
  { region: "us-central1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const token = cleanText(req.headers.authorization, 4096).replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Sign in as a coach to review applications." });
      return;
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (_) {
      res.status(401).json({ error: "Your sign-in session has expired. Please sign in again." });
      return;
    }

    const reviewerEmail = cleanEmail(decoded.email);
    if (!await hasFullAdminAccess(reviewerEmail)) {
      res.status(403).json({ error: "Only coaches and website admins can review applications." });
      return;
    }

    const body = req.body || {};
    const applicationId = cleanText(body.applicationId, 128);
    const decision = cleanText(body.decision, 24).toLowerCase();
    const internalNote = cleanText(body.internalNote, 2000);

    if (!/^[a-zA-Z0-9_-]{12,128}$/.test(applicationId)) {
      res.status(400).json({ error: "A valid application is required." });
      return;
    }
    if (!["pending", "accepted", "declined"].includes(decision)) {
      res.status(400).json({ error: "Choose Accept, Hold, or Decline before saving." });
      return;
    }

    const applicationRef = getFirestore().collection("applications").doc(applicationId);
    try {
      await getFirestore().runTransaction(async transaction => {
        const application = await transaction.get(applicationRef);
        if (!application.exists) throw new Error("That application no longer exists.");
        transaction.update(applicationRef, {
          reviewStatus: decision,
          reviewNote: internalNote,
          reviewedBy: reviewerEmail,
          reviewedAt: FieldValue.serverTimestamp(),
        });
      });
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("manageApplicationReview failed:", {
        applicationId,
        decision,
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(400).json({ error: cleanText(error.message, 240) || "Unable to save the review decision." });
    }
  }
);

// A temporary Resend outage should never strand a saved application. Failed
// delivery requests are retried server-side; each recipient has its own
// idempotency key, so messages already accepted by Resend are not duplicated.
exports.retryFailedApplicationEmails = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [resendSecret],
  },
  async () => {
    const db = getFirestore();
    const interrupted = await db.collection("applications")
      .where("nextEmailAttemptAt", "<=", Timestamp.now())
      .orderBy("nextEmailAttemptAt")
      .limit(100)
      .get();
    for (const applicationDoc of interrupted.docs) {
      const application = applicationDoc.data();
      try {
        const attemptCount = Number(application.emailAttemptCount || 0) + 1;
        await applicationDoc.ref.set({
          emailStatus: "sending",
          emailAttemptCount: attemptCount,
          emailAttemptStartedAt: FieldValue.serverTimestamp(),
          nextEmailAttemptAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await applicationEmail.sendApplicationCopies(applicationDoc.id, application);
        await applicationDoc.ref.set({
          emailStatus: "accepted",
          emailAcceptedAt: FieldValue.serverTimestamp(),
          emailRetryAcceptedAt: FieldValue.serverTimestamp(),
          nextEmailAttemptAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        await applicationDoc.ref.set({
          emailStatus: "failed",
          nextEmailAttemptAt: emailRetryAt(Number(application.emailAttemptCount || 0) + 1),
          emailError: cleanText(error && error.message, 300) || "Email delivery could not be completed.",
          emailFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.error("retryFailedApplicationEmails failed:", {
          submissionId: applicationDoc.id,
          error: cleanText(error && error.message, 400),
        });
      }
    }
  }
);

// Volunteer email is intentionally server-only. These functions bind the
// Firebase Secret Manager value at deploy time and never expose it to the
// browser or public signup endpoint.
exports.emailVolunteerSignupConfirmation = onDocumentCreated(
  {
    document: "volunteer_signups/{signupId}",
    region: "us-east4",
    timeoutSeconds: 540,
    retry: true,
    secrets: [resendSecret],
  },
  async (event) => {
    const signupSnap = event.data;
    if (!signupSnap) return null;
    const signup = { id: signupSnap.id, ...signupSnap.data() };
    const eventSnap = await getFirestore().collection("volunteer_events").doc(signup.eventId).get();
    if (!eventSnap.exists) {
      console.error("Confirmation email skipped because its volunteer event is missing.", { signupId: signup.id });
      return null;
    }
    try {
      const confirmationRequestId = cleanText(signup.confirmationRequestId, 24);
      const deliveryVersion = confirmationRequestId ? `confirm-${confirmationRequestId}` : "";
      const result = await volunteerEmail.sendSignupConfirmation(
        signup,
        { id: eventSnap.id, ...eventSnap.data() },
        deliveryVersion
      );
      if (result.pending) {
        throw new Error("Confirmation email delivery is still in progress.");
      }
      console.info("Volunteer confirmation email trigger completed.", {
        signupId: signup.id,
        accepted: result.accepted === true,
        pending: false,
      });
    } catch (error) {
      console.error("Volunteer confirmation email trigger failed.", {
        signupId: signup.id,
        error: cleanText(error && error.message, 400),
      });
      throw error;
    }
    return null;
  }
);

exports.emailVolunteerSignupCancellation = onDocumentDeleted(
  {
    document: "volunteer_signups/{signupId}",
    region: "us-east4",
    timeoutSeconds: 540,
    retry: true,
    secrets: [resendSecret],
  },
  async (event) => {
    const signupSnap = event.data;
    if (!signupSnap) return null;
    const signup = { id: signupSnap.id, ...signupSnap.data() };
    const eventSnap = await getFirestore().collection("volunteer_events").doc(signup.eventId).get();
    const volunteerEvent = eventSnap.exists
      ? { id: eventSnap.id, ...eventSnap.data() }
      : { title: "a Cooper Debate tournament" };
    await volunteerEmail.sendSignupCancellation(signup, volunteerEvent);
    return null;
  }
);

exports.emailVolunteerEventUpdate = onDocumentUpdated(
  {
    document: "volunteer_events/{eventId}",
    region: "us-east4",
    timeoutSeconds: 540,
    retry: true,
    secrets: [resendSecret],
  },
  async (event) => {
    if (!event.data) return null;
    const before = event.data.before.data();
    const after = event.data.after.data();
    const cancelled = before.cancelled !== true && after.cancelled === true;
    if (after.cancelled === true && !cancelled) return null;
    const changes = volunteerEmail.changedEventFields(before, after);

    const signups = await getFirestore()
      .collection("volunteer_signups")
      .where("eventId", "==", event.params.eventId)
      .get();
    const volunteerEvent = { id: event.params.eventId, ...after };
    const volunteers = signups.docs.map(signupDoc => ({ id: signupDoc.id, ...signupDoc.data() }));
    if (cancelled) {
      await volunteerEmail.sendEventCancellations(volunteers, volunteerEvent);
      return null;
    }
    if (!changes.length) return null;
    await volunteerEmail.sendEventUpdates(volunteers, volunteerEvent, changes);
    return null;
  }
);

exports.emailVolunteerEventCancellation = onDocumentDeleted(
  {
    document: "volunteer_events/{eventId}",
    region: "us-east4",
    timeoutSeconds: 540,
    retry: true,
    secrets: [resendSecret],
  },
  async (event) => {
    const eventSnap = event.data;
    if (!eventSnap) return null;
    const signups = await getFirestore()
      .collection("volunteer_signups")
      .where("eventId", "==", event.params.eventId)
      .get();
    const volunteers = signups.docs.map(signupDoc => ({ id: signupDoc.id, ...signupDoc.data() }));
    await volunteerEmail.sendEventCancellations(volunteers, {
      id: event.params.eventId,
      ...eventSnap.data(),
      calendarSequence: Math.max(0, Math.floor(Number(eventSnap.data().calendarSequence) || 0)) + 1,
    });
    return null;
  }
);

exports.sendVolunteerTournamentReminders = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: "America/New_York",
    region: "us-east4",
    timeoutSeconds: 540,
    secrets: [resendSecret],
  },
  async () => {
    await volunteerEmail.sendDueReminders();
  }
);

// Coaches use this endpoint for every volunteer-event mutation. The server
// preserves live signup counts while roles are edited, and removal keeps role
// counts and duplicate-prevention records in sync.
exports.manageVolunteerSignup = onRequest(
  { region: "us-central1", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const token = cleanText(req.headers.authorization, 4096).replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Sign in as a coach to manage volunteer signups." });
      return;
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (_) {
      res.status(401).json({ error: "Your sign-in session has expired. Please sign in again." });
      return;
    }

    if (!await hasFullAdminAccess(decoded.email)) {
      res.status(403).json({ error: "Only coaches and website admins can manage volunteer signups." });
      return;
    }

    const body = req.body || {};
    const action = cleanText(body.action, 40);
    const db = getFirestore();

    try {
      if (action === "removeSignup") {
        const signupId = cleanText(body.signupId, 128);
        if (!signupId) throw new Error("A signup is required.");
        const signupRef = db.collection("volunteer_signups").doc(signupId);

        await db.runTransaction(async transaction => {
          const signupSnap = await transaction.get(signupRef);
          if (!signupSnap.exists) throw new Error("That signup no longer exists.");
          const signup = signupSnap.data();
          const eventRef = db.collection("volunteer_events").doc(signup.eventId);
          const eventSnap = await transaction.get(eventRef);

          if (eventSnap.exists) {
            const roles = cleanRoles(eventSnap.data().roles);
            const roleIndex = roles.findIndex(role => role.id === signup.roleId);
            if (roleIndex >= 0) {
              roles[roleIndex].signedUp = Math.max(0, roles[roleIndex].signedUp - 1);
              transaction.update(eventRef, {
                roles,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }
          transaction.delete(signupRef);
          if (signup.duplicateKey) {
            transaction.delete(db.collection("volunteer_signup_keys").doc(signup.duplicateKey));
          }
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "setPublished") {
        const eventId = cleanText(body.eventId, 160);
        if (!eventId || typeof body.published !== "boolean") throw new Error("An event and visibility setting are required.");
        await db.collection("volunteer_events").doc(eventId).update({
          published: body.published,
          ...(body.published ? { cancelled: false } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "cancelEvent") {
        const eventId = cleanText(body.eventId, 160);
        if (!eventId) throw new Error("A tournament is required.");
        await db.collection("volunteer_events").doc(eventId).update({
          published: false,
          cancelled: true,
          calendarSequence: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "saveEvent") {
        const requestedId = cleanText(body.eventId, 160);
        const incoming = body.event || {};
        const title = cleanText(incoming.title, 160);
        const date = cleanDate(incoming.date);
        const location = cleanText(incoming.location, 200);
        const address = cleanText(incoming.address, 240);
        const startTime = cleanTime(incoming.startTime);
        const endTime = cleanTime(incoming.endTime);
        const mealInfo = cleanText(incoming.mealInfo, 180);
        const debateFormat = cleanText(incoming.debateFormat, 120);
        const resolution = cleanText(incoming.resolution, 900);
        const host = cleanText(incoming.host, 160);
        const judgeInstructions = cleanText(incoming.judgeInstructions, 900);
        const expectations = cleanText(incoming.expectations, 1200);
        const coachName = cleanText(incoming.coachName, 120);
        const coachEmail = cleanText(incoming.coachEmail, 160);
        const coachPhone = cleanText(incoming.coachPhone, 40);
        const invitationUrl = cleanText(incoming.invitationUrl, 500);
        const details = cleanText(incoming.details, 700);
        const signupDeadline = cleanText(incoming.signupDeadline, 32);
        const published = incoming.published === true;
        const rawRoles = Array.isArray(incoming.roles) ? incoming.roles : [];
        const roleIds = new Set();
        const requestedRoles = rawRoles.map(role => {
          const id = cleanText(role.id, 80);
          const label = cleanText(role.label, 100);
          const description = cleanText(role.description, 280);
          const capacity = Number(role.capacity);
          if (!id || !label || !Number.isInteger(capacity) || capacity < 1 || capacity > 100 || roleIds.has(id)) {
            throw new Error("Every volunteer role needs a unique name and a capacity from 1 to 100.");
          }
          roleIds.add(id);
          return { id, label, description, capacity };
        });

        if (!title || !date || !requestedRoles.length) {
          throw new Error("Add an event title, a valid tournament date, and at least one volunteer role.");
        }
        if ((startTime && !endTime) || (!startTime && endTime) || (startTime && timeMinutes(startTime) >= timeMinutes(endTime))) {
          throw new Error("Tournament end time must be after the start time.");
        }

        const eventRef = requestedId
          ? db.collection("volunteer_events").doc(requestedId)
          : db.collection("volunteer_events").doc();
        await db.runTransaction(async transaction => {
          const existingSnap = await transaction.get(eventRef);
          const currentRoles = existingSnap.exists ? cleanRoles(existingSnap.data().roles) : [];
          const currentById = new Map(currentRoles.map(role => [role.id, role]));
          const nextRoles = requestedRoles.map(role => {
            const current = currentById.get(role.id);
            const signedUp = current ? current.signedUp : 0;
            if (role.capacity < signedUp) {
              throw new Error(`“${role.label}” already has ${signedUp} signup(s); its capacity cannot be lower.`);
            }
            return { ...role, signedUp };
          });

          for (const current of currentRoles) {
            if (!roleIds.has(current.id) && current.signedUp > 0) {
              throw new Error(`Remove the ${current.signedUp} signup(s) for “${current.label}” before removing this role.`);
            }
          }

          const data = {
            title, date, location, address, startTime, endTime, mealInfo, debateFormat,
            resolution, host, judgeInstructions, expectations, coachName, coachEmail,
            coachPhone, invitationUrl, details, signupDeadline, published,
            roles: nextRoles,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (existingSnap.exists) {
            const existing = existingSnap.data();
            const sequence = Math.max(0, Math.floor(Number(existing.calendarSequence) || 0));
            data.calendarSequence = calendarEventSignature(existing) === calendarEventSignature(data)
              ? sequence
              : sequence + 1;
            transaction.update(eventRef, data);
          } else {
            transaction.set(eventRef, {
              ...data,
              calendarSequence: 0,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        });
        res.status(200).json({ ok: true, eventId: eventRef.id });
        return;
      }

      throw new Error("Unknown volunteer management action.");
    } catch (error) {
      console.error("manageVolunteerSignup failed:", error);
      res.status(400).json({ error: error.message || "Unable to manage volunteer signups." });
    }
  }
);
