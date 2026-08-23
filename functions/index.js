// Cooper Debate Team — Cloud Function
// Triggered when a new announcement or tournament is added to Firestore.
// Sends an FCM push notification to every registered device token.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest }         = require("firebase-functions/v2/https");
const { initializeApp }     = require("firebase-admin/app");
const { getAuth }           = require("firebase-admin/auth");
const { getMessaging }      = require("firebase-admin/messaging");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { defineSecret }      = require("firebase-functions/params");
const crypto = require("node:crypto");

initializeApp();

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

// ── Public tournament volunteer signup ─────────────────────────
// The browser receives only published event details, role availability, and
// the parent/debater names and availability that families have agreed to show.
// Contact details remain coach-only; writes are validated with the Admin SDK.
const COACH_EMAILS = new Set([
  "pgkonde@fcps.edu",
  "hannahbshiv@gmail.com",
]);
const turnstileSecret = defineSecret("TURNSTILE_SECRET_KEY");
const TURNSTILE_HOSTNAMES = new Set([
  "cooperdebateteam.com",
  "www.cooperdebateteam.com",
]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanTime(value) {
  const time = cleanText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
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

function publicVolunteerEvent(id, data) {
  return {
    id,
    title:          cleanText(data.title, 160),
    date:           cleanText(data.date, 32),
    location:        cleanText(data.location, 200),
    address:         cleanText(data.address, 240),
    startTime:       cleanTime(data.startTime),
    endTime:         cleanTime(data.endTime),
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
  { region: "us-central1", cors: true, secrets: [turnstileSecret] },
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

    // Hidden honeypot field. Bots should not receive a useful success response.
    if (body.company) {
      res.status(200).json({ ok: true });
      return;
    }

    if (!eventId || !roleId || !parentFirstName || !parentLastName || !validEmail(email) || !phone || !availabilityStart || !availabilityEnd) {
      res.status(400).json({ error: "Please provide your first and last name, contact details, and judging availability." });
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

    try {
      await verifyTurnstile(turnstileToken);
      let selectedRole;
      await db.runTransaction(async transaction => {
        const [eventSnap, signupSnap, duplicateSnap] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(signupRef),
          transaction.get(duplicateRef),
        ]);

        if (!eventSnap.exists || !eventSnap.data().published) {
          throw new Error("This volunteer opportunity is no longer available.");
        }
        const eventStartTime = cleanTime(eventSnap.data().startTime);
        const eventEndTime = cleanTime(eventSnap.data().endTime);
        if (
          eventStartTime && eventEndTime &&
          (timeMinutes(availabilityStart) < timeMinutes(eventStartTime) ||
            timeMinutes(availabilityEnd) > timeMinutes(eventEndTime))
        ) {
          throw new Error("Please choose a judging window within the published tournament hours.");
        }
        if (signupSnap.exists || duplicateSnap.exists) {
          throw new Error("You are already signed up for this tournament.");
        }

        const roles = cleanRoles(eventSnap.data().roles);
        const roleIndex = roles.findIndex(role => role.id === roleId);
        if (roleIndex < 0) {
          throw new Error("That volunteer role is no longer available.");
        }

        selectedRole = roles[roleIndex];
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
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(duplicateRef, {
          eventId,
          signupId,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      res.status(201).json({ ok: true, message: "You’re signed up. Thank you for supporting Cooper Debate!" });
    } catch (error) {
      const message = error && error.message
        ? error.message
        : "We could not complete your signup. Please try again.";
      console.error("publicVolunteerSignup POST failed:", error);
      res.status(400).json({ error: message });
    }
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

    if (!COACH_EMAILS.has((decoded.email || "").toLowerCase())) {
      res.status(403).json({ error: "Only coaches can manage volunteer signups." });
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
          updatedAt: FieldValue.serverTimestamp(),
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "saveEvent") {
        const requestedId = cleanText(body.eventId, 160);
        const incoming = body.event || {};
        const title = cleanText(incoming.title, 160);
        const date = cleanText(incoming.date, 32);
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
          throw new Error("Add an event title, date, and at least one volunteer role.");
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
          if (existingSnap.exists) transaction.update(eventRef, data);
          else transaction.set(eventRef, { ...data, createdAt: FieldValue.serverTimestamp() });
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
