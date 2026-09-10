(function () {
  var slideCount = 42;
  var slideTitles = [
    "Welcome to Cooper Debate",
    "Information Session Reminders",
    "Meet Coach Konde",
    "Meet the Leadership Team",
    "Introducing the Cooper Debate Website",
    "What Is Debate?",
    "What Is Public Forum Debate?",
    "Inside a Public Forum Round",
    "Public Forum Partners",
    "Past Debate Topics: 2025–2026",
    "Past Debate Topics: 2024–2025",
    "September/October 2026 Topic",
    "What Does the Debate Team Do?",
    "Team Commitment",
    "What We Do at Tuesday Practice",
    "How to Write a Case",
    "Building Cases and Debate Skills",
    "Langley High School Mentors",
    "Debate Team AI Policy",
    "What Happens on Tournament Days?",
    "Five or More Tournaments Each Year",
    "Debate Tournaments",
    "Tournament Day Schedule",
    "Four Debate Rounds",
    "Parent and High School Judges",
    "Judging Criteria",
    "Tournament Highlights",
    "Award Ceremony",
    "Why Join the Debate Team?",
    "Reasons to Join Debate",
    "Fun Debate Tournaments",
    "We Have Lots of Fun",
    "How Do I Apply?",
    "Team Website",
    "Application Requirements",
    "Application Essay and Tryouts",
    "More Policy Information Coming",
    "Applications Due September 16",
    "Debate Tryouts September 22–23",
    "Team Values",
    "Stay Informed",
    "Any Questions?"
  ];

  function slidePath(index) {
    return "images/info-session/slide-" + String(index + 1).padStart(2, "0") + ".jpg?v=2";
  }

  function initializeDeck() {
    var dialog = document.getElementById("info-session-deck-dialog");
    var slide = document.getElementById("info-session-deck-slide");
    var secondarySlide = document.getElementById("info-session-deck-slide-secondary");
    var counter = document.getElementById("info-session-deck-counter");
    var caption = document.getElementById("info-session-deck-caption");
    var progress = document.getElementById("info-session-deck-progress");
    var thumbnails = document.getElementById("info-session-deck-thumbnails");
    var previous = dialog && dialog.querySelector("[data-deck-prev]");
    var next = dialog && dialog.querySelector("[data-deck-next]");
    var currentSlide = 0;
    var activeSlide = slide;
    var inactiveSlide = secondarySlide;
    var thumbnailButtons = [];
    var animationTimer = null;

    if (!dialog || !slide || !secondarySlide || !counter || !caption || !progress || !thumbnails || !previous || !next) {
      return;
    }

    function buildThumbnails() {
      if (thumbnailButtons.length) {
        return;
      }

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
      var slideAlt = "Cooper Debate information-session slide " + (nextSlide + 1) + ": " + slideTitles[nextSlide];

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

        /* Force a reflow so repeated quick clicks reliably restart the motion. */
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
        }, 360);
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
        var active = buttonIndex === currentSlide;
        button.classList.toggle("is-active", active);
        if (active) {
          button.setAttribute("aria-current", "true");
          if (moveFilmstrip) {
            button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          }
        } else {
          button.removeAttribute("aria-current");
        }
      });

      if (dialog.open) {
        [currentSlide - 1, currentSlide + 1].forEach(function (nearby) {
          if (nearby >= 0 && nearby < slideCount) {
            var preload = new Image();
            preload.src = slidePath(nearby);
          }
        });
      }
    }

    document.querySelectorAll("[data-deck-open]").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
        document.body.classList.add("deck-dialog-open");
        buildThumbnails();
        setSlide(0, true, false);
        dialog.querySelector("[data-deck-next]").focus();
      });
    });

    dialog.querySelector("[data-deck-close]").addEventListener("click", function () {
      dialog.close();
    });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener("close", function () {
      document.body.classList.remove("deck-dialog-open");
    });

    dialog.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSlide(currentSlide - 1, true, true);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSlide(currentSlide + 1, true, true);
      }
    });

    previous.addEventListener("click", function () {
      setSlide(currentSlide - 1, true, true);
    });
    next.addEventListener("click", function () {
      setSlide(currentSlide + 1, true, true);
    });

    setSlide(0, false, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDeck);
  } else {
    initializeDeck();
  }
})();