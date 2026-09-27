// Private team PDF access for restored portal sessions.
(function () {
  "use strict";

  var DOCUMENTS = [
    {
      buttonId: "october-tournament-document",
      statusId: "october-document-status",
      endpoint: "https://us-central1-cooper-debate-team.cloudfunctions.net/memberOctoberDocument",
      fileName: "October-24-Debate-Tournament.pdf",
      label: "October 24 tournament"
    },
    {
      buttonId: "membership-contract-document",
      statusId: "membership-contract-status",
      endpoint: "https://us-central1-cooper-debate-team.cloudfunctions.net/memberMembershipContract",
      fileName: "Cooper-Debate-Membership-Contract-2026-2027.pdf",
      label: "2026–27 membership contract"
    },
    {
      buttonId: "wasdl-permission-document",
      statusId: "wasdl-permission-status",
      endpoint: "https://us-central1-cooper-debate-team.cloudfunctions.net/memberWasdlPermissionSlip",
      fileName: "WASDL-Tournament-Permission-Slip-2026-2027.pdf",
      label: "WASDL tournament permission slip (draft)"
    },
    {
      buttonId: "pf-guide-document",
      statusId: "pf-guide-status",
      endpoint: "https://us-central1-cooper-debate-team.cloudfunctions.net/memberPfGuide",
      fileName: "How-to-Win-a-PF-Debate-2025.pdf",
      label: "October 2025 PF debate meeting deck"
    }
  ];
  var objectUrls = [];
  var bound = false;

  function setStatus(documentInfo, message, isError) {
    var status = document.getElementById(documentInfo.statusId);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("october-document-error", !!isError);
  }

  function bindAfterDashboardAuth() {
    if (bound || !window.firebase || !firebase.auth) return;
    var content = document.getElementById("mp-content");
    if (!content || DOCUMENTS.some(function (item) {
      return !document.getElementById(item.buttonId) || !document.getElementById(item.statusId);
    })) return;

    firebase.auth().onAuthStateChanged(function (user) {
      if (!user || content.style.display !== "block" || bound) return;
      bound = true;
      DOCUMENTS.forEach(function (item) {
        document.getElementById(item.buttonId).addEventListener("click", function () {
          // Do not retain a previous account after sign-out or account switch.
          if (content.style.display !== "block") return;
          openPrivateDocument(firebase.auth().currentUser, item);
        });
      });
    });
  }

  async function openPrivateDocument(user, documentInfo) {
    var button = document.getElementById(documentInfo.buttonId);
    if (!user || typeof user.getIdToken !== "function") {
      setStatus(documentInfo, "Sign in to access this document.", true);
      return;
    }

    // Open the browsing context directly from the click before awaiting network
    // work, avoiding popup-blocker issues. Its opener is detached immediately.
    var pdfWindow = window.open("about:blank", "_blank");
    if (pdfWindow) {
      try { pdfWindow.opener = null; } catch (_) {}
    }
    button.disabled = true;
    setStatus(documentInfo, "Checking member access…", false);

    try {
      var token = await user.getIdToken();
      var response = await fetch(documentInfo.endpoint, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        credentials: "omit"
      });

      if (!response.ok) {
        var error = {};
        try { error = await response.json(); } catch (_) {}
        var message = error && error.error;
        if (response.status === 503) {
          message = "The private document is not available yet. A coach or Website Admin must securely upload it first.";
        } else if (response.status === 404) {
          message = "The secure document service is not available yet. It must be deployed before members can access the file.";
        } else if (response.status === 401 || response.status === 403) {
          message = "Your portal session cannot access this document. Sign in again or contact a coach.";
        }
        throw new Error(message || "The document could not be retrieved.");
      }

      var contentType = (response.headers.get("Content-Type") || "").toLowerCase();
      if (contentType.indexOf("application/pdf") === -1) {
        throw new Error("The secure service returned an unexpected document format.");
      }
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      if (pdfWindow && !pdfWindow.closed) {
        pdfWindow.location.replace(objectUrl);
        setStatus(documentInfo, "PDF opened securely · " + documentInfo.label, false);
      } else {
        var download = document.createElement("a");
        download.href = objectUrl;
        download.download = documentInfo.fileName;
        download.rel = "noopener";
        document.body.appendChild(download);
        download.click();
        download.remove();
        setStatus(documentInfo, "Pop-up blocked; the PDF download has started.", false);
      }
    } catch (error) {
      if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
      console.error("Private team document unavailable:", error);
      var message = error && error.message;
      if (error instanceof TypeError) {
        message = "The secure document service could not be reached. It will be available after the backend is deployed and an admin uploads the private document.";
      }
      setStatus(documentInfo, message || "The document is temporarily unavailable. Please try again.", true);
    } finally {
      button.disabled = false;
    }
  }

  function start() {
    bindAfterDashboardAuth();
    var content = document.getElementById("mp-content");
    if (!content) return;
    var observer = new MutationObserver(bindAfterDashboardAuth);
    observer.observe(content, { attributes: true, attributeFilter: ["style"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener("beforeunload", function () {
    objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
  });
})();