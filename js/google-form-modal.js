/* ============================================================
   COOPER DEBATE TEAM — Google Form modal
   Opens the QST Google Form in a branded, accessible same-page dialog.
   Application links use the direct Google Form page instead.
   ============================================================ */

(function () {
  "use strict";

  function initializeGoogleFormModal() {
    var dialog = document.querySelector("[data-google-form-dialog]");
    if (!dialog) return;

    var title = dialog.querySelector("[data-google-form-title]");
    var kicker = dialog.querySelector("[data-google-form-kicker]");
    var description = dialog.querySelector("[data-google-form-description]");
    var external = dialog.querySelector("[data-google-form-external]");
    var closeButton = dialog.querySelector("[data-google-form-close]");
    var frame = dialog.querySelector("[data-google-form-frame]");
    var activeTrigger = null;

    function closeDialog() {
      document.body.classList.remove("google-form-dialog-open");
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
        dialog.dispatchEvent(new Event("close"));
      }
    }

    function openDialog(trigger) {
      var formUrl = trigger.getAttribute("data-form-url") || trigger.getAttribute("href");
      if (!formUrl) return;

      activeTrigger = trigger;
      kicker.textContent = trigger.getAttribute("data-form-kicker") || "Cooper Debate Team · 2026–27";
      title.textContent = trigger.getAttribute("data-form-title") || "Cooper Debate Team Form";
      description.textContent = trigger.getAttribute("data-form-description") || "Complete the form below. Your responses are submitted securely through Google Forms.";
      external.href = formUrl;
      external.textContent = trigger.getAttribute("data-form-external-label") || "Open full form ↗";
      frame.title = title.textContent;

      var embeddedUrl = formUrl + (formUrl.indexOf("?") === -1 ? "?" : "&") + "embedded=true";
      if (frame.dataset.loadedUrl !== embeddedUrl) {
        frame.src = embeddedUrl;
        frame.dataset.loadedUrl = embeddedUrl;
      }

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      document.body.classList.add("google-form-dialog-open");
      window.requestAnimationFrame(function () {
        closeButton.focus();
      });
    }

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-google-form-open]");
      if (!trigger) return;

      var formUrl = trigger.getAttribute("data-form-url") || trigger.getAttribute("href");
      if (trigger.hasAttribute("data-google-form-direct")) {
        if (!formUrl) return;
        event.preventDefault();
        window.location.assign(formUrl);
        return;
      }

      if (trigger.tagName === "A") event.preventDefault();
      openDialog(trigger);
    });

    closeButton.addEventListener("click", closeDialog);

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });

    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeDialog();
    });

    dialog.addEventListener("close", function () {
      document.body.classList.remove("google-form-dialog-open");
      if (activeTrigger) activeTrigger.focus();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeGoogleFormModal);
  } else {
    initializeGoogleFormModal();
  }
})();
