// ------------------------------------------------------------
// Cooper Debate Team — Members Portal Authentication
// Google Workspace sign-in for approved FCPS identities plus
// passwordless email-link sign-in for approved non-FCPS adults.
// ------------------------------------------------------------

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

const SIGN_IN_REDIRECT_URL = window.location.origin + "/members-signon.html";
const STORAGE_KEY = "cooper_signin_email";
const GOOGLE_REDIRECT_KEY = "cooper_google_redirect_pending";
const FCPS_GOOGLE_DOMAINS = ["fcps.edu", "fcpsschools.net"];

// ── Initialise Firebase ──────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth      = firebase.auth();
const db        = firebase.firestore();
const messaging = firebase.messaging ? firebase.messaging() : null;
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

const persistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ── Session state ─────────────────────────────────────────────
let currentUserEmail  = "";
let currentUserRole   = "member"; // "member" | "captain" | "coach" | "website-admin"
let currentMemberAccess = null;
let unsubAnnouncements = null;
let allAnnouncementDocs = [];
let hidePreviewTimer   = null;

// ── On page load ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (auth.isSignInWithEmailLink(window.location.href)) {
    completeMagicLinkSignIn();
    return;
  }

  const completingGoogleRedirect =
    sessionStorage.getItem(GOOGLE_REDIRECT_KEY) === "1";

  if (completingGoogleRedirect) {
    showState("completing");
  }

  persistenceReady
    .then(() => auth.getRedirectResult())
    .then(result => {
      sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      if (result && result.user) {
        handleGoogleAuthenticatedUser(result.user);
        return;
      }
      watchForExistingSession(completingGoogleRedirect);
    })
    .catch(err => {
      sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      console.error("getRedirectResult error:", err);
      showState("login");
      showError(googleAuthErrorMessage(err));
    });
});

function watchForExistingSession(requireFcpsGoogle = false) {
  auth.onAuthStateChanged(user => {
    if (user) {
      handleExistingAuthenticatedUser(user, requireFcpsGoogle);
    } else {
      showState("login");
    }
  });
}

async function handleExistingAuthenticatedUser(user, requireFcpsGoogle = false) {
  try {
    const tokenResult = await user.getIdTokenResult();
    const provider = tokenResult && tokenResult.signInProvider;
    return await handleAuthenticatedUser(user.email, {
      fcpsGoogle: requireFcpsGoogle || provider === "google.com",
    });
  } catch (err) {
    console.error("Could not verify sign-in provider:", err);
    denyAuthenticatedUser("Your sign-in could not be verified. Please try again.");
  }
}
async function signInWithFcpsGoogle() {
  const btn = document.getElementById("google-signin-btn");
  clearError();
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Connecting to FCPS Google…";
  }

  sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
  showState("completing");

  // Popup sign-in is initiated directly by the student's click. Unlike
  // signInWithRedirect, it does not need Firebase's cross-site redirect
  // session storage, which managed Chrome policies may block on GitHub Pages.
  let popupWindow = null;
  let popupCloseTimer = null;
  let windowOpenRestoreTimer = null;
  const originalWindowOpen = window.open;

  // Firebase opens the account chooser internally, so briefly wrap window.open
  // to retain its window handle and detect a user closing it immediately.
  function restoreWindowOpen() {
    if (window.open === capturePopupOpen) window.open = originalWindowOpen;
    if (windowOpenRestoreTimer) {
      window.clearTimeout(windowOpenRestoreTimer);
      windowOpenRestoreTimer = null;
    }
  }
  function capturePopupOpen(...args) {
    popupWindow = originalWindowOpen.apply(window, args);
    restoreWindowOpen();
    return popupWindow;
  }
  window.open = capturePopupOpen;

  let popupPromise;
  try {
    await persistenceReady;
    popupPromise = auth.signInWithPopup(googleProvider);
  } catch (err) {
    restoreWindowOpen();
    restoreLoginAfterGoogleCancel();
    if (!err || err.code !== "auth/popup-closed-by-user") {
      showError(googleAuthErrorMessage(err));
      console.error("signInWithPopup error:", err);
    }
    return;
  }
  if (window.open === capturePopupOpen) {
    windowOpenRestoreTimer = window.setTimeout(restoreWindowOpen, 2000);
  }

  // Consume a later Firebase rejection if the user closes the popup before
  // Firebase's own polling loop notices it.
  popupPromise.catch(() => {});

  try {
    const popupClosed = new Promise(resolve => {
      const checkPopup = () => {
        if (popupWindow && popupWindow.closed) {
          resolve({ closed: true });
          return;
        }
        popupCloseTimer = window.setTimeout(checkPopup, 50);
      };
      checkPopup();
    });
    const outcome = await Promise.race([
      popupPromise.then(result => ({ result })),
      popupClosed,
    ]);

    if (outcome.closed) {
      restoreLoginAfterGoogleCancel();
      return;
    }

    await handleGoogleAuthenticatedUser(outcome.result.user);
  } catch (err) {
    if (err && err.code === "auth/popup-closed-by-user") {
      restoreLoginAfterGoogleCancel();
      return;
    } else {
      sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      resetGoogleButton();
      showState("login");
      showError(googleAuthErrorMessage(err));
    }
    console.error("signInWithPopup error:", err);
  } finally {
    restoreWindowOpen();
    if (popupCloseTimer) window.clearTimeout(popupCloseTimer);
  }
}

