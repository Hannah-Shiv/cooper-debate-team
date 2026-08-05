// Cooper Debate Team — Cloud Function
// Triggered when a new announcement or tournament is added to Firestore.
// Sends an FCM push notification to every registered device token.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp }     = require("firebase-admin/app");
const { getMessaging }      = require("firebase-admin/messaging");
const { getFirestore }      = require("firebase-admin/firestore");

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

  const response = await getMessaging().sendEachForMulticast({
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
    tokensSnap.forEach(doc => {
      if (staleTokens.includes(doc.data().token)) {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();
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
