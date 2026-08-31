(function () {
  var slideCount = 30;
  var slideTitles = [
    "Welcome to Cooper Debate",
    "Meet Coach Konde",
    "Meet the Leadership Team",
    "What Is Debate?",
    "Team Commitment",
    "What We Do at Tuesday Practice",
    "Building Cases and Debate Skills",
    "How to Write a Case",
    "Public Forum Partners",
    "Past Debate Topics",
    "More Debate Topics",
    "Langley High School Mentors",
    "What Happens on Tournament Days?",
    "2026–27 Tournament Schedule",
    "Four Debate Rounds",
    "Tournament Day Schedule",
    "Inside a Debate Round",
    "Judging Criteria",
    "We Need Parent Judges",
    "Award Ceremony",
    "Tournament Highlights",
    "Team Values",
    "Hosting and Judging at Cooper",
    "Why Join Debate?",
    "How Do I Apply?",
    "Team Website",
    "Application Requirements",
    "Application and Tryout Dates",
    "Stay Informed",
    "Any Questions?"
  ];

  function slidePath(index) {
    return "images/info-session/slide-" + String(index + 1).padStart(2, "0") + ".jpg";
  }

  function initializeDeck() {
    var dialog = document.getElementById("info-session-deck-dialog");
    var slide = document.getElementById("info-session-deck-slide");
    var counter = document.getElementById("info-session-deck-counter");
    var caption = document.getElementById("info-session-deck-caption");
    var progress = document.getElementById("info-session-deck-progress");
    var thumbnails = document.getElementById("info-session-deck-thumbnails");
    var previous = dialog && dialog.querySelector("[data-deck-prev]");
    var next = dialog && dialog.querySelector("[data-deck-next]");
    var currentSlide = 0;
    var thumbnailButtons = [];

    if (!dialog || !slide || !counter || !caption || !progress || !thumbnails || !previous || !next) {
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
          setSlide(Number(this.dataset.slideIndex), true);
        });
        thumbnails.appendChild(button);
        thumbnailButtons.push(button);
      }
    }

    function setSlide(index, moveFilmstrip) {
      currentSlide = Math.max(0, Math.min(index, slideCount - 1));
      slide.src = slidePath(currentSlide);
      slide.alt = "Cooper Debate information-session slide " + (currentSlide + 1) + ": " + slideTitles[currentSlide];
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
        setSlide(currentSlide, true);
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
        setSlide(currentSlide - 1, true);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSlide(currentSlide + 1, true);
      }
    });

    previous.addEventListener("click", function () {
      setSlide(currentSlide - 1, true);
    });
    next.addEventListener("click", function () {
      setSlide(currentSlide + 1, true);
    });

    setSlide(0, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDeck);
  } else {
    initializeDeck();
  }
})();