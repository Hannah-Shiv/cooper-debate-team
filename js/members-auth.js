// ============================================================
// Cooper Debate Team — Members Portal Authentication
// Passwordless sign-in via Firebase Email Link
// No passwords are ever stored.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
  authDomain: "cooper-debate-team.firebaseapp.com",
  projectId: "cooper-debate-team",
  storageBucket: "cooper-debate-team.firebasestorage.app",
  messagingSenderId: "112813790184",
  appId: "1:112813790184:web:ac559cb64747d7fd590a5d"
};

// Web Push VAPID key — from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = "BFwWFUfvb37fGaFBKYNJa29rEKtBHaT4FGnGsAKXTj_M7fxvDjsKgZobBGuKVytQrZ1-p8Yl_uZ_TNUlo0q0jsg";

const SIGN_IN_REDIRECT_URL = "https://cooperdebateteam.com/members.html";
const STORAGE_KEY = "cooper_signin_email";

// ── Initialise Firebase ──────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth      = firebase.auth();
const db        = firebase.firestore();
const messaging = firebase.messaging ? firebase.messaging() : null;

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ── Session state ─────────────────────────────────────────────
let currentUserEmail  = "";
let currentUserRole   = "member"; // "coach" | "mentor" | "member"
let unsubAnnouncements = null;

// ── On page load ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (auth.isSignInWithEmailLink(window.location.href)) {
    completeMagicLinkSignIn();
    return;
  }
  auth.onAuthStateChanged(user => {
    if (user) {
      handleAuthenticatedUser(user.email);
    } else {
      showState("login");
    }
  });
});

