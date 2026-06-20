//
// TIMELINE.JS — Hannah Netre and Moorva, Cooper Middle School, McLean VA, 2026 TSA
// FINAL FINAL VERSION!! We rebuilt it again to match our reference design:
// - Left sidebar lists all 12 events
// - CIA seal with 12 clock pins AND a decorative ring connecting them
// - Popup slides in from the RIGHT so the seal stays visible
// - Previous/Next buttons let you walk through all 12 events in order
// Netre did the trig math, Moorva built the popup nav, Hannah designed the sidebar.
//

// -- Event data ------------
var eventsOrder = [1719, 1800, 1861, 1910, 1926, 1947, 1955, 1959, 1961, 1990, 1991, 1999];

var events = {
  1719: {
    num: 1, era: "Colonial Era", badge: "era-farm",
    title: 'Thomas Lee names the estate "Langley"',
    text: 'In 1719, Thomas Lee acquired 2,800 acres, naming it "Langley" after his ancestral English home. That name would persist for over 300 years. The rolling hills of this land would one day become the most secretive address in America.',
    img: "images/Salona-Langley.jpg",
    why: [
      "The name \u201cLangley\u201d began as a private estate, long before it became associated with intelligence.",
      "This moment established the geographic identity that would survive for centuries.",
      "What began as private land would later become one of the most recognized intelligence locations in the world."
    ]
  },
  1800: {
    num: 2, era: "Colonial Era", badge: "era-farm",
    title: "Salona estate built on the rolling hills",
    text: "Around 1800, the Salona estate was established on the rolling Virginia hills. Wealthy Washingtonians built country retreats here. Salona still stands today — just minutes from the CIA campus and one of the oldest homes in the McLean area.",
    img: "images/Salona-Langley-Built.jpg",
    why: [
      "Salona reflects Langley\u2019s early agricultural roots and rural identity.",
      "It represents the quiet countryside that existed before federal transformation.",
      "Its survival today provides a physical connection to Langley\u2019s earliest history."
    ]
  },
  1861: {
    num: 3, era: "Civil War", badge: "era-war",
    title: "Union Army establishes Fort Marcy on Langley farmland",
    text: "The Union Army established Camp Griffin and Fort Marcy on these hills in 1861-62. Tens of thousands of soldiers camped here. Fort Marcy is now a National Park Service site just minutes from CIA headquarters.",
    img: "images/Fort-Marcy.jpg",
    why: [
      "The Civil War introduced strategic military importance to the region.",
      "It marked the first time Langley became tied to national defense.",
      "Fort Marcy showed how Langley\u2019s location held long-term strategic value."
    ]
  },
  1910: {
    num: 4, era: "Farmland Era", badge: "era-farm",
    title: "McLean officially named; remains agricultural",
    text: "McLean officially became a community in 1910, named after John Roll McLean. It remained largely agricultural — far removed from the spy world to come. Country estates and dairy farms covered land that would later hold the CIA.",
    img: "images/John_Roll_McLean-2.jpg",
    why: [
      "As McLean formed, Langley became part of a growing suburban community.",
      "Transportation and population growth began reshaping the landscape.",
      "This period reflects the transition from isolated farmland to connected community."
    ]
  },
  1926: {
    num: 5, era: "Farmland Era", badge: "era-farm",
    title: "Scattergood-Thorne House built — now CIA's oldest structure",
    text: "A Georgian Revival house was built in 1926. Margaret Scattergood and Florence Thorne later purchased it and lived there for 53 years — eventually surrounded by the CIA campus. The house still stands on CIA grounds today.",
    img: "images/scattergood-aerial-cbs.jpg",
    why: [
      "This house became one of the last private homes on land later absorbed into the CIA campus.",
      "It symbolizes the transition from personal property to federal control.",
      "Its history captures the human side of land transformation."
    ]
  },
  1947: {
    num: 6, era: "Transition", badge: "era-farm",
    title: "CIA established; operates from cramped D.C. buildings",
    text: "The National Security Act of 1947 created the CIA. It operated from scattered buildings in Washington DC. Director Allen Dulles began searching for a permanent home — and McLean farmland would soon provide it.",
    img: "images/National-Security-Act-1947.jpg",
    why: [
      "The creation of the CIA changed American intelligence forever.",
      "It set the stage for Langley\u2019s transformation into a global intelligence center.",
      "This decision connected Langley to national and international events."
    ]
  },
  1955: {
    num: 7, era: "Transition", badge: "era-cia",
    title: "Eisenhower signs legislation; $46 million approved",
    text: "Eisenhower signed legislation approving $46 million to acquire 258 McLean acres. Route 123 was rerouted. Chain-link fences replaced split-rail farm fencing. The transformation of quiet McLean had officially begun.",
    img: "images/Eisenhower-signing-1955.jpg",
    why: [
      "Federal funding made the Langley headquarters possible.",
      "It turned intelligence growth into physical expansion on former farmland.",
      "This funding marked the shift from planning to reality."
    ]
  },
  1959: {
    num: 8, era: "CIA Era", badge: "era-cia",
    title: "Eisenhower lays the cornerstone — November 3, 1959",
    text: "Eisenhower laid the cornerstone of the Original Headquarters Building. The firm Harrison & Abramovitz — designers of the United Nations Building — created the seven-story structure. Construction transformed former cornfields permanently.",
    img: "images/cia-broke-ground-langley.jpg",
    why: [
      "This marked the official beginning of CIA construction in Langley.",
      "Presidential involvement highlighted the national importance of the project.",
      "Construction permanently changed the physical identity of the region."
    ]
  },
  1961: {
    num: 9, era: "CIA Era", badge: "era-cia",
    title: "CIA employees move in — the farm is now a fortress",
    text: "The Original Headquarters Building opened in March 1961. Thousands of officers moved in by September. The lobby featured the CIA Seal and the Memorial Wall: gold stars for officers killed in service. The farm was now a fortress.",
    img: "images/cia-original-headquarters.jpg",
    why: [
      "The arrival of the CIA permanently reshaped Langley\u2019s infrastructure, economy, and significance.",
      "Thousands of employees brought growth and federal influence.",
      "Langley was no longer rural\u2014it had become a center of intelligence."
    ]
  },
  1990: {
    num: 10, era: "CIA Era", badge: "era-cia",
    title: "Kryptos installed — K4 still unsolved",
    text: "Jim Sanborn installed the Kryptos sculpture in 1990. Three of four encrypted panels have been solved. K4 — 97 characters — remains one of the world's most famous unsolved codes. CIA analysts and outside cryptographers still work on it.",
    img: "images/Kryptos_sculptor.jpg",
    why: [
      "Kryptos reflects Langley\u2019s culture of secrecy, intelligence, and mystery.",
      "It became a symbol of modern cryptography.",
      "Its unsolved code continues to challenge experts worldwide."
    ]
  },
  1991: {
    num: 11, era: "CIA Era", badge: "era-cia",
    title: "New Headquarters Building opens — campus nearly doubles",
    text: "The New Headquarters Building opened in 1991, adding two six-story towers connected by tunnel to the original building. The campus footprint nearly doubled. McLean's most secretive neighbor had grown into a sprawling complex.",
    img: "images/CIA_New_HQ_Entrance.jpg",
    why: [
      "Expansion showed how much the intelligence mission had grown.",
      "More space and modernized facilities became necessary.",
      "This expansion reinforced Langley\u2019s role in modern intelligence."
    ]
  },
  1999: {
    num: 12, era: "CIA Era", badge: "era-cia",
    title: "Renamed the George Bush Center for Intelligence",
    text: "On April 26, 1999, the complex was named the George Bush Center for Intelligence. The world still calls it by one word: 'Langley.' The name Thomas Lee gave to farmland in 1719 became synonymous with American intelligence forever.",
    img: "images/cia-renamed-george-bush.jpg",
    why: [
      "Renaming the headquarters honored leadership in intelligence history.",
      "It cemented Langley\u2019s place in national memory.",
      "Even with the new name, the world still recognizes it simply as Langley."
    ]
  }
};

// -- Era colors ------------
var eraColor = {
  "era-farm": { bg: "#e8a800", color: "#000" },
  "era-war":  { bg: "#ff7a55", color: "#fff" },
  "era-cia":  { bg: "#2d8eff", color: "#fff" }
};

// -- Label directions for 12 clock positions (outward from pin) --------------
// Netre: I mapped every clock position to a direction so labels never overlap the seal!
// Pin 12 → 12 o'clock (top), Pin 1 → 1 o'clock, Pin 2 → 2 o'clock … Pin 11 → 11 o'clock
var labelDirs = [
  "up-right",   // 0 (pin  1) — 1 o'clock
  "right",      // 1 (pin  2) — 2 o'clock
  "right",      // 2 (pin  3) — 3 o'clock (right)
  "right",      // 3 (pin  4) — 4 o'clock
  "down-right", // 4 (pin  5) — 5 o'clock
  "down",       // 5 (pin  6) — 6 o'clock (bottom)
  "down-left",  // 6 (pin  7) — 7 o'clock
  "left",       // 7 (pin  8) — 8 o'clock
  "left",       // 8 (pin  9) — 9 o'clock (left)
  "left",       // 9 (pin 10) — 10 o'clock
  "up-left",    // 10 (pin 11) — 11 o'clock
  "up"          // 11 (pin 12) — 12 o'clock (top)
];

// Short labels next to each pin (title abbreviated + year)
var shortLabels = {
  1719: 'Thomas Lee names "Langley"',
  1800: 'Salona estate built',
  1861: 'Fort Marcy — Civil War',
  1910: 'McLean officially named',
  1926: 'Scattergood-Thorne House',
  1947: 'CIA established',
  1955: '$46M approved',
  1959: 'Eisenhower cornerstone',
  1961: 'CIA moves in',
  1990: 'Kryptos installed',
  1991: 'New HQ opens',
  1999: 'Renamed George Bush Center'
};

// -- Current open event index (for Previous/Next) ----------------------------─
var currentIndex = 0;

// -- Build left sidebar ----
// Hannah: we built the sidebar so you can see all 12 events while you explore!
function buildSidebar() {
  var list = document.getElementById("tl-sidebar-list");
  if (!list) return; // sidebar removed in final no-sidebar design
  eventsOrder.forEach(function(id) {
    var d = events[id];
    var c = eraColor[d.badge];

    var li = document.createElement("li");
    li.className = "tl-sitem";
    li.setAttribute("data-id", id);

    var num = document.createElement("div");
    num.className = "tl-snum";
    num.textContent = d.num;
    num.style.background = c.bg;
    num.style.color = c.color;

    var info = document.createElement("div");
    info.className = "tl-sinfo";

    var title = document.createElement("div");
    title.className = "tl-stitle";
    title.textContent = d.title;

    var year = document.createElement("div");
    year.className = "tl-syear " + d.badge;
    year.textContent = id;

    info.appendChild(title);
    info.appendChild(year);
    li.appendChild(num);
    li.appendChild(info);
    list.appendChild(li);

    li.addEventListener("click", function() {
      currentIndex = eventsOrder.indexOf(id);
      openPopup(id);
      setActive(id);
    });
  });
}

// -- Build pins around the clock circle ------
// PIN_FACTOR: 1.18 = 18% outside circle edge — pins float in the dark space!
var PIN_FACTOR = 1.18;

// Rainbow gradient colors for each pin — clockwise from 12 o'clock (index 0)
// Hannah: each pin has its own glowing color like a stained glass window!
var pinColors = [
  '#f5c800', // 0 → 12 o'clock → 1719 — gold
  '#f0900a', // 1 →  1 o'clock → 1800 — orange
  '#d94040', // 2 →  2 o'clock → 1861 — red-orange
  '#c52030', // 3 →  3 o'clock → 1910 — crimson
  '#9b2060', // 4 →  4 o'clock → 1926 — magenta
  '#7030a0', // 5 →  5 o'clock → 1947 — purple
  '#2060c0', // 6 →  6 o'clock → 1955 — blue
  '#10a0b0', // 7 →  7 o'clock → 1959 — cyan
  '#20b050', // 8 →  8 o'clock → 1961 — green
  '#80c000', // 9 →  9 o'clock → 1990 — yellow-green
  '#c0b000', // 10 → 10 o'clock → 1991 — yellow
  '#c08000'  // 11 → 11 o'clock → 1999 — amber
];

function buildPins() {
  var img = document.getElementById("tl-seal-img");
  if (img.complete && img.naturalWidth > 0) {
    _placePins();
  } else {
    img.onload = function() { _placePins(); };
  }
}

function _placePins() {
  var img    = document.getElementById("tl-seal-img");
  var stage  = document.getElementById("tl-clock-stage");
  var container = document.getElementById("tl-pins");
  container.innerHTML = "";

  var imgRect   = img.getBoundingClientRect();
  var stageRect = stage.getBoundingClientRect();

  var imgW = imgRect.width;
  var imgH = imgRect.height;
  var W    = stageRect.width;
  var H    = stageRect.height;

  // Center of the seal image within the stage
  var imgCX = imgRect.left - stageRect.left + imgW / 2;
  var imgCY = imgRect.top  - stageRect.top  + imgH / 2;

  // Pin circle radius in pixels
  var R = Math.min(imgW, imgH) / 2 * PIN_FACTOR; // PIN_FACTOR > 1.0 → pins outside the circle!

  // Draw the decorative ring that connects all 12 pins
  _placeRing(imgCX, imgCY, R, W, H);

  // Pin #12 is at 12 o'clock; Pin #1 is at 1 o'clock (30° clockwise from top)
  var pin1Rad = (30 - 90) * Math.PI / 180;
  var pin1X = imgCX + R * Math.cos(pin1Rad);
  var pin1Y = imgCY + R * Math.sin(pin1Rad);

  eventsOrder.forEach(function(id, index) {
    var d = events[id];
    var c = eraColor[d.badge];

    // Pin 1 → 1 o'clock, Pin 12 → 12 o'clock; shift start by +30°
    var clockDeg = (index + 1) * 30;
    var mathRad  = (clockDeg - 90) * Math.PI / 180;

    var pinPxX = imgCX + R * Math.cos(mathRad);
    var pinPxY = imgCY + R * Math.sin(mathRad);

    var pin = document.createElement("div");
    pin.className = "tl-pin";
    pin.setAttribute("data-id", id);
    pin.style.left = (pinPxX / W * 100) + "%";
    pin.style.top  = (pinPxY / H * 100) + "%";

    // Chronological numbering: index 0 → '1', index 11 → '12'
    var displayNum = index + 1;
    var pinCol = pinColors[index];

    var num = document.createElement("div");
    num.className = "tl-pin-num";
    num.textContent = displayNum;
    num.style.background = "rgba(2,5,18,0.92)";
    num.style.border = "2.5px solid " + pinCol;
    num.style.color = pinCol;
    num.style.boxShadow = "0 0 0 4px " + pinCol + "33, 0 0 20px " + pinCol + "99, 0 0 40px " + pinCol + "44";
    num.style.textShadow = "0 0 8px " + pinCol;

    // Label (short title + year) pointing outward
    var label = document.createElement("div");
    label.className = "tl-pin-label dir-" + labelDirs[index];

    var lname = document.createElement("div");
    lname.className = "tl-pin-lname";
    lname.textContent = shortLabels[id];

    var lyear = document.createElement("div");
    lyear.className = "tl-pin-lyear";
    lyear.textContent = id;
    lyear.style.color = pinCol;

    label.appendChild(lname);
    label.appendChild(lyear);
    pin.appendChild(num);
    pin.appendChild(label);
    container.appendChild(pin);

    pin.addEventListener("click", function() {
      currentIndex = index;
      openPopup(id);
      setActive(id);
    });
  });

  // Draw the "click to start" hint arrow pointing at pin #1
  _placeArrow(pin1X, pin1Y, W, H);
}

// -- Draw the decorative ring connecting pins --
// Netre: a CSS circle element centered exactly on the seal at the same radius as the pins!
function _placeRing(cx, cy, R, W, H) {
  var ring = document.getElementById("tl-pin-ring");
  var diam = R * 2;
  ring.style.width  = diam + "px";
  ring.style.height = diam + "px";
  ring.style.left   = ((cx - R) / W * 100) + "%";
  ring.style.top    = ((cy - R) / H * 100) + "%";
}

// Hint text is now a static HTML element (.tl-pin-hint-bar) above .tl-topbar.
function _placeArrow(px, py, W, H) { /* no-op */ }

// -- Build bottom timeline bar ----------------─
function buildBottomBar() {
  var track = document.getElementById("tl-btrack");
  eventsOrder.forEach(function(id) {
    var d = events[id];
    var c = eraColor[d.badge];

    var item = document.createElement("div");
    item.className = "tl-bitem";
    item.setAttribute("data-id", id);

    var num = document.createElement("div");
    num.className = "tl-bnum";
    num.textContent = d.num;
    num.style.background = c.bg;
    num.style.color = c.color;

    var year = document.createElement("div");
    year.className = "tl-byear " + d.badge;
    year.textContent = id;

    item.appendChild(num);
    item.appendChild(year);
    track.appendChild(item);

    item.addEventListener("click", function() {
      currentIndex = eventsOrder.indexOf(id);
      openPopup(id);
      setActive(id);
    });
  });

  document.getElementById("tl-bar-prev").addEventListener("click", function() {
    document.getElementById("tl-btrack").scrollBy({ left: -200, behavior: "smooth" });
  });
  document.getElementById("tl-bar-next").addEventListener("click", function() {
    document.getElementById("tl-btrack").scrollBy({ left: 200, behavior: "smooth" });
  });
}

// -- Highlight active sidebar item + pin + bottom dot ------------------------─
function setActive(id) {
  document.querySelectorAll(".tl-pin, .tl-bitem, .tl-sitem").forEach(function(el) {
    el.classList.remove("active");
  });
  document.querySelectorAll("[data-id='" + id + "']").forEach(function(el) {
    el.classList.add("active");
  });
  // Scroll sidebar to make the active item visible
  var activeItem = document.querySelector(".tl-sitem.active");
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// -- Open popup (right-side panel) ------------
// Moorva: popup slides in from the right side so the seal stays visible!
function openPopup(id) {
  var d = events[id];
  var c = eraColor[d.badge];
  var popup = document.getElementById("tl-popup");

  // Number badge — rainbow color + clock display number
  var idx2 = eventsOrder.indexOf(parseInt(id));
  var popupCol = pinColors[idx2];
  var displayNum2 = idx2 + 1;
  var numEl = document.getElementById("tl-popup-num");
  numEl.textContent = displayNum2;
  numEl.style.background = "rgba(2,5,18,0.92)";
  numEl.style.border = "2.5px solid " + popupCol;
  numEl.style.color = popupCol;
  numEl.style.boxShadow = "0 0 0 3px " + popupCol + "33, 0 0 16px " + popupCol + "88";

  // Title + Year
  document.getElementById("tl-popup-title").textContent = d.title;
  var yearEl = document.getElementById("tl-popup-year");
  yearEl.textContent = id;
  yearEl.className = "tl-popup-year";
  yearEl.style.color = popupCol;

  // Image
  var imgEl = document.getElementById("tl-popup-img");
  imgEl.src = d.img;
  imgEl.alt = d.title;

  // Bullets
  var bullets = document.getElementById("tl-popup-bullets");
  bullets.innerHTML = "";
  d.text.split(". ").forEach(function(s) {
    s = s.trim();
    if (!s) return;
    if (s.slice(-1) !== "." && s.slice(-1) !== "!") s += ".";
    var li = document.createElement("li");
    li.textContent = s;
    bullets.appendChild(li);
  });

  // Left panel — same number badge colour, title, year, why text
  var leftPanel = document.getElementById("tl-left-panel");
  if (leftPanel) {
    var lNum = document.getElementById("tl-left-num");
    lNum.textContent = displayNum2;
    lNum.style.background  = "rgba(2,5,18,0.92)";
    lNum.style.border      = "2.5px solid " + popupCol;
    lNum.style.color       = popupCol;
    lNum.style.boxShadow   = "0 0 0 3px " + popupCol + "33, 0 0 16px " + popupCol + "88";
    var whyList = document.getElementById("tl-left-why");
    whyList.innerHTML = "";
    var bullets = Array.isArray(d.why) ? d.why : (d.why ? [d.why] : []);
    bullets.forEach(function(b) {
      var li = document.createElement("li");
      li.textContent = b;
      whyList.appendChild(li);
    });
    leftPanel.style.display = "flex";
    setTimeout(function() { leftPanel.classList.add("visible"); }, 10);
  }

  // Counter (7 / 12 style)
  var idx = eventsOrder.indexOf(parseInt(id));
  document.getElementById("tl-popup-counter").textContent = (idx + 1) + " / 12";

  // Show popup
  popup.style.display = "flex";
  setTimeout(function() { popup.classList.add("visible"); }, 10);
}

// -- Close popup ------------
function closePopup() {
  var popup = document.getElementById("tl-popup");
  var leftPanel = document.getElementById("tl-left-panel");
  popup.classList.remove("visible");
  if (leftPanel) leftPanel.classList.remove("visible");
  setTimeout(function() {
    popup.style.display = "none";
    if (leftPanel) leftPanel.style.display = "none";
    document.querySelectorAll(".tl-pin, .tl-bitem, .tl-sitem").forEach(function(el) {
      el.classList.remove("active");
    });
  }, 300);
}

// -- Previous / Next navigation ----------------
// Moorva: you can walk through all 12 events without going back to the seal!
document.getElementById("tl-popup-prev").addEventListener("click", function() {
  currentIndex = (currentIndex - 1 + 12) % 12;
  var id = eventsOrder[currentIndex];
  openPopup(id);
  setActive(id);
});
document.getElementById("tl-popup-next").addEventListener("click", function() {
  currentIndex = (currentIndex + 1) % 12;
  var id = eventsOrder[currentIndex];
  openPopup(id);
  setActive(id);
});

document.getElementById("tl-popup-close").addEventListener("click", closePopup);
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") closePopup();
  if (e.key === "ArrowRight") document.getElementById("tl-popup-next").click();
  if (e.key === "ArrowLeft")  document.getElementById("tl-popup-prev").click();
});

// -- Mobile stage height: fills the viewport so the stats are always below the fold --
// Moorva: CSS height: 100vh doesn't work the same inside iframes (like the Replit preview),
// so we measure the real window.innerHeight in JS and set the stage height from there.
function _setMobileStageHeight() {
  // Only run on mobile widths
  if (window.innerWidth > 640) return;
  var stage  = document.getElementById("tl-clock-stage");
  var topbar = document.querySelector(".tl-topbar");
  var nav    = document.querySelector(".tl-nav");
  if (!stage) return;
  // Bottom of the topbar area is where the clock stage begins
  var topOffset = 0;
  if (nav)    topOffset = nav.getBoundingClientRect().bottom;
  if (topbar) topOffset = topbar.getBoundingClientRect().bottom;
  // Make the stage exactly fill the remaining viewport — stats are just off-screen
  var stageH = Math.max(300, window.innerHeight - topOffset);
  stage.style.height = stageH + "px";
}

// -- Recalculate on resize --
// Moorva: on mobile, scrolling makes the browser address bar show/hide which
// fires a "resize" event and changes window.innerHeight — if we update the stage
// height here the circle jumps every time you scroll!! So we only re-place the
// pins on resize, and only reset the stage HEIGHT on a real orientation flip.
window.addEventListener("resize", function() {
  _placePins(); // safe on all screen sizes — just repositions pins
});

// Only re-measure the stage height when the device actually rotates
window.addEventListener("orientationchange", function() {
  setTimeout(function() {   // short delay so the browser finishes rotating first
    _setMobileStageHeight();
    _placePins();
  }, 300);
});

// -- Initialize --
buildSidebar();
_setMobileStageHeight();
buildPins();
buildBottomBar();

// Hint arrow placed in _placePins — no auto-open, user discovers on their own.
