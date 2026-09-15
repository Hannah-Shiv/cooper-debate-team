(function () {
  "use strict";

  var slideCount = 7;
  var slideTitles = [
    "Topic Analysis",
    "The Sept / Oct 2026 Resolution",
    "What Does This Topic Mean?",
    "What Each Side Sees and Wants",
    "What Should I Run?",
    "The Central Tradeoff",
    "Questions"
  ];

  function slidePath(index) {
    return "images/topic-analysis/slide-" + String(index + 1).padStart(2, "0") + ".webp?v=1";
  }

  function initializeDeck() {
    var dialog = document.getElementById("topic-deck-dialog");
    var slide = document.getElementById("topic-deck-slide");
    var secondarySlide = document.getElementById("topic-deck-slide-secondary");
    var counter = document.getElementById("topic-deck-counter");
    var caption = document.getElementById("topic-deck-caption");
    var progress = document.getElementById("topic-deck-progress");
    var thumbnails = document.getElementById("topic-deck-thumbnails");
    var previous = dialog && dialog.querySelector("[data-topic-deck-prev]");
    var next = dialog && dialog.querySelector("[data-topic-deck-next]");
    var currentSlide = 0;
    var activeSlide = slide;
    var inactiveSlide = secondarySlide;
    var thumbnailButtons = [];
    var animationTimer = null;
    var opener = null;

    if (!dialog || !slide || !secondarySlide || !counter || !caption || !progress || !thumbnails || !previous || !next) return;

    function buildThumbnails() {
      if (thumbnailButtons.length) return;
      for (var index = 0; index < slideCount; index += 1) {
        var button = document.createElement("button");
        var image = document.createElement("img");
        var number = document.createElement("span");
        button.type = "button";
        button.className = "homepage-readiness__deck-thumbnail";
        button.setAttribute("aria-label", "Show slide " + (index + 1) + ": " + slideTitles[index]);
        button.dataset.slideIndex = String(index);
        image.src = slidePath(index);
        image.alt = "";
        image.loading = "lazy";
        number.textContent = String(index + 1).padStart(2, "0");
        button.appendChild(image);
        button.appendChild(number);
        button.addEventListener("click", function () {
          setSlide(Number(this.dataset.slideIndex), true, true);
        });
        thumbnails.appendChild(button);
        thumbnailButtons.push(button);
      }
    }

    function setSlide(index, moveFilmstrip, animate) {
      var nextSlide = Math.max(0, Math.min(index, slideCount - 1));
      var direction = nextSlide > currentSlide ? "next" : "previous";
      var changed = nextSlide !== currentSlide;
      var slideAlt = "Topic analysis slide " + (nextSlide + 1) + ": " + slideTitles[nextSlide];

      if (animationTimer !== null) {
        window.clearTimeout(animationTimer);
        animationTimer = null;
      }
      activeSlide.classList.remove("is-current", "is-exiting-next", "is-exiting-previous");
      inactiveSlide.classList.remove("is-current", "is-entering-next", "is-entering-previous");
      activeSlide.classList.add("is-current");
      activeSlide.removeAttribute("aria-hidden");
      inactiveSlide.setAttribute("aria-hidden", "true");
      currentSlide = nextSlide;

      if (animate && changed) {
        inactiveSlide.src = slidePath(currentSlide);
        inactiveSlide.alt = slideAlt;
        inactiveSlide.removeAttribute("aria-hidden");
        activeSlide.setAttribute("aria-hidden", "true");
        activeSlide.classList.remove("is-current");
        void activeSlide.offsetWidth;
        activeSlide.classList.add("is-exiting-" + direction);
        inactiveSlide.classList.add("is-entering-" + direction);
        var outgoingSlide = activeSlide;
        var incomingSlide = inactiveSlide;
        animationTimer = window.setTimeout(function () {
          outgoingSlide.classList.remove("is-exiting-next", "is-exiting-previous", "is-current");
          outgoingSlide.setAttribute("aria-hidden", "true");
          incomingSlide.classList.remove("is-entering-next", "is-entering-previous");
          incomingSlide.classList.add("is-current");
          incomingSlide.removeAttribute("aria-hidden");
          var outgoingId = outgoingSlide.id;
          outgoingSlide.id = incomingSlide.id;
          incomingSlide.id = outgoingId;
          activeSlide = incomingSlide;
          inactiveSlide = outgoingSlide;
          animationTimer = null;
        }, 720);
      } else {
        activeSlide.src = slidePath(currentSlide);
        activeSlide.alt = slideAlt;
      }

      counter.textContent = "Slide " + (currentSlide + 1) + " of " + slideCount;
      caption.textContent = slideTitles[currentSlide];
      progress.style.width = ((currentSlide + 1) / slideCount * 100) + "%";
      previous.disabled = currentSlide === 0;
      next.disabled = currentSlide === slideCount - 1;

      thumbnailButtons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === currentSlide;
        button.classList.toggle("is-active", isActive);
        if (isActive) {
          button.setAttribute("aria-current", "true");
          if (moveFilmstrip) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    document.querySelectorAll("[data-topic-deck-open]").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        opener = trigger;
        dialog.showModal();
        document.body.classList.add("deck-dialog-open");
        buildThumbnails();
        setSlide(0, true, false);
        next.focus();
      });
    });
    dialog.querySelector("[data-topic-deck-close]").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("deck-dialog-open");
      if (opener) opener.focus();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") { event.preventDefault(); setSlide(currentSlide - 1, true, true); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setSlide(currentSlide + 1, true, true); }
    });
    previous.addEventListener("click", function () { setSlide(currentSlide - 1, true, true); });
    next.addEventListener("click", function () { setSlide(currentSlide + 1, true, true); });

    setSlide(0, false, false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeDeck);
  else initializeDeck();
})();