/* Cooper Debate Team — FCPS account check for the team application. */
(function () {
  "use strict";

  var APPLICATION_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfo4hDx6trh1ypieMujM6gE34eas7cthc2a3xdgSxuX45UBPQ/viewform";
  var FCPS_DOMAINS = ["fcpsschools.net", "fcps.edu"];
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    storageBucket: "cooper-debate-team.firebasestorage.app",
    messagingSenderId: "112813790184",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d"
  };

  var auth;
  var provider;
  var persistenceReady;
  var dialog;
  var signInButton;
  var status;
  var continueLink;
  var activeTrigger;

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isFcpsEmail(value) {
    var email = normalizeEmail(value);
    return FCPS_DOMAINS.some(function (domain) {
      return email.endsWith("@" + domain);
    });
  }

  async function isVerifiedFcpsGoogleUser(user) {
    if (!user || !user.emailVerified || !isFcpsEmail(user.email)) return false;
    try {
      var token = await user.getIdTokenResult();
      return token && token.signInProvider === "google.com";
    } catch (_) {
      return false;
    }
  }

  function hasVerifiedFcpsGoogleSession(user) {
    if (!user || !user.emailVerified || !isFcpsEmail(user.email)) return false;
    return Array.isArray(user.providerData) && user.providerData.some(function (identity) {
      return identity && identity.providerId === "google.com";
    });
  }

  function applicationTriggerFrom(target) {
    var trigger = target && target.closest && target.closest("[data-google-form-open]");
    if (!trigger) return null;
    var url = trigger.getAttribute("data-form-url") || trigger.getAttribute("href") || "";
    return url.indexOf("1FAIpQLSfo4hDx6trh1ypieMujM6gE34eas7cthc2a3xdgSxuX45UBPQ") !== -1
      ? trigger
      : null;
  }

  function createDialog() {
    var wrapper = document.createElement("div");
    wrapper.innerHTML = [
      '<dialog class="fcps-application-auth" aria-labelledby="fcps-application-auth-title" aria-describedby="fcps-application-auth-description">',
      '  <div class="fcps-application-auth__inner">',
      '    <button class="fcps-application-auth__close" type="button" aria-label="Close FCPS account check">×</button>',
      '    <img class="fcps-application-auth__mark" src="images/member-portal-keyhole.png" alt="" aria-hidden="true">',
      '    <p class="fcps-application-auth__kicker">2026–27 Team Application</p>',
      '    <div class="fcps-application-auth__card-divider fcps-application-auth__card-divider--heading" aria-hidden="true"><span></span></div>',
      '    <h2 id="fcps-application-auth-title">FCPS Account Check</h2>',
      '    <div class="fcps-application-auth__divider" aria-hidden="true"><span></span></div>',
      '    <p class="fcps-application-auth__intro" id="fcps-application-auth-description">The application is restricted to Cooper Middle School students and staff. Verify your FCPS Google account before continuing.</p>',
      '    <div class="fcps-application-auth__card">',
      '      <button class="fcps-application-auth__google" type="button">',
      '        <img class="fcps-application-auth__fcps-logo" src="images/fcps-google-logo.png" alt="" aria-hidden="true">',
      '        <svg viewBox="0 0 24 24" aria-hidden="true">',
      '          <path fill="#4285F4" d="M21.35 12.23c0-.79-.07-1.55-.23-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42z"/>',
      '          <path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.53A9.74 9.74 0 0 0 12 21.67z"/>',
      '          <path fill="#FBBC05" d="M6.51 13.74a5.85 5.85 0 0 1 0-3.48V7.73H3.27a9.75 9.75 0 0 0 0 8.54l3.24-2.53z"/>',
      '          <path fill="#EA4335" d="M12 6.22c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.83 3.3 14.63 2.33 12 2.33a9.74 9.74 0 0 0-8.73 5.4l3.24 2.53C7.29 7.94 9.45 6.22 12 6.22z"/>',
      '        </svg>',
      '        <span class="fcps-application-auth__google-label">Sign in with fcpsschools.net</span>',
      '      </button>',
      '      <div class="fcps-application-auth__card-divider" aria-hidden="true"><span></span></div>',
      '      <div class="fcps-application-auth__notice">',
      '        <span class="fcps-application-auth__notice-mark" aria-hidden="true">!</span>',
      '        <span><strong>Account Required:</strong> You must use your <em>fcpsschools.net</em> Google account to open the application.</span>',
      '      </div>',
      '      <div class="fcps-application-auth__security"><span class="fcps-application-auth__security-mark" aria-hidden="true">i</span><span>If this page opened inside a QR-code app, open it in Chrome or Safari so Google can use your FCPS sign-in.</span></div>',
      '      <p class="fcps-application-auth__status" role="status" aria-live="polite"></p>',
      '      <a class="fcps-application-auth__continue" href="' + APPLICATION_URL + '" target="_blank" rel="noopener" hidden>',
      '        <img class="fcps-application-auth__continue-rays" src="images/application-rays-left.png?v=18" alt="" aria-hidden="true">',
      '        <img class="fcps-application-auth__continue-icon" src="images/application-document-icon.png?v=18" alt="" aria-hidden="true">',
      '        <span>Open the Team Application</span>',
      '        <span class="fcps-application-auth__continue-arrow" aria-hidden="true">⟶</span>',
      '        <img class="fcps-application-auth__continue-rays fcps-application-auth__continue-rays--right" src="images/application-rays-right.png?v=18" alt="" aria-hidden="true">',
      '      </a>',
      '    </div>',
      '  </div>',
      '</dialog>'
    ].join("");
    dialog = wrapper.firstElementChild;
    document.body.appendChild(dialog);
    signInButton = dialog.querySelector(".fcps-application-auth__google");
    status = dialog.querySelector(".fcps-application-auth__status");
    continueLink = dialog.querySelector(".fcps-application-auth__continue");

    dialog.querySelector(".fcps-application-auth__close").addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("fcps-application-auth-open");
      if (activeTrigger) activeTrigger.focus();
    });
    signInButton.addEventListener("click", signIn);
    continueLink.addEventListener("click", function () {
      closeDialog();
    });
  }

  function resetDialog() {
    signInButton.disabled = false;
    signInButton.hidden = false;
    signInButton.querySelector(".fcps-application-auth__google-label").textContent = "Sign in with fcpsschools.net";
    status.textContent = "";
    status.className = "fcps-application-auth__status";
    continueLink.hidden = true;
  }

  function openDialog(trigger) {
    activeTrigger = trigger;
    resetDialog();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("fcps-application-auth-open");
    window.requestAnimationFrame(function () {
      signInButton.focus();
    });
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else {
      dialog.removeAttribute("open");
      dialog.dispatchEvent(new Event("close"));
    }
  }

  function authErrorMessage(error) {
    switch (error && error.code) {
      case "auth/popup-blocked":
        return "Your browser blocked the Google account window. Allow pop-ups for this site and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "The Google account window closed before verification finished.";
      case "auth/network-request-failed":
        return "Google could not connect. Check your network and try again.";
      case "auth/unauthorized-domain":
        return "Google sign-in is not authorized for this website address.";
      case "auth/web-storage-unsupported":
        return "This browser blocked Google sign-in. Open the page in Chrome or Safari and try again.";
      default:
        return "The FCPS account check could not be completed. Please try again.";
    }
  }

  async function signIn() {
    status.textContent = "";
    continueLink.hidden = true;
    signInButton.disabled = true;
    signInButton.querySelector(".fcps-application-auth__google-label").textContent = "Checking FCPS Google Workspace ...";
    try {
      await persistenceReady;
      var result = await auth.signInWithPopup(provider);
      if (!(await isVerifiedFcpsGoogleUser(result.user))) {
        status.textContent = "That is not an FCPS Google account. Choose an account ending in @fcpsschools.net and try again.";
        signInButton.disabled = false;
        signInButton.querySelector(".fcps-application-auth__google-label").textContent = "Choose a different Google account";
        return;
      }
      var email = normalizeEmail(result.user.email);
      signInButton.hidden = true;
      status.className = "fcps-application-auth__status fcps-application-auth__success";
      status.textContent = "";
      var successMark = document.createElement("span");
      successMark.className = "fcps-application-auth__success-mark";
      successMark.setAttribute("aria-hidden", "true");
      successMark.textContent = "✓";
      var successText = document.createElement("span");
      var successLabel = document.createElement("strong");
      successLabel.textContent = "FCPS account verified ";
      successText.appendChild(successLabel);
      successText.appendChild(document.createTextNode(email));
      status.appendChild(successMark);
      status.appendChild(successText);
      continueLink.hidden = false;
      continueLink.focus();
    } catch (error) {
      status.textContent = authErrorMessage(error);
      signInButton.disabled = false;
      signInButton.querySelector(".fcps-application-auth__google-label").textContent = "Try FCPS Google again";
    }
  }

  function handleApplicationClick(event) {
    var trigger = applicationTriggerFrom(event.target);
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    var user = auth.currentUser;
    if (hasVerifiedFcpsGoogleSession(user)) {
      window.open(APPLICATION_URL, "_blank", "noopener,noreferrer");
      return;
    }
    openDialog(trigger);
  }

  function initialize() {
    if (!window.firebase || !firebase.auth) return;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account", hd: "fcpsschools.net" });
    persistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    createDialog();
    document.addEventListener("click", handleApplicationClick, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();