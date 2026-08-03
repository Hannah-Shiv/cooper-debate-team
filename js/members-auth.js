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

// Where Firebase redirects after the user clicks the magic link in their email
const SIGN_IN_REDIRECT_URL = "https://cooperdebateteam.com/members.html";

const STORAGE_KEY = "cooper_signin_email";

// ── Initialise Firebase ──────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();

// Persist session across browser close (user stays logged in on this device)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ── On page load ─────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {

  // Case 1: user just clicked a magic link in their email
  if (auth.isSignInWithEmailLink(window.location.href)) {
    completeMagicLinkSignIn();
    return;
  }

  // Case 2: user is already signed in from a previous session
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

  // Pre-check whitelist so unapproved users never get an email
  if (!isApprovedMember(email)) {
    showError("This email is not on the approved members list. Please contact Coach Konde to request access.");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Sending…";

  const actionCodeSettings = {
    url: SIGN_IN_REDIRECT_URL,
    handleCodeInApp: true
  };

  auth.sendSignInLinkToEmail(email, actionCodeSettings)
    .then(() => {
      // Save email so we can complete sign-in when the user returns via the link
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

  // Edge case: user clicked the link on a different device than they requested it from
  if (!email) {
    email = window.prompt("Please re-enter your email address to complete sign-in:");
  }

  if (!email) {
    showState("login");
    return;
  }

  auth.signInWithEmailLink(email.trim().toLowerCase(), window.location.href)
    .then(result => {
      localStorage.removeItem(STORAGE_KEY);
      // Clean the magic-link tokens from the URL bar
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
    // Signed in via Firebase but not on the whitelist
    auth.signOut();
    showState("denied");
  }
}

// ── Sign out ─────────────────────────────────────────────────
function handleSignOut() {
  auth.signOut().then(() => showState("login"));
}

// ── Utility: go back to login from other states ───────────────
function showLogin() {
  clearError();
  const input = document.getElementById("email-input");
  if (input) input.value = "";
  showState("login");
}

// ── Whitelist check ───────────────────────────────────────────
function isApprovedMember(email) {
  const normalised = email.toLowerCase();
  return APPROVED_MEMBERS.some(e => e.toLowerCase() === normalised);
}

// ── UI state machine ─────────────────────────────────────────
// States: login | pending | completing | dashboard | denied
function showState(state) {
  ["login", "pending", "completing", "dashboard", "denied"].forEach(s => {
    const el = document.getElementById("state-" + s);
    if (el) el.style.display = (s === state) ? "" : "none";
  });
}

function showDashboard(email) {
  const el = document.getElementById("member-email");
  if (el) el.textContent = email;
  showState("dashboard");
}

// ── Error helpers ─────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById("login-error");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function clearError() {
  const el = document.getElementById("login-error");
  if (el) el.style.display = "none";
}