// ── Send magic link ──────────────────────────────────────────
function sendSignInLink() {
  const emailInput = document.getElementById("email-input");
  const btn        = document.getElementById("send-link-btn");
  const email      = (emailInput.value || "").trim().toLowerCase();

  clearError();

  if (!email || !email.includes("@")) {
    showError("Please enter a valid email address.");
    return;
  }

  if (!isApprovedMember(email)) {
    showError("This email is not on the approved members list. Please contact Coach Konde to request access.");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Sending…";

  auth.sendSignInLinkToEmail(email, { url: SIGN_IN_REDIRECT_URL, handleCodeInApp: true })
    .then(() => {
      localStorage.setItem(STORAGE_KEY, email);
      document.getElementById("pending-email").textContent = email;
      showState("pending");
    })
    .catch(err => {
      btn.disabled    = false;
      btn.textContent = "Send Sign-In Link →";
      if (err.code === "auth/quota-exceeded") {
        showError("Daily sign-in limit reached. Please try again tomorrow, or contact Coach Konde for help.");
      } else {
        showError("Could not send sign-in link. Please try again.");
      }
      console.error("sendSignInLinkToEmail error:", err);
    });
}

// ── Complete sign-in when user clicks link in email ──────────
function completeMagicLinkSignIn() {
  showState("completing");

  let email = localStorage.getItem(STORAGE_KEY);
  if (!email) {
    email = window.prompt("Please re-enter your email address to complete sign-in:");
  }
  if (!email) { showState("login"); return; }

  auth.signInWithEmailLink(email.trim().toLowerCase(), window.location.href)
    .then(result => {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
      handleAuthenticatedUser(result.user.email);
    })
    .catch(err => {
      console.error("signInWithEmailLink error:", err);
      showState("login");
      setTimeout(() => showError("That sign-in link has expired or already been used. Please request a new one."), 50);
    });
}

// ── Handle a verified, signed-in user ────────────────────────
function handleAuthenticatedUser(email) {
  if (isApprovedMember(email)) {
    showDashboard(email);
  } else {
    auth.signOut();
    showState("denied");
  }
}

// ── Sign out ──────────────────────────────────────────────────
function handleSignOut() {
  if (unsubAnnouncements) { unsubAnnouncements(); unsubAnnouncements = null; }
  auth.signOut().then(() => showState("login"));
}

// ── Go back to login ──────────────────────────────────────────
function showLogin() {
  clearError();
  const input = document.getElementById("email-input");
  if (input) input.value = "";
  showState("login");
}

// ── Show dashboard + role-based UI ───────────────────────────
function showDashboard(email) {
  currentUserEmail = email.toLowerCase();
  currentUserRole  = getAdminRole(email); // from data/admins.js

  // Email display
  const emailEl = document.getElementById("member-email");
  if (emailEl) emailEl.textContent = email;

  // Role badge
  const badgeEl = document.getElementById("member-role-badge");
  if (badgeEl) {
    if (currentUserRole === "coach") {
      badgeEl.textContent = "🛡️ Coach";
      badgeEl.style.cssText += ";background:rgba(212,160,23,0.22);border-color:rgba(212,160,23,0.5);color:var(--gold);";
    } else if (currentUserRole === "mentor") {
      badgeEl.textContent = "⭐ Mentor";
      badgeEl.style.cssText += ";background:rgba(168,85,247,0.15);border-color:rgba(168,85,247,0.4);color:#d8b4fe;";
    }
  }

  // Show admin panel for coach + mentor
  const adminPanel = document.getElementById("admin-panel");
  if (adminPanel && (currentUserRole === "coach" || currentUserRole === "mentor")) {
    adminPanel.style.display = "";
    const titleEl = document.getElementById("admin-panel-title");
    if (titleEl) titleEl.textContent = currentUserRole === "coach" ? "Coach Panel" : "Mentor Panel";
  }

  // Start real-time announcements listener
  loadAnnouncements();

  // Request notification permission (prompts browser dialog once)
  requestNotificationPermission();

  // Register FCM token for background push (Phase 2)
  registerFcmToken(currentUserEmail);

  showState("dashboard");

  // Load Drive file data for resource cards (Phase C)
  if (typeof loadDriveData === 'function') loadDriveData();
}

// ── Post announcement ─────────────────────────────────────────
function postAnnouncement() {
  const title     = (document.getElementById("ann-title").value    || "").trim();
  const category  =  document.getElementById("ann-category").value;
  const details   = (document.getElementById("ann-details").value  || "").trim();
  const driveLink = (document.getElementById("ann-drive").value    || "").trim();

  if (!title) { showAnnounceStatus("Please enter a title.", true); return; }

  const btn = document.getElementById("announce-btn");
  btn.disabled    = true;
  btn.textContent = "Posting…";

  db.collection("announcements").add({
    title,
    category,
    details,
    driveLink,
    postedBy:     currentUserEmail,
    postedByRole: currentUserRole,
    timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
  })
  .then(() => {
    document.getElementById("ann-title").value    = "";
    document.getElementById("ann-details").value  = "";
    document.getElementById("ann-drive").value    = "";
    document.getElementById("ann-category").value = "General";
    btn.disabled    = false;
    btn.textContent = "Announce →";
    showAnnounceStatus("✓ Posted!", false);
    setTimeout(hideAnnounceStatus, 3000);
  })
  .catch(err => {
    console.error("postAnnouncement error:", err);
    btn.disabled    = false;
    btn.textContent = "Announce →";
    showAnnounceStatus("Failed to post. Please try again.", true);
  });
}

// ── Load announcements (real-time listener) ───────────────────
function loadAnnouncements() {
  const feed = document.getElementById("announcements-feed");
  if (!feed) return;

  if (unsubAnnouncements) unsubAnnouncements(); // detach old listener

  let firstLoad = true;

  unsubAnnouncements = db.collection("announcements")
    .orderBy("timestamp", "desc")
    .limit(30)
    .onSnapshot(snapshot => {
      // Fire browser notification for newly added docs (not on first load)
      if (!firstLoad) {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
            notifyNewAnnouncement(change.doc.data());
          }
        });
      }
      firstLoad = false;

      if (snapshot.empty) {
        feed.innerHTML = '<div class="ann-empty">📢 No announcements yet — check back soon.</div>';
        return;
      }
      feed.innerHTML = snapshot.docs.map(doc => renderAnnouncement(doc.id, doc.data())).join("");
    }, err => {
      console.error("loadAnnouncements error:", err);
      feed.innerHTML = '<div class="ann-empty">Could not load announcements. Please refresh the page.</div>';
    });
}

// ── FCM token registration (background push — Phase 2) ────────
async function registerFcmToken(email) {
  if (!messaging || VAPID_KEY === "REPLACE_WITH_VAPID_KEY") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    // Register the service worker that handles background messages
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    // Get (or refresh) the FCM token for this device
    const token = await messaging.getToken({
      vapidKey:           VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) return;

    // Store under the user's email so the Cloud Function can look it up
    await db.collection("fcm-tokens").doc(email.toLowerCase()).set({
      token,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal — Phase 1 (tab-open) notifications still work
    console.warn("FCM token registration failed:", err.message);
  }
}

// ── Browser notifications ─────────────────────────────────────
function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    // Delay slightly so it doesn't fire the instant the page loads
    setTimeout(() => {
      Notification.requestPermission().then(updateNotifBtn);
    }, 1500);
  }
  updateNotifBtn();
}

function updateNotifBtn() {
  const btn = document.getElementById("notif-btn");
  if (!btn || !("Notification" in window)) return;
  const perm = Notification.permission;
  if (perm === "granted") {
    btn.textContent = "🔔";
    btn.title       = "Notifications on — you'll be alerted when Coach posts";
    btn.style.opacity = "1";
  } else if (perm === "denied") {
    btn.textContent = "🔕";
    btn.title       = "Notifications blocked — enable in browser settings";
    btn.style.opacity = "0.45";
  } else {
    btn.textContent = "🔔";
    btn.title       = "Click to enable notifications";
    btn.style.opacity = "0.55";
  }
}

