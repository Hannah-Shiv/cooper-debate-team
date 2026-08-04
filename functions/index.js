// Cooper Debate Team — Cloud Function
// Triggered when a new announcement is added to Firestore.
// Sends an FCM push notification to every registered device token.

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

admin.initializeApp();

exports.notifyOnAnnouncement = functions.firestore
  .document("announcements/{docId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data) return null;

    const db       = admin.firestore();
    const postedBy = (data.postedBy || "").toLowerCase();

    // Fetch all registered FCM tokens
    const tokensSnap = await db.collection("fcm-tokens").get();
    if (tokensSnap.empty) return null;

    const tokens = [];
    tokensSnap.forEach(doc => {
      // Skip the person who just posted
      if (doc.id.toLowerCase() !== postedBy) {
        const t = doc.data().token;
        if (t) tokens.push(t);
      }
    });

    if (tokens.length === 0) return null;

    const bodyText = data.details
      ? data.details.substring(0, 100)
      : "Tap to open the Members Portal.";

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `Cooper Debate — ${data.category || "General"}`,
        body:  `${data.title}: ${bodyText}`,
      },
      webpush: {
        notification: {
          icon:  "https://cooperdebateteam.com/images/cooper-debate-badge.png",
          badge: "https://cooperdebateteam.com/images/cooper-debate-badge.png",
          requireInteraction: false,
        },
        fcm_options: {
          link: "https://cooperdebateteam.com/members.html",
        },
      },
    });

    // Clean up stale/invalid tokens so they don't pile up
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

    return null;
  });
