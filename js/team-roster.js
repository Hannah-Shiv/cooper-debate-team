(function () {
  const dialog = document.getElementById("roster-dialog");
  const heading = document.getElementById("roster-dialog-title");
  const subtitle = document.getElementById("roster-dialog-subtitle");
  const count = document.getElementById("roster-dialog-count");
  const scrollArea = dialog.querySelector(".dialog-scroll");
  const closeButton = dialog.querySelector(".dialog-close");
  const groups = [...dialog.querySelectorAll(".roster-group")];
  const rosterNavigation = dialog.querySelector(".roster-navigation");
  const previousGroup = rosterNavigation.querySelector(".roster-navigation-prev");
  const nextGroup = rosterNavigation.querySelector(".roster-navigation-next");
  const pageStatus = rosterNavigation.querySelector(".roster-navigation-status");
  const narrowScreen = window.matchMedia("(max-width:700px)");
  let fullRosterPage = 0;
  const rosters = new Map();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let opener = null;
  let animations = [];
  let animatedNames = [];
  let finishTimer = null;
  let scrambleFrame = null;
  let scramblingCharacters = [];
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  function updateFullRosterView() {
    if (dialog.classList.contains("is-single")) {
      rosterNavigation.hidden = true;
      return;
    }
    rosterNavigation.hidden = !narrowScreen.matches;
    groups.forEach((group, index) => {
      group.hidden = narrowScreen.matches && index !== fullRosterPage;
    });
    pageStatus.textContent = `${fullRosterPage + 1} of ${groups.length} · ${groups[fullRosterPage].querySelector(".group-head h3").textContent}`;
    previousGroup.disabled = fullRosterPage === 0;
    nextGroup.disabled = fullRosterPage === groups.length - 1;
  }

  previousGroup.addEventListener("click", () => {
    fullRosterPage = Math.max(0, fullRosterPage - 1);
    updateFullRosterView();
  });
  nextGroup.addEventListener("click", () => {
    fullRosterPage = Math.min(groups.length - 1, fullRosterPage + 1);
    updateFullRosterView();
  });
  narrowScreen.addEventListener("change", () => {
    if (dialog.open) updateFullRosterView();
  });

  groups.forEach((group) => {
    const list = group.querySelector(".name-list");
    const items = [...list.querySelectorAll("li")].sort((a, b) =>
      a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { sensitivity: "base" })
    );
    list.replaceChildren(...items);
    const patterns = {
      7: [2, 3, 2],
      9: [2, 3, 2, 2],
      15: [3, 4, 3, 3, 2],
      16: [3, 4, 3, 4, 2],
      18: [3, 4, 3, 4, 4],
      19: [3, 4, 3, 4, 3, 2]
    };
    const rows = patterns[items.length] || Array(Math.ceil(items.length / 3)).fill(3);
    let index = 0;
    rows.forEach((size, row) => {
      const columns = size === 4 ? [1, 4, 7, 10] : size === 2 ? [4, 7] : [2, 5, 8];
      for (let position = 0; position < size && index < items.length; position++, index++) {
        items[index].style.setProperty("--roster-column", columns[position]);
        items[index].style.setProperty("--roster-row", row + 1);
        items[index].classList.toggle("row-start", position === 0);
      }
    });
    const mobilePatterns = {
      7: [2, 3, 2],
      9: [2, 3, 2, 2],
      15: [2, 3, 2, 3, 2, 3],
      16: [2, 3, 2, 3, 2, 2, 2],
      18: [2, 3, 2, 3, 2, 3, 3],
      19: [2, 3, 2, 3, 2, 3, 2, 2]
    };
    index = 0;
    (mobilePatterns[items.length] || Array(Math.ceil(items.length / 2)).fill(2)).forEach((size, row) => {
      const columns = size === 3 ? [1, 3, 5] : [2, 4];
      for (let position = 0; position < size && index < items.length; position++, index++) {
        items[index].style.setProperty("--mobile-column", columns[position]);
        items[index].style.setProperty("--mobile-row", row + 1);
        items[index].classList.toggle("mobile-row-start", position === 0);
      }
    });
    rosters.set(group.id, { group, items });
  });

  function finishAssembly() {
    clearTimeout(finishTimer);
    finishTimer = null;
    if (scrambleFrame !== null) cancelAnimationFrame(scrambleFrame);
    scrambleFrame = null;
    scramblingCharacters = [];
    animations.forEach((animation) => animation.cancel());
    animations = [];
    animatedNames.forEach(({ item, name }) => {
      item.textContent = name;
      item.removeAttribute("aria-label");
    });
    animatedNames = [];
    groups.forEach((group) => group.removeAttribute("aria-busy"));
    dialog.classList.remove("is-assembling");
  }

  function scramble(startedAt) {
    const elapsed = performance.now() - startedAt;
    let unresolved = false;
    scramblingCharacters.forEach((character) => {
      if (elapsed >= character.revealAt) {
        if (character.fragment.textContent !== character.original) {
          character.fragment.textContent = character.original;
        }
      } else {
        unresolved = true;
        if (elapsed >= character.delay && elapsed >= character.nextChange) {
          let glyph;
          do {
            glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
          } while (glyph === character.original);
          character.fragment.textContent = glyph;
          character.nextChange = elapsed + 75 + Math.random() * 45;
        }
      }
    });
    scrambleFrame = unresolved ? requestAnimationFrame(() => scramble(startedAt)) : null;
  }

  function assemble(roster) {
    roster.group.setAttribute("aria-busy", "true");

    roster.items.forEach((item) => {
      const name = item.textContent.trim();
      animatedNames.push({ item, name });
      item.setAttribute("aria-label", name);
      const pieces = document.createDocumentFragment();
      for (let i = 0; i < name.length; i++) {
        const fragment = document.createElement("span");
        fragment.className = "name-fragment";
        fragment.setAttribute("aria-hidden", "true");
        fragment.textContent = name[i];
        pieces.appendChild(fragment);
      }
      item.replaceChildren(pieces);

      const dx = (Math.random() - .5) * Math.min(210, scrollArea.clientWidth * .35);
      const dy = (Math.random() - .5) * 125;
      const delay = Math.random() * 240;

      item.querySelectorAll(".name-fragment").forEach((fragment, index) => {
        const original = name[index];
        // Keep each letter's original width so changing glyphs never shifts the name.
        fragment.style.width = `${fragment.getBoundingClientRect().width}px`;
        if (original !== " ") {
          scramblingCharacters.push({
            fragment,
            original,
            delay: delay + 90 + index * 55,
            revealAt: delay + 1320 + index * 55,
            nextChange: 0
          });
        }
      });

      animations.push(item.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(-3deg)`, opacity: .18, filter: "blur(2px)" },
        { offset: .22, transform: `translate(${dx * .75}px, ${dy * .75}px) rotate(-1deg)`, opacity: .92, filter: "blur(0)" },
        { offset: .76, transform: `translate(${dx * .2}px, ${dy * .2}px) rotate(0deg)`, opacity: 1, filter: "blur(0)" },
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1, filter: "blur(0)" }
      ], { duration: 2600, delay, fill: "both", easing: "cubic-bezier(.45,0,.55,1)" }));

      item.querySelectorAll(".name-fragment").forEach((fragment, index) => {
        const flip = index % 2 ? -180 : 180;
        animations.push(fragment.animate([
          { transform: `rotateX(${flip}deg) translateY(8px)`, opacity: .55 },
          { offset: .24, transform: "rotateX(0deg) translateY(0)", opacity: .85 },
          { offset: .31, transform: `rotateX(${flip}deg) translateY(4px)`, opacity: .65 },
          { offset: .55, transform: "rotateX(0deg) translateY(0)", opacity: .9 },
          { offset: .63, transform: `rotateX(${flip}deg) translateY(2px)`, opacity: .75 },
          { transform: "rotateX(0deg) translateY(0)", opacity: 1 }
        ], { duration: 1700, delay: delay + 100 + index * 55, fill: "both", easing: "ease-in-out" }));
      });
    });

    scrambleFrame = requestAnimationFrame(() => scramble(performance.now()));
    finishTimer = setTimeout(finishAssembly, 2900);
  }

  document.querySelectorAll("[data-roster-target]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.tagName === "A") event.preventDefault();
      finishAssembly();
      opener = button;
      const target = button.dataset.rosterTarget;
      const roster = rosters.get(target);
      const single = Boolean(roster);
      dialog.classList.toggle("is-single", single);
      if (!single) fullRosterPage = 0;
      groups.forEach((group) => { group.hidden = single && group !== roster.group; });
      updateFullRosterView();

      if (single) {
        const groupName = roster.group.querySelector(".group-head h3").textContent;
        const grade = groupName.match(/^(New )(\d+(?:st|nd|rd|th))( Graders)$/);
        if (grade) {
          const accent = document.createElement("em");
          accent.textContent = grade[2];
          heading.replaceChildren(grade[1], accent, grade[3]);
        } else {
          heading.textContent = groupName;
        }
        heading.setAttribute("aria-label", `${groupName} — ${roster.items.length} Students`);
        count.textContent = roster.items.length;
        const overline = roster.group.querySelector(".group-overline").textContent.trim();
        subtitle.textContent = overline.endsWith(".") ? overline : `${overline}.`;
      } else {
        heading.textContent = "Meet the 2026–27 Team";
        heading.removeAttribute("aria-label");
        count.textContent = "";
        subtitle.textContent = "Four groups. One Cooper team.";
      }

      const shouldAnimate = single && !reducedMotion.matches && typeof Element.prototype.animate === "function";
      dialog.classList.toggle("is-assembling", shouldAnimate);
      dialog.showModal();
      scrollArea.scrollTop = 0;
      closeButton.focus();
      if (shouldAnimate) assemble(roster);
    });
  });

  closeButton.addEventListener("click", () => {
    finishAssembly();
    dialog.close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      finishAssembly();
      dialog.close();
    }
  });
  dialog.addEventListener("cancel", finishAssembly);
  dialog.addEventListener("close", () => {
    finishAssembly();
    if (opener) opener.focus();
  });
}());