function toggleNotifications() {
  if (!("Notification" in window)) {
    alert("Your browser does not support notifications.");
    return;
  }
  if (Notification.permission === "granted") {
    alert("Notifications are on ✓\nYou'll see a pop-up whenever Coach or a mentor posts an announcement.");
    return;
  }
  if (Notification.permission === "denied") {
    alert("Notifications are blocked.\nTo enable: click the lock icon in your browser address bar → Notifications → Allow.");
    return;
  }
  Notification.requestPermission().then(updateNotifBtn);
}

function notifyNewAnnouncement(data) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  // Don't notify if this user posted it
  if (data.postedBy === currentUserEmail) return;

  const body = data.details
    ? data.details.substring(0, 120)
    : "Tap to view in the portal.";

  const n = new Notification("Cooper Debate Team", {
    body:  `[${data.category || "General"}] ${data.title}\n${body}`,
    icon:  "/images/cooper-debate-badge.png",
    badge: "/images/cooper-debate-badge.png",
    tag:   "cooper-announcement-" + Date.now(),
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// ── Delete announcement ───────────────────────────────────────
function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  db.collection("announcements").doc(id).delete()
    .catch(err => console.error("deleteAnnouncement error:", err));
}

// ── Render one announcement card ──────────────────────────────
function renderAnnouncement(id, data) {
  const catClass = {
    Practice:   "ann-cat-practice",
    Tournament: "ann-cat-tournament",
    General:    "ann-cat-general"
  }[data.category] || "ann-cat-general";

  const timeStr   = timeAgo(data.timestamp);
  const details   = data.details   ? `<div class="ann-details">${escHtml(data.details)}</div>` : "";
  const driveLink = data.driveLink ? `<a href="${escHtml(data.driveLink)}" target="_blank" rel="noopener" class="ann-drive-link">📎 Open Drive File →</a>` : "";

  // Coach can delete any; mentor can delete their own
  const canDelete = currentUserRole === "coach" || data.postedBy === currentUserEmail;
  const deleteBtn = canDelete
    ? `<button class="ann-delete-btn" onclick="deleteAnnouncement('${id}')" title="Delete">✕ Remove</button>`
    : "";

  const posterLabel = data.postedByRole === "coach" ? "Coach" : "Mentor";

  return `
    <div class="announcement-card" id="ann-${id}">
      <div class="ann-header">
        <div class="ann-title-row">
          <span class="ann-cat-badge ${catClass}">${escHtml(data.category || "General")}</span>
          <span class="ann-title">${escHtml(data.title)}</span>
        </div>
        <span class="ann-meta">${timeStr}</span>
      </div>
      ${details}
      ${driveLink}
      <div class="ann-footer">
        <span class="ann-poster">Posted by ${posterLabel}</span>
        ${deleteBtn}
      </div>
    </div>`;
}

// ── Whitelist check ───────────────────────────────────────────
function isApprovedMember(email) {
  return APPROVED_MEMBERS.some(e => e.toLowerCase() === email.toLowerCase());
}

// ── UI state machine ─────────────────────────────────────────
function showState(state) {
  ["login","pending","completing","dashboard","denied"].forEach(s => {
    const el = document.getElementById("state-" + s);
    if (el) el.style.display = s === state ? "" : "none";
  });
}

// ── Error helpers ─────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById("login-error");
  if (!el) return;
  el.textContent  = msg;
  el.style.display = "block";
}
function clearError() {
  const el = document.getElementById("login-error");
  if (el) el.style.display = "none";
}
function showAnnounceStatus(msg, isError) {
  const el = document.getElementById("announce-status");
  if (!el) return;
  el.textContent   = msg;
  el.style.color   = isError ? "#fca5a5" : "#86efac";
  el.style.display = "";
}
function hideAnnounceStatus() {
  const el = document.getElementById("announce-status");
  if (el) el.style.display = "none";
}

// ── Utility helpers ───────────────────────────────────────────
function timeAgo(timestamp) {
  if (!timestamp) return "";
  const d    = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);

  if (diff < 60)   return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";

  const timeStr = d.toLocaleTimeString("en-US", {
    hour:     "numeric",
    minute:   "2-digit",
    timeZone: "America/New_York"
  });

  const today  = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const postDay = d.toLocaleDateString("en-US",  { timeZone: "America/New_York" });

  if (today === postDay) return timeStr + " EST";

  const dateStr = d.toLocaleDateString("en-US", {
    month:    "short",
    day:      "numeric",
    timeZone: "America/New_York"
  });
  return dateStr + " at " + timeStr + " EST";
}

function escHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