function restoreLoginAfterGoogleCancel() {
  sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
  resetGoogleButton();
  clearError();
  showState("login");
}

function handleGoogleAuthenticatedUser(user) {
  const email = normalizeEmail(user && user.email);
  if (!isFcpsGoogleEmail(email)) {
    denyAuthenticatedUser("Please use an approved FCPS Google Workspace account ending in @fcps.edu or @fcpsschools.net.");
    return;
  }
  handleAuthenticatedUser(email, { fcpsGoogle: true });
}

function googleAuthErrorMessage(err) {
  switch (err && err.code) {
    case "auth/operation-not-allowed":
      return "FCPS Google sign-in is not available yet. Please contact Coach Konde.";
    case "auth/unauthorized-domain":
      return "This portal address is not authorized for Google sign-in. Please contact Coach Konde.";
    case "auth/network-request-failed":
      return "Google sign-in could not connect. Check the school network and try again.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed before sign-in finished.";
    case "auth/web-storage-unsupported":
      return "This browser’s privacy settings blocked Google sign-in. Please contact Coach Konde.";
    case "auth/account-exists-with-different-credential":
      return "This account already uses another sign-in method. Please use the approved non-FCPS email option.";
    default:
      return "Google sign-in could not be completed. Please try again or contact Coach Konde.";
  }
}

function resetGoogleButton() {
  const btn = document.getElementById("google-signin-btn");
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `
    <img class="fcps-logo" src="images/fcps-google-logo.png" alt="" aria-hidden="true"/>
    <svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.23c0-.79-.07-1.55-.23-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42z"/>
      <path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.53A9.74 9.74 0 0 0 12 21.67z"/>
      <path fill="#FBBC05" d="M6.51 13.74a5.85 5.85 0 0 1 0-3.48V7.73H3.27a9.75 9.75 0 0 0 0 8.54l3.24-2.53z"/>
      <path fill="#EA4335" d="M12 6.22c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.83 3.3 14.63 2.33 12 2.33a9.74 9.74 0 0 0-8.73 5.4l3.24 2.53C7.29 7.94 9.45 6.22 12 6.22z"/>
    </svg>
    <span class="google-label">Sign in with FCPS Google Workspace</span>`;
}

// ── Send magic link ──────────────────────────────────────────
async function sendSignInLink() {
  const emailInput = document.getElementById("email-input");
  const btn        = document.getElementById("send-link-btn");
  if (!emailInput || !btn) return;
  const email      = (emailInput.value || "").trim().toLowerCase();

  clearError();

  if (!email || !email.includes("@")) {
    showError("Please enter a valid email address.");
    return;
  }

  if (isFcpsGoogleEmail(email)) {
    showError("FCPS accounts should use Continue with FCPS Google above.");
    return;
  }

  const eligibility = await getLoginEligibility(db, email);
  if (!eligibility.approved) {
    showError(eligibility.source === "directory" && !eligibility.active
      ? "This member account is inactive. Please contact Coach Konde or a Website Admin."
      : "This email is not approved for portal access. Please contact Coach Konde or a Website Admin.");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Sending…";

  return auth.sendSignInLinkToEmail(email, { url: SIGN_IN_REDIRECT_URL, handleCodeInApp: true })
    .then(() => {
      localStorage.setItem(STORAGE_KEY, email);
      document.getElementById("pending-email").textContent = email;
      showState("pending");
    })
    .catch(err => {
      btn.disabled    = false;
      btn.textContent = "Send Sign-In Link";
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
  if (!email) { showState("login"); return Promise.resolve(); }

  return auth.signInWithEmailLink(email.trim().toLowerCase(), window.location.href)
    .then(result => {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
      return handleAuthenticatedUser(result.user.email);
    })
    .catch(err => {
      console.error("signInWithEmailLink error:", err);
      showState("login");
      setTimeout(() => showError("That sign-in link has expired or already been used. Please request a new one."), 50);
    });
}

// ── Handle a verified, signed-in user ────────────────────────
async function handleAuthenticatedUser(email, options = {}) {
  const normalizedEmail = normalizeEmail(email);

  if (options.fcpsGoogle && !isFcpsGoogleEmail(normalizedEmail)) {
    denyAuthenticatedUser("Please use an approved FCPS Google Workspace account ending in @fcps.edu or @fcpsschools.net.");
    return;
  }

  showState("completing");
  const access = await getMemberAccess(db, normalizedEmail);
  currentMemberAccess = access;
  currentUserRole = access.role;

  if (access.approved) {
    // members-signon.html and members.html are auth gateways — redirect to portal home.
    // On any other member page, show the dashboard in place (avoids redirect loop).
    var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (page === 'members-signon.html' || page === 'members.html' || page === '') {
      window.location.href = 'members-resources.html';
    } else {
      showDashboard(normalizedEmail);
    }
  } else {
    denyAuthenticatedUser(access.source === "directory" && !access.active
      ? "Your member account is inactive. Contact Coach Konde or a Website Admin if you need access restored."
      : "Your email is not approved for the Members Portal.");
  }
}
function denyAuthenticatedUser(message) {
  const deniedMessage = document.getElementById("denied-message");
  if (deniedMessage) deniedMessage.textContent = message;
  auth.signOut().finally(() => showState("denied"));
}

// ── Sign out ──────────────────────────────────────────────────
function handleSignOut() {
  if (unsubAnnouncements) { unsubAnnouncements(); unsubAnnouncements = null; }
  auth.signOut().then(() => showState("login"));
}

// ── Go back to login ──────────────────────────────────────────
function showLogin() {
  clearError();
  resetGoogleButton();
  const input = document.getElementById("email-input");
  if (input) input.value = "";
  showState("login");
}

function showAdultEmailLogin() {
  const panel = document.getElementById("adult-email-panel");
  const toggle = document.getElementById("adult-email-toggle");
  if (panel) panel.style.display = "block";
  if (toggle) toggle.style.display = "none";
  const input = document.getElementById("email-input");
  if (input) input.focus();
}
function showDashboard(email) {
  currentUserEmail = email.toLowerCase();
  currentUserRole  = currentMemberAccess
    ? normalizePortalRole(currentMemberAccess.role)
    : normalizePortalRole(getAdminRole(email));

  // Email display
  const emailEl = document.getElementById("member-email");
  if (emailEl) emailEl.textContent = email;

  // First name
  const nameEl = document.getElementById("member-name");
  if (nameEl) {
    nameEl.textContent =
      (currentMemberAccess && currentMemberAccess.name) ||
      (typeof MEMBER_NAMES !== "undefined" && MEMBER_NAMES[email.toLowerCase()]) ||
      email.split('@')[0];
  }

  // Role badge
  const badgeEl = document.getElementById("member-role-badge");
  if (badgeEl) {
    if (currentUserRole === "coach") {
      badgeEl.textContent = "🛡️ Coach";
    } else if (currentUserRole === "website-admin") {
      badgeEl.textContent = "🛡️ Website Admin";
    } else if (currentUserRole === "captain") {
      badgeEl.textContent = "⭐ Captain";
    } else {
      badgeEl.textContent = "✓ Team Member";
    }
  }

  // Show floating post button for coach + captain (fade in to avoid layout flash)
  const fab = document.getElementById("post-fab");
  if (fab && canManageMemberContentRole(currentUserRole)) {
    fab.style.opacity = "0";
    fab.style.display = "flex";
    requestAnimationFrame(() => {
      fab.style.transition = "opacity 0.35s ease";
      fab.style.opacity = "1";
    });
  }

  // Show notification error log for coaches and website admins
  if (isFullAdminRole(currentUserRole)) {
    const panel = document.getElementById("notif-errors-panel");
    if (panel) panel.style.display = "";
    loadNotifErrors();
  }

  // Reveal fixed userbar
  const userbar = document.getElementById("member-userbar");
  if (userbar) userbar.classList.add("visible");

  // Start real-time announcements listener
  loadAnnouncements();

  // Start listening for new calendar events — fires browser push when one is added
  startEventsListener();

  // Load pinned files for resource cards (Phase D)
  loadResourcePins();

  // Request notification permission (prompts browser dialog once)
  requestNotificationPermission();

  // Register FCM token for background push (Phase 2)
  registerFcmToken(currentUserEmail);

  showState("dashboard");

  // Load Drive file data for resource cards (Phase C)
  if (typeof loadDriveData === 'function') loadDriveData();
}

// ── Email helper (writes to Firestore "mail" collection) ─────
// The Firebase Trigger Email extension picks this up and sends via Gmail SMTP.
function writeMailDoc(subject, htmlBody, textBody) {
  const bcc = APPROVED_MEMBERS.map(e => e.toLowerCase()).join(",");
  return db.collection("mail").add({
    to:      "cooperdebateteam@gmail.com",
    bcc,
    message: { subject, html: htmlBody, text: textBody },
  }).catch(err => console.warn("[Email] writeMailDoc failed:", err));
}

function announcementEmailHtml(title, category, details, driveLink) {
  const detailsBlock = details
    ? `<p style="color:#cbd5e0;font-size:15px;line-height:1.7;margin:16px 0 0;">${details.replace(/\n/g,"<br>")}</p>`
    : "";
  const driveBlock = driveLink
    ? `<p style="margin:14px 0 0;"><a href="${driveLink}" style="color:#93c5fd;font-size:13px;">📎 View attached file →</a></p>`
    : "";
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;background:#0d1b3e;color:#fff;border-radius:8px;overflow:hidden;">
  <div style="background:#091530;padding:20px 28px;border-bottom:3px solid #ffd700;">
    <span style="font-size:20px;font-weight:700;color:#ffd700;letter-spacing:1px;">🦅 Cooper Debate Team</span>
  </div>
  <div style="padding:28px;">
    <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px;">Team Announcement</p>
    <h2 style="color:#fff;font-size:19px;margin:0 0 10px;">${title}</h2>
    <span style="background:#1e3a6e;color:#93c5fd;font-size:11px;padding:3px 10px;border-radius:12px;">${category || "General"}</span>
    ${detailsBlock}${driveBlock}
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1e3a6e;">
      <a href="https://cooperdebateteam.com/members.html" style="display:inline-block;background:#ffd700;color:#0d1b3e;font-weight:700;padding:10px 22px;border-radius:5px;text-decoration:none;font-size:14px;">View in Members Portal →</a>
    </div>
  </div>
  <div style="background:#091530;padding:14px 28px;text-align:center;color:#4a5568;font-size:11px;">
    Cooper High School Debate Team · You're receiving this as a registered team member.
  </div>
</div>`;
}

// ── New-event push notification (browser, members page) ───────
function notifyNewEvent(data) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (data.postedBy === currentUserEmail) return;
  const typeLabel = data.type === "tournament" ? "🏆 Tournament"
                  : data.type === "practice"   ? "🎯 Practice"
                  : "📋 Meeting";
  const body = data.location ? `${typeLabel} · ${data.location}` : typeLabel;
  const n = new Notification("Cooper Debate — New Event Posted", {
    body:  `${data.title}\n${body}`,
    icon:  "/images/cooper-debate-badge.png",
    badge: "/images/cooper-debate-badge.png",
    tag:   "cooper-event-" + Date.now(),
  });
  n.onclick = () => { window.open("members-calendar.html", "_blank"); n.close(); };
}

// ── Listen for new calendar events posted after page load ─────
function startEventsListener() {
  const since = firebase.firestore.Timestamp.now();
  db.collection("tournaments")
    .where("createdAt", ">", since)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === "added") notifyNewEvent(change.doc.data());
      });
    }, err => console.warn("[Events listener]", err));
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
    setTimeout(() => { hideAnnounceStatus(); closePostModal(); }, 1400);

    // Send email to all members
    const subject  = `[Cooper Debate] ${category ? "[" + category + "] " : ""}${title}`;
    const textBody = `${title}\nCategory: ${category || "General"}\n\n${details || ""}\n\n${driveLink ? "File: " + driveLink + "\n\n" : ""}View in portal: https://cooperdebateteam.com/members.html`;
    writeMailDoc(subject, announcementEmailHtml(title, category, details, driveLink), textBody);
  })
  .catch(err => {
    console.error("postAnnouncement error:", err);
    btn.disabled    = false;
    btn.textContent = "Announce →";
    showAnnounceStatus("Failed to post. Please try again.", true);
  });
}

// ── Load announcements → renders timeline ─────────────────────
function loadAnnouncements() {
  if (unsubAnnouncements) unsubAnnouncements();
  let firstLoad = true;

  unsubAnnouncements = db.collection("announcements")
    .orderBy("timestamp", "desc")
    .limit(30)
    .onSnapshot(snapshot => {
      if (!firstLoad) {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") notifyNewAnnouncement(change.doc.data());
        });
      }
      firstLoad = false;
      allAnnouncementDocs = snapshot.docs;
      renderTimeline(snapshot.docs.slice(0, 10));
      // Refresh view-all modal if it's open
      const m = document.getElementById("all-modal");
      if (m && m.style.display !== "none") renderAllList();
    }, err => {
      console.error("loadAnnouncements:", err);
      const tl = document.getElementById("ann-timeline");
      if (tl) tl.innerHTML = '<div class="ann-tl-empty">Could not load announcements. Please refresh.</div>';
    });
}

// ── Timeline ──────────────────────────────────────────────────
// Docs arrive newest-first from Firestore; reverse → oldest left, newest right
function catKeyFor(cat) {
  return (cat || "").toLowerCase() === "important" ? "important" : "normal";
}

function renderTimeline(docs) {
  const tl = document.getElementById("ann-timeline");
  if (!tl) return;
  if (!docs.length) {
    tl.innerHTML = '<div class="ann-tl-empty">📢 No announcements yet — check back soon.</div>';
    return;
  }

  // Reverse so oldest = left, newest = right
  const ordered = docs.slice().reverse();

  tl.innerHTML = `
    <div class="ann-tl-nav">
      <button class="ann-tl-arrow" id="tl-arr-l" onclick="tlScroll(-1)" aria-label="Older announcements">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ann-tl-track-wrap" id="ann-tl-wrap">
        <div class="ann-tl-track" id="ann-tl-track">
          <div class="ann-tl-line"></div>
          ${ordered.map((doc, i) => renderTimelineDot(doc.id, doc.data(), i, i === ordered.length - 1)).join("")}
        </div>
      </div>
      <button class="ann-tl-arrow" id="tl-arr-r" onclick="tlScroll(1)" aria-label="Newer announcements">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="ann-tl-legend">
      <span class="ann-tl-legend-item"><span class="ann-leg-pip ann-pip-normal"></span>Normal</span>
      <span class="ann-tl-legend-item"><span class="ann-leg-pip ann-pip-important"></span>Important</span>
      <span class="ann-tl-legend-hint">Hover a dot to preview · click to expand</span>
    </div>`;

  // Wire hover + click per dot
  ordered.forEach((doc) => {
    const dotEl = tl.querySelector(`.ann-tl-dot[data-id="${doc.id}"]`);
    if (!dotEl) return;
    dotEl.addEventListener("mouseenter", () => showHoverTip(dotEl, doc.id, doc.data()));
    dotEl.addEventListener("mouseleave", () => scheduleHideTip());
    dotEl.addEventListener("click", () => openAnnDetModal(dotEl, doc.id, doc.data()));
    dotEl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openAnnDetModal(dotEl, doc.id, doc.data()); });
  });

  // Wire tooltip hover-stay
  const tip = document.getElementById("ann-hover-tip");
  if (tip) {
    tip.addEventListener("mouseenter", () => clearTimeout(hidePreviewTimer));
    tip.addEventListener("mouseleave", () => scheduleHideTip(0));
  }

  // Auto-scroll to newest (rightmost) after paint
  requestAnimationFrame(() => {
    const wrap = document.getElementById("ann-tl-wrap");
    if (wrap) wrap.scrollLeft = wrap.scrollWidth;
    updateArrows();
  });
}

function tlScroll(dir) {
  const wrap = document.getElementById("ann-tl-wrap");
  if (!wrap) return;
  const start  = wrap.scrollLeft;
  const target = Math.max(0, Math.min(start + dir * 180, wrap.scrollWidth - wrap.clientWidth));
  const duration = 820;
  const t0 = performance.now();
  function ease(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
  function step(now) {
    const p = Math.min((now - t0) / duration, 1);
    wrap.scrollLeft = start + (target - start) * ease(p);
    if (p < 1) requestAnimationFrame(step);
    else updateArrows();
  }
  requestAnimationFrame(step);
}

function updateArrows() {
  const wrap = document.getElementById("ann-tl-wrap");
  if (!wrap) return;
  const l = document.getElementById("tl-arr-l");
  const r = document.getElementById("tl-arr-r");
  if (l) l.style.opacity = wrap.scrollLeft <= 4 ? "0.3" : "1";
  if (r) r.style.opacity = wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 4 ? "0.3" : "1";
}

function renderTimelineDot(id, data, index, isNewest) {
  const catKey  = catKeyFor(data.category);
  const ts      = data.timestamp?.toDate?.();
  const dateStr = ts
    ? ts.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
    : "—";
  const timeStr = ts
    ? ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
    : "";
  const title    = data.title || "";
  const newBadge = isNewest ? '<span class="ann-dot-new-badge">NEW</span>' : "";
  return `
    <div class="ann-tl-dot${isNewest ? " newest" : ""}" data-id="${id}" tabindex="0" role="button" aria-label="${escHtml(title)}">
      ${newBadge}
      <div class="ann-dot-date">${dateStr}</div>
      <div class="ann-dot-pip ann-pip-${catKey}"></div>
      <div class="ann-dot-time">${timeStr}</div>
    </div>`;
}

// ── Hover tooltip ─────────────────────────────────────────────
function showHoverTip(dotEl, id, data) {
  clearTimeout(hidePreviewTimer);
  const tip = document.getElementById("ann-hover-tip");
  if (!tip) return;

  document.querySelectorAll(".ann-tl-dot").forEach(d => d.classList.remove("active"));
  dotEl.classList.add("active");

  const catKey   = catKeyFor(data.category);
  const catLabel = catKey === "important" ? "Important" : "Normal";
  const ts       = data.timestamp?.toDate?.();
  const dateStr  = ts ? ts.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", timeZone:"America/New_York" }) : "";
  const timeStr  = ts ? ts.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }) : "";
  const bodyRaw  = data.details || "";
  const bodySnip = bodyRaw.length > 160 ? bodyRaw.slice(0, 160).trimEnd() + "…" : bodyRaw;
  const body     = bodySnip ? `<div class="tip-body">${escHtml(bodySnip)}</div>` : "";
  const drive    = data.driveLink ? `<div class="tip-drive">📎 Drive file attached</div>` : "";
  const byLabel  = data.postedByRole === "website-admin"
    ? "Website Admin"
    : data.postedByRole === "coach" ? "Coach" : "Captain";

  tip.className = `ann-hover-tip ann-tip-${catKey}`;
  tip.innerHTML = `
    <div class="tip-header">
      <span class="ann-cat-badge ann-cat-${catKey}">${catLabel}</span>
      <span class="tip-meta">${dateStr}${timeStr ? " · " + timeStr : ""}</span>
    </div>
    <div class="tip-title">${escHtml(data.title || "")}</div>
    ${body}${drive}
    <div class="tip-footer">Posted by ${byLabel} &nbsp;·&nbsp; click dot to expand</div>`;

  // Measure, then position near dot
  tip.style.opacity = "0";
  tip.style.display = "block";
  tip.style.pointerEvents = "auto";
  const tw   = tip.offsetWidth;
  const th   = tip.offsetHeight;
  const rect = dotEl.getBoundingClientRect();
  const cx   = rect.left + rect.width / 2;
  let left   = Math.max(8, Math.min(window.innerWidth - tw - 8, cx - tw / 2));
  const top  = rect.top > th + 20 ? rect.top - th - 14 : rect.bottom + 14;
  tip.style.left = left + "px";
  tip.style.top  = top + "px";
  tip.style.opacity = "1";
}

function scheduleHideTip(delay = 180) {
  clearTimeout(hidePreviewTimer);
  hidePreviewTimer = setTimeout(() => {
    const tip = document.getElementById("ann-hover-tip");
    if (tip) {
      tip.style.opacity = "0";
      tip.style.pointerEvents = "none";
      setTimeout(() => { if (tip.style.opacity === "0") tip.style.display = "none"; }, 160);
    }
    document.querySelectorAll(".ann-tl-dot").forEach(d => d.classList.remove("active"));
  }, delay);
}

// ── Detail modal (click / keyboard) ──────────────────────────
function openAnnDetModal(dotEl, id, data) {
  scheduleHideTip(0); // hide tooltip immediately
  document.querySelectorAll(".ann-tl-dot").forEach(d => d.classList.remove("active"));
  dotEl.classList.add("active");

  const m = document.getElementById("ann-det-modal");
  if (!m) return;

  const catKey   = catKeyFor(data.category);
  const catLabel = catKey === "important"
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Important`
    : "Normal";
  const ts       = data.timestamp?.toDate?.();
  const fullDate = ts ? ts.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric", timeZone:"America/New_York" }) : "";
  const timeOnly = ts ? ts.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }) : "";
  const body     = data.details   ? `<div class="ann-det-body">${escHtml(data.details)}</div>` : "";
  const drive    = data.driveLink ? `<a href="${escHtml(data.driveLink)}" target="_blank" class="ann-det-drive"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Open Drive File</a>` : "";
  const canDel   = isFullAdminRole(currentUserRole) || data.postedBy === currentUserEmail;
  const delBtn   = canDel ? `<button class="ann-det-delete" onclick="deleteAnnouncement('${id}');closeAnnDetModal()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete</button>` : "";
  const byLabel  = data.postedByRole === "website-admin"
    ? "Website Admin"
    : data.postedByRole === "coach" ? "Coach" : "Captain";

  const catColors = { normal: "163,230,53", important: "179,0,0" };
  m.style.setProperty("--det-ca", catColors[catKey] || "163,230,53");

  m.querySelector("#ann-det-modal-cat").innerHTML =
    `<span class="ann-cat-badge ann-cat-${catKey}">${catLabel}</span>`;
  m.querySelector("#ann-det-modal-body").innerHTML = `
    <h2 class="ann-det-modal-title">${escHtml(data.title || "")}</h2>
    <div class="ann-det-modal-meta">${fullDate}${timeOnly ? " &mdash; " + timeOnly : ""} &nbsp;·&nbsp; Posted by ${byLabel}</div>
    ${body}${drive}
    <div class="ann-det-modal-footer">${delBtn}</div>`;

  m.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeAnnDetModal() {
  const m = document.getElementById("ann-det-modal");
  if (m) { m.style.display = "none"; document.body.style.overflow = ""; }
  document.querySelectorAll(".ann-tl-dot").forEach(d => d.classList.remove("active"));
}

// ── View-all modal list ───────────────────────────────────────
function renderAllList() {
  const list = document.getElementById("all-ann-list");
  if (!list) return;
  list.innerHTML = allAnnouncementDocs.length
    ? allAnnouncementDocs.map(doc => renderAnnouncement(doc.id, doc.data())).join("")
    : '<div class="ann-empty">No announcements yet.</div>';
}

// ── Modal controls ────────────────────────────────────────────
function openPostModal()  { const m = document.getElementById("post-modal"); if(m){m.style.display="flex";document.body.style.overflow="hidden";} }
function closePostModal() { const m = document.getElementById("post-modal"); if(m){m.style.display="none"; document.body.style.overflow="";} }
function openAllModal()   { const m = document.getElementById("all-modal");  if(m){m.style.display="flex";renderAllList();document.body.style.overflow="hidden";} }
function closeAllModal()  { const m = document.getElementById("all-modal");  if(m){m.style.display="none"; document.body.style.overflow="";} }

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
  const btn   = document.getElementById("notif-btn");
  const badge = document.getElementById("notif-state");
  if (!("Notification" in window)) return;
  const perm = Notification.permission;
  if (btn) btn.title = perm === "granted"
    ? "Notifications on — you'll be alerted when Coach posts"
    : perm === "denied"
    ? "Notifications blocked — enable in browser settings"
    : "Click to enable notifications";
  if (badge) badge.classList.toggle("on", perm === "granted");
}

function toggleNotifications() {
  if (!("Notification" in window)) {
    alert("Your browser does not support notifications.");
    return;
  }
  if (Notification.permission === "granted") {
    alert("Notifications are on ✓\nYou'll see a pop-up whenever Coach or a Captain posts an announcement.");
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

  // Coach can delete any; captain can delete their own
  const canDelete = isFullAdminRole(currentUserRole) || data.postedBy === currentUserEmail;
  const deleteBtn = canDelete
    ? `<button class="ann-delete-btn" onclick="deleteAnnouncement('${id}')" title="Delete">✕ Remove</button>`
    : "";

  const posterLabel = data.postedByRole === "website-admin"
    ? "Website Admin"
    : data.postedByRole === "coach" ? "Coach" : "Captain";

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
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail) &&
    Array.isArray(APPROVED_MEMBERS) &&
    APPROVED_MEMBERS.some(e => e.toLowerCase() === normalizedEmail);
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function isFcpsGoogleEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return FCPS_GOOGLE_DOMAINS.some(domain => normalizedEmail.endsWith("@" + domain));
}

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

// ── Resource card pins (Phase D) ─────────────────────────────
let _activePinCardId = null;
let _pins = {}; // cardId → { driveLink, label, pinnedBy, … }

function loadResourcePins() {
  db.collection("resource-pins").onSnapshot(snap => {
    _pins = {};
    snap.forEach(doc => { _pins[doc.id] = doc.data(); });
    renderAllPins();
  }, err => console.warn("resource-pins listener:", err.message));
}

function renderAllPins() {
  const isEditor = canManageMemberContentRole(currentUserRole);
  document.querySelectorAll(".portal-card[id^='drive-']").forEach(card => {
    const cardId  = card.id;
    const pinEl   = card.querySelector(".card-pin");
    const titleEl = card.querySelector(".portal-card-title");
    if (!pinEl) return;

    // Always clean up any previously injected title button
    titleEl?.querySelector(".card-pin-title-btn")?.remove();

    const pin = _pins[cardId];
    pinEl.innerHTML = "";

    if (pin) {
      // Pinned file row inside the card body
      const row = document.createElement("a");
      row.className = "card-pin-row";
      row.href      = pin.driveLink;
      row.target    = "_blank";
      row.rel       = "noopener noreferrer";
      row.addEventListener("click", e => e.stopPropagation());
      row.innerHTML = `
        <span class="card-pin-icon">📌</span>
        <span class="card-pin-label">${escHtml(pin.label)}</span>
        <span class="card-pin-badge">Pinned</span>
        ${isEditor
          ? `<button class="card-pin-edit" title="Edit pin"
               onclick="event.stopPropagation();event.preventDefault();openPinModal('${escHtml(cardId)}')">✎</button>`
          : ""}
      `;
      pinEl.appendChild(row);
    } else if (isEditor && titleEl) {
      // No pin yet — inject a small "Pin a file" button into the title row (right-justified)
      const btn = document.createElement("button");
      btn.className = "card-pin-title-btn";
      btn.innerHTML = `<span class="pin-icon">📌</span>Pin a file`;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        openPinModal(cardId);
      });
      titleEl.appendChild(btn);
    }
  });
}

function openPinModal(cardId) {
  _activePinCardId = cardId;
  const cardEl    = document.getElementById(cardId);
  const cardTitle = cardEl?.querySelector(".portal-card-title")?.textContent?.trim() || "Card";
  const pin       = _pins[cardId];
  document.getElementById("pin-modal-title").textContent = `📌 Pin a File — ${cardTitle}`;
  document.getElementById("pin-link").value        = pin?.driveLink || "";
  document.getElementById("pin-label-input").value = pin?.label    || "";
  const removeBtn = document.getElementById("pin-remove-btn");
  if (removeBtn) removeBtn.style.display = pin ? "inline-flex" : "none";
  document.getElementById("pin-modal").style.display = "flex";
}

function closePinModal() {
  document.getElementById("pin-modal").style.display = "none";
  _activePinCardId = null;
}

async function savePinForCard() {
  const cardId    = _activePinCardId;
  const driveLink = document.getElementById("pin-link").value.trim();
  const label     = document.getElementById("pin-label-input").value.trim();
  if (!cardId || !driveLink || !label) {
    alert("Please fill in both the Drive link and a display label.");
    return;
  }
  try {
    await db.collection("resource-pins").doc(cardId).set({
      driveLink,
      label,
      pinnedBy:     currentUserEmail,
      pinnedByRole: currentUserRole,
      pinnedAt:     firebase.firestore.FieldValue.serverTimestamp(),
    });
    closePinModal();
  } catch (err) {
    alert("Could not save pin: " + err.message);
  }
}

// ── Notification Error Log (coach only) ──────────────────────
function loadNotifErrors() {
  db.collection("notification-errors")
    .orderBy("detectedAt", "desc")
    .limit(20)
    .onSnapshot(snap => {
      renderNotifErrors(snap.docs);
    }, err => {
      console.warn("notification-errors listener:", err.message);
      const el = document.getElementById("notif-errors-list");
      if (el) el.innerHTML = '<div class="ne-empty">Could not load error log.</div>';
    });
}

function renderNotifErrors(docs) {
  const el = document.getElementById("notif-errors-list");
  if (!el) return;

  if (!docs || docs.length === 0) {
    el.innerHTML = '<div class="ne-empty">✓ No device token errors recorded yet.</div>';
    return;
  }

  el.innerHTML = '<div class="ne-list">' + docs.map(doc => {
    const d = doc.data();
    const emails = Array.isArray(d.emails) ? d.emails : [];
    const ts = d.detectedAt?.toDate?.();
    const dateStr = ts
      ? ts.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" })
        + " at "
        + ts.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", timeZone:"America/New_York" })
        + " EST"
      : "Unknown time";
    const trigger = d.trigger ? escHtml(d.trigger) : "";
    return `
      <div class="ne-row">
        <div class="ne-emails">${emails.map(e => escHtml(e)).join("<br>") || "—"}</div>
        <div class="ne-meta">${dateStr}</div>
        ${trigger ? `<div class="ne-trigger">Detected during: "${trigger}"</div>` : ""}
      </div>`;
  }).join("") + '</div>';
}

async function removePinForCard() {
  const cardId = _activePinCardId;
  if (!cardId) return;
  if (!confirm("Remove this pinned file?")) return;
  try {
    await db.collection("resource-pins").doc(cardId).delete();
    closePinModal();
  } catch (err) {
    alert("Could not remove pin: " + err.message);
  }
}
