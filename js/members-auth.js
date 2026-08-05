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
let currentUserRole   = "member"; // "coach" | "captain" | "member"
let unsubAnnouncements = null;
let allAnnouncementDocs = [];
let hidePreviewTimer   = null;

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
    } else if (currentUserRole === "captain") {
      badgeEl.textContent = "⭐ Captain";
      badgeEl.style.cssText += ";background:rgba(168,85,247,0.15);border-color:rgba(168,85,247,0.4);color:#d8b4fe;";
    }
  }

  // Show floating post button for coach + captain
  const fab = document.getElementById("post-fab");
  if (fab && (currentUserRole === "coach" || currentUserRole === "captain")) {
    fab.style.display = "flex";
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
    setTimeout(() => { hideAnnounceStatus(); closePostModal(); }, 1400);
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
  const byLabel  = data.postedByRole === "coach" ? "Coach" : "Captain";

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
  const canDel   = currentUserRole === "coach" || data.postedBy === currentUserEmail;
  const delBtn   = canDel ? `<button class="ann-det-delete" onclick="deleteAnnouncement('${id}');closeAnnDetModal()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete</button>` : "";
  const byLabel  = data.postedByRole === "coach" ? "Coach" : "Captain";

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
  const canDelete = currentUserRole === "coach" || data.postedBy === currentUserEmail;
  const deleteBtn = canDelete
    ? `<button class="ann-delete-btn" onclick="deleteAnnouncement('${id}')" title="Delete">✕ Remove</button>`
    : "";

  const posterLabel = data.postedByRole === "coach" ? "Coach" : "Captain";

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
