const crypto = require("node:crypto");
const { SEASON, submissionIdFor } = require("./season-volunteer");

const LINK_LIFETIME_MS = 30 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

async function issueSeasonCancellation({ db, signupId, requestId, requestRef, now = Date.now() }) {
  if (!/^[a-f0-9]{64}$/.test(signupId || "")) return null;
  const reference = db.collection("volunteer_season_signups").doc(signupId);
  const token = crypto.randomBytes(32).toString("hex");
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const queued = requestRef ? await transaction.get(requestRef) : null;
    if (requestRef && !queued.exists) return null;
    if (!snapshot.exists) return null;
    const signup = snapshot.data() || {};
    const existingToken = queued && queued.data()?.token;
    if (existingToken) {
      if (signup.season !== SEASON ||
        signup.cancellationRequestId !== requestId ||
        signup.cancellationTokenHash !== hashToken(existingToken) ||
        !Number.isFinite(signup.cancellationExpiresAtMs) ||
        signup.cancellationExpiresAtMs < now) return null;
      return {
        token: existingToken,
        email: signup.email,
        parentFirstName: signup.parentFirstName,
      };
    }
    const retryingUnsentRequest = Boolean(requestRef && requestId &&
      signup.cancellationRequestId === requestId);
    if (signup.season !== SEASON ||
      (!retryingUnsentRequest && Number.isFinite(signup.cancellationRequestedAtMs) &&
        signup.cancellationRequestedAtMs > now - REQUEST_COOLDOWN_MS)) return null;
    transaction.update(reference, {
      cancellationTokenHash: hashToken(token),
      cancellationExpiresAtMs: now + LINK_LIFETIME_MS,
      cancellationRequestedAtMs: now,
      ...(requestId ? { cancellationRequestId: requestId } : {}),
    });
    // Store the raw token only in the private, short-lived outbox. The public
    // signup record contains its hash, and both writes commit atomically.
    if (requestRef) transaction.update(requestRef, { token });
    return {
      token,
      email: signup.email,
      parentFirstName: signup.parentFirstName,
    };
  });
  // Null covers unknown addresses and rate-limited requests. The caller must
  // return the same public response for all cases.
  return result;
}

async function requestSeasonCancellation({ db, email, now = Date.now() }) {
  const normalizedEmail = String(email || "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }
  return issueSeasonCancellation({
    db,
    signupId: submissionIdFor(SEASON, normalizedEmail),
    now,
  });
}

async function processSeasonCancellationRequest({
  db, requestRef, requestId, sendEmail, incrementAttempt,
}) {
  const queued = await requestRef.get();
  if (!queued.exists) return "already-processed";
  if ((queued.data().attemptCount || 0) >= 5) {
    await requestRef.delete();
    return "exhausted";
  }
  try {
    const issued = await issueSeasonCancellation({
      db,
      signupId: queued.data().signupId,
      requestId,
      requestRef,
    });
    if (issued) await sendEmail(issued);
    await requestRef.delete();
    return issued ? "sent" : "not-eligible";
  } catch (error) {
    await requestRef.update({ attemptCount: incrementAttempt() }).catch(() => {});
    throw error; // Firebase retries the same outbox event and token.
  }
}

async function confirmSeasonCancellation({ db, token, now = Date.now() }) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error("This cancellation link is invalid or has expired.");
  }
  const matches = await db.collection("volunteer_season_signups")
    .where("cancellationTokenHash", "==", hashToken(token)).limit(1).get();
  if (matches.empty) throw new Error("This cancellation link is invalid or has expired.");
  const reference = matches.docs[0].ref;
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const signup = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists ||
      signup.season !== SEASON ||
      signup.cancellationTokenHash !== hashToken(token) ||
      !Number.isFinite(signup.cancellationExpiresAtMs) ||
      signup.cancellationExpiresAtMs < now) {
      throw new Error("This cancellation link is invalid or has expired.");
    }
    transaction.delete(reference);
    return {
      email: signup.email,
      parentFirstName: signup.parentFirstName,
      parentName: signup.parentName,
      parentLastName: signup.parentLastName,
      selectedTournamentIds: Array.isArray(signup.selectedTournamentIds)
        ? [...signup.selectedTournamentIds] : [],
      notificationId: hashToken(token),
    };
  });
}

async function seasonCancellationCoachEmails({ db, fallbackEmails = [] }) {
  const members = await db.collection("portal_members").get();
  const byEmail = new Map();
  for (const doc of members.docs) {
    const member = doc.data() || {};
    const addresses = [doc.id, member.email,
      ...(Array.isArray(member.loginEmails) ? member.loginEmails : [])];
    for (const address of addresses) {
      if (typeof address !== "string") continue;
      const email = address.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        byEmail.set(email, member);
      }
    }
  }
  const recipients = new Set();
  for (const [email, member] of byEmail) {
    if (member.active === true && ["coach", "website-admin"].includes(member.role)) {
      recipients.add(email);
    }
  }
  // Legacy coach addresses are authorized only if no member record exists, or
  // if their existing member record is still active.
  for (const address of fallbackEmails) {
    if (typeof address !== "string") continue;
    const email = address.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      (!byEmail.has(email) || byEmail.get(email).active === true)) recipients.add(email);
  }
  return [...recipients];
}

module.exports = {
  issueSeasonCancellation,
  requestSeasonCancellation,
  processSeasonCancellationRequest,
  confirmSeasonCancellation,
  seasonCancellationCoachEmails,
};