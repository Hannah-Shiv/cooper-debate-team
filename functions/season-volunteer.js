const crypto = require("node:crypto");

const SEASON = "2026-2027";
const TOURNAMENT_IDS = Object.freeze([
  "2026-10-24",
  "2026-11-14",
  "2026-12-05",
  "2027-01-30",
  "2027-02-20",
]);
const TOURNAMENT_ID_SET = new Set(TOURNAMENT_IDS);
const TOURNAMENT_TRACKING_STATES = new Set(["pending", "linked", "registered"]);
const SEASON_SIGNUP_STATUSES = new Set(["submitted", "coach_confirmed"]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function submissionIdFor(season, email) {
  return crypto.createHash("sha256")
    .update(`${season}:${email}`)
    .digest("hex");
}

function normalizeSeasonAvailability(body) {
  const season = cleanText(body.season, 40);
  if (season !== SEASON) throw new Error("Season-wide availability is only open for 2026–27.");

  if (!Array.isArray(body.selectedTournamentIds) ||
    body.selectedTournamentIds.length < 1 ||
    body.selectedTournamentIds.length > TOURNAMENT_IDS.length ||
    body.selectedTournamentIds.some(id => typeof id !== "string" || !TOURNAMENT_ID_SET.has(id)) ||
    new Set(body.selectedTournamentIds).size !== body.selectedTournamentIds.length) {
    throw new Error("Select one or more valid tournaments from the 2026–27 season.");
  }

  const parentFirstName = cleanText(body.parentFirstName, 60);
  const parentLastName = cleanText(body.parentLastName, 60);
  const email = cleanText(body.email, 160).toLowerCase();
  const phone = cleanText(body.phone, 40);
  const studentName = cleanText(body.studentName, 120);
  const notes = cleanText(body.notes, 600);
  const tabroomUsernameOrEmail = cleanText(body.tabroomUsernameOrEmail, 160);

  if (!parentFirstName || !parentLastName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.replace(/\D/g, "").length !== 10 ||
    !tabroomUsernameOrEmail) {
    throw new Error("Enter your name, a valid email and 10-digit phone number, and your Tabroom username or email.");
  }
  if (
    body.fullDayCommitment !== true ||
    (body.availabilityStart !== undefined && body.availabilityStart !== "08:00") ||
    (body.availabilityEnd !== undefined && body.availabilityEnd !== "17:30")
  ) {
    throw new Error("Confirm that you can judge for the full 8:00 AM–5:30 PM day for every selected tournament.");
  }

  return {
    season,
    selectedTournamentIds: [...body.selectedTournamentIds],
    parentFirstName,
    parentLastName,
    parentName: `${parentFirstName} ${parentLastName}`,
    email,
    phone,
    studentName,
    notes,
    tabroomUsernameOrEmail,
    availabilityStart: "08:00",
    availabilityEnd: "17:30",
  };
}

async function saveSeasonAvailability({
  db,
  submission,
  confirmationRequestId,
  serverTimestamp,
}) {
  const id = submissionIdFor(submission.season, submission.email);
  const reference = db.collection("volunteer_season_signups").doc(id);
  const saved = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists ? snapshot.data() || {} : null;
    const selectedTournamentIds = submission.selectedTournamentIds;
    const previousTracking = existing && existing.tournamentStatusById &&
      typeof existing.tournamentStatusById === "object"
      ? existing.tournamentStatusById
      : {};
    const tournamentStatusById = Object.fromEntries(selectedTournamentIds.map(tournamentId => [
      tournamentId,
      TOURNAMENT_TRACKING_STATES.has(previousTracking[tournamentId])
        ? previousTracking[tournamentId]
        : "pending",
    ]));
    const record = {
      ...submission,
      ...(existing ? {
        parentFirstName: existing.parentFirstName,
        parentLastName: existing.parentLastName,
        parentName: existing.parentName,
        phone: existing.phone,
        studentName: existing.studentName,
        notes: existing.notes,
        tabroomUsernameOrEmail: existing.tabroomUsernameOrEmail,
      } : {}),
      id,
      status: "submitted",
      tournamentStatusById,
      confirmationRequestId,
      createdAt: existing ? existing.createdAt : serverTimestamp(),
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(reference, record);
    return { record, updatedExisting: Boolean(existing) };
  });
  return { submissionId: id, ...saved };
}

function seasonSignupAdminUpdate(existing, body) {
  if (!existing || existing.season !== SEASON) throw new Error("That season signup could not be found.");

  const status = cleanText(body.status, 32);
  if (!SEASON_SIGNUP_STATUSES.has(status)) {
    throw new Error("Choose a valid coach status.");
  }

  const selectedIds = Array.isArray(existing.selectedTournamentIds)
    ? existing.selectedTournamentIds.filter(id => TOURNAMENT_ID_SET.has(id))
    : [];
  if (!selectedIds.length) throw new Error("That season signup has no valid tournament selections.");

  const tournamentStatusById = Object.fromEntries(selectedIds.map(id => [
    id,
    TOURNAMENT_TRACKING_STATES.has(existing.tournamentStatusById?.[id])
      ? existing.tournamentStatusById[id]
      : "pending",
  ]));
  const updates = body.tournamentStatusById === undefined ? {} : body.tournamentStatusById;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Tournament tracking must be a map of selected tournament dates and statuses.");
  }
  for (const [id, state] of Object.entries(updates)) {
    if (!selectedIds.includes(id) || !TOURNAMENT_TRACKING_STATES.has(state)) {
      throw new Error("Tournament tracking may only update selected dates with a valid status.");
    }
    tournamentStatusById[id] = state;
  }
  return { status, tournamentStatusById };
}

module.exports = {
  SEASON,
  TOURNAMENT_IDS,
  normalizeSeasonAvailability,
  saveSeasonAvailability,
  seasonSignupAdminUpdate,
  submissionIdFor,
};