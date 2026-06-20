// vs.js — Visual Story section for impact.html

// -- Build the dot indicators for every carousel on the page --
function vsBuildDots() {
  document.querySelectorAll(".vs-carr-track").forEach(function(track) {
    var dotId = track.id.replace("vs-c-", "vs-dots-");
    var dotBox = document.getElementById(dotId);
    if (!dotBox) return;

    var imgs = track.querySelectorAll(".vs-carr-img");
    imgs.forEach(function(img, idx) {
      var dot = document.createElement("button");
      dot.className = "vs-carr-dot" + (idx === 0 ? " active" : "");
      dot.setAttribute("aria-label", "Image " + (idx + 1));
      dot.addEventListener("click", function() {
        track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
      });
      dotBox.appendChild(dot);
    });

    track.addEventListener("scroll", function() {
      vsUpdateDots(track, dotBox);
      vsUpdateArrows(track);
    });

    vsUpdateArrows(track);
  });
}

function vsUpdateDots(track, dotBox) {
  if (!dotBox) return;
  var img = track.querySelector(".vs-carr-img");
  var imgW = img ? img.offsetWidth : track.clientWidth;
  var idx = Math.round(track.scrollLeft / imgW);
  dotBox.querySelectorAll(".vs-carr-dot").forEach(function(dot, i) {
    dot.classList.toggle("active", i === idx);
  });
}

function vsUpdateArrows(track) {
  var carousel = track.closest(".vs-carousel");
  if (!carousel) return;
  var prev = carousel.querySelector(".vs-carr-prev");
  var next = carousel.querySelector(".vs-carr-next");
  if (prev) prev.disabled = track.scrollLeft <= 1;
  if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
}

function vsCarr(trackId, dir) {
  var track = document.getElementById(trackId);
  if (!track) return;
  var img = track.querySelector(".vs-carr-img");
  var step = img ? img.offsetWidth : track.clientWidth;
  track.scrollBy({ left: dir * step, behavior: "smooth" });
}

function vsShow(n) {
  document.querySelectorAll(".vs-stage-btn").forEach(function(btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
    btn.setAttribute("tabindex", "-1");
  });
  document.querySelectorAll(".vs-panel").forEach(function(panel) {
    panel.classList.remove("active");
    panel.setAttribute("hidden", "");
  });
  var btn   = document.querySelector('.vs-stage-btn[data-stage="' + n + '"]');
  var panel = document.getElementById("vs-panel-" + n);
  if (btn)   { btn.classList.add("active"); btn.setAttribute("aria-selected", "true"); btn.setAttribute("tabindex", "0"); }
  if (panel) { panel.classList.add("active"); panel.removeAttribute("hidden"); }
  if (panel) {
    panel.querySelectorAll(".vs-carr-track").forEach(function(track) {
      vsUpdateArrows(track);
    });
  }
}

document.addEventListener("DOMContentLoaded", function() {
  var modal = document.getElementById("road-modal");
  if (modal) document.body.appendChild(modal);
  vsBuildDots();
  roadMapInit();
});


// --
//  ROAD MAP
// --

var ROAD_PHASES = [
  { num:1, title:"Early Langley Farmland", sub:"Origins · Pre-1900s",       year:1860, color:"#c9a84c", bg:"#2a1f00" },
  { num:2, title:"Railroad Era",           sub:"Growth Catalyst · 1900s",   year:1906, color:"#3b82f6", bg:"#0c1f4a" },
  { num:3, title:"Federal Expansion",      sub:"WWII Era · 1940s",          year:1942, color:"#22d3ee", bg:"#042830" },
  { num:4, title:"CIA Construction",       sub:"Intelligence HQ · 1950–61", year:1961, color:"#a78bfa", bg:"#1e0a45" },
  { num:5, title:"Tysons Boom",            sub:"Economic Rise · 1970s–90s", year:1985, color:"#fb923c", bg:"#3d1400" },
  { num:6, title:"Modern McLean",          sub:"Strategic Hub · Today",     year:2026, color:"#4ade80", bg:"#0a2e15" },
];

var roadVisited   = [];
var roadActiveNum = null;
var roadOpenNum   = null;
var roadYearNow   = 1840;
var roadYearTimer = null;

// Max-spread S: center-top → far right → far left → center-bottom
var ROAD_PATH = "M 600 28 C 598 130 1155 140 1142 262 C 1130 384 48 422 62 512 C 76 594 576 666 612 685";

// Pins spread across 3 curves — pins 1-5 pushed higher for clear gap to pin 6
var ROAD_PINS = [
  { num:1, px:820, py:95,   side:"right" },
  { num:2, px:1120, py:210, side:"left" },
  { num:3, px:832, py:315, side:"left"  },
  { num:4, px:500, py:340, side:"left"  },
  { num:5, px:118, py:505, side:"right" },
  { num:6, px:605, py:648, side:"left"  },
];

function svgEl(tag, attrs) {
  var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
  return el;
}

function roadMapInit() {
  var svg = document.getElementById("road-map-svg");
  if (!svg) return;

  // SVG glow filter
  var defs = svgEl("defs", {});
  var filt = svgEl("filter", { id:"road-glow", x:"-60%", y:"-60%", width:"220%", height:"220%" });
  var blur = svgEl("feGaussianBlur", { stdDeviation:"5", result:"blur" });
  var mrg  = svgEl("feMerge", {});
  mrg.appendChild(svgEl("feMergeNode", { in:"blur" }));
  mrg.appendChild(svgEl("feMergeNode", { in:"SourceGraphic" }));
  filt.appendChild(blur); defs.appendChild(filt); svg.appendChild(defs);

  // Road layers (wider strokes for the bigger S-curve)
  var roadLayers = [
    { stroke:"#0a0f1e", sw:92,  op:0.7 },
    { stroke:"#8a95a8", sw:82,  op:1   },
    { stroke:"#5c6578", sw:76,  op:1   },
    { stroke:"#3a4255", sw:70,  op:1   },
    { stroke:"#434e64", sw:62,  op:1   },
    { stroke:"#d0d8e8", sw:1.8, op:0.5,  dash:"20 10" },
    { stroke:"#ffffff", sw:2.5, op:0.85, dash:"18 16" },
  ];
  roadLayers.forEach(function(l) {
    var attrs = { d:ROAD_PATH, fill:"none", stroke:l.stroke, "stroke-width":l.sw,
                  "stroke-linecap":"round", opacity:l.op };
    if (l.dash) attrs["stroke-dasharray"] = l.dash;
    svg.appendChild(svgEl("path", attrs));
  });

  // Draw pins
  ROAD_PINS.forEach(function(pin) {
    var p   = ROAD_PHASES[pin.num - 1];
    var isL = pin.side === "left";
    // Connector dot sits flush on the nearest edge of the label box
    var lw = 206;
    var connX = isL ? pin.px - 38 : pin.px + 38;
    var connY = pin.py - 30;

    var g = svgEl("g", { id:"road-pin-g-"+pin.num, class:"road-pin-group",
                          tabindex:"0", role:"button",
                          "aria-label":"Phase "+pin.num+" — "+p.title });
    g.addEventListener("click", function() { roadPinClick(pin.num); });
    g.addEventListener("keydown", function(e) {
      if (e.key==="Enter"||e.key===" ") { e.preventDefault(); roadPinClick(pin.num); }
    });
    // Hover: show glow ring + brighten label border
    g.addEventListener("mouseenter", function() {
      var glow = document.getElementById("road-pin-glow-"+pin.num);
      if (glow) glow.setAttribute("opacity","0.65");
      var lRect = document.getElementById("road-label-rect-"+pin.num);
      if (lRect) { lRect.setAttribute("stroke", p.color); lRect.setAttribute("stroke-width","3"); }
    });
    g.addEventListener("mouseleave", function() {
      if (pin.num === roadActiveNum) return;
      var glow = document.getElementById("road-pin-glow-"+pin.num);
      if (glow) glow.setAttribute("opacity","0");
      var lRect = document.getElementById("road-label-rect-"+pin.num);
      if (lRect) { lRect.setAttribute("stroke-width","1.8"); lRect.setAttribute("stroke", p.color+"88"); }
    });

    // Glow ring — hidden until hovered or active
    g.appendChild(svgEl("circle", {
      id:"road-pin-glow-"+pin.num,
      cx:pin.px, cy:pin.py-4, r:44, fill:"none",
      stroke:p.color, "stroke-width":"4", opacity:"0",
      filter:"url(#road-glow)"
    }));

    // Connector dot on road
    g.appendChild(svgEl("circle", {
      id:"road-conn-dot-"+pin.num,
      cx:connX, cy:connY, r:5,
      fill:"#1e2236", stroke:p.color, "stroke-width":"1.8"
    }));

    // Dashed arm: label box edge → nearest side of pin body
    var lineX2 = isL ? pin.px + 30 : pin.px - 30;
    g.appendChild(svgEl("line", {
      id:"road-conn-line-"+pin.num,
      x1:connX, y1:connY, x2:lineX2, y2:pin.py - 12,
      stroke:p.color, "stroke-width":"1.5", "stroke-dasharray":"5 4", opacity:"0.55"
    }));

    // Year badge text only above pin (no background rect)
    var yearX = isL ? pin.px - 58 : pin.px + 58;
    var yearTxt = svgEl("text", {
      id:"road-year-badge-"+pin.num,
      x:yearX, y:pin.py-52,
      "text-anchor":"middle", "font-size":"13", "font-weight":"900",
      fill:p.color, "font-family":"Courier New, monospace", "pointer-events":"none",
      filter:"url(#road-glow)"
    });
    yearTxt.textContent = p.year;
    g.appendChild(yearTxt);

    // Shadow
    g.appendChild(svgEl("ellipse", { cx:pin.px, cy:pin.py+42, rx:18, ry:7, fill:"#000", opacity:"0.38" }));

    // Pin body
    g.appendChild(svgEl("path", {
      id:"road-pin-body-"+pin.num,
      d:"M 0 -32 C 18 -32 32 -18 32 0 C 32 20 0 46 0 46 C 0 46 -32 20 -32 0 C -32 -18 -18 -32 0 -32 Z",
      fill:"#141828", stroke:p.color, "stroke-width":"3",
      transform:"translate("+pin.px+","+pin.py+")"
    }));

    // Inner filled circle
    g.appendChild(svgEl("circle", {
      id:"road-pin-inner-"+pin.num,
      cx:pin.px, cy:pin.py, r:18, fill:p.color, opacity:"0.95"
    }));

    // Number text
    var numTxt = svgEl("text", {
      id:"road-pin-text-"+pin.num,
      x:pin.px, y:pin.py,
      "text-anchor":"middle", "dominant-baseline":"middle",
      "font-size":"20", "font-weight":"900", fill:"#fff",
      "pointer-events":"none", "user-select":"none"
    });
    numTxt.textContent = pin.num;
    g.appendChild(numTxt);

    // Label card — much bigger fonts
    // Label card — 3-line layout: PHASE N / title / sub
    var lw = 206;
    var labelG = svgEl("g", {
      id:"road-label-"+pin.num,
      transform: isL
        ? "translate("+(pin.px-34)+","+(pin.py-30)+")"
        : "translate("+(pin.px+34)+","+(pin.py-30)+")"
    });
    var rx = isL ? -(lw+4) : 4;
    labelG.appendChild(svgEl("rect", {
      id:"road-label-rect-"+pin.num,
      x:rx, y:"-48", width:""+lw, height:"96", rx:"10",
      fill:"#070a1c", stroke:p.color+"88", "stroke-width":"1.8", opacity:"0.98"
    }));
    var tcx = isL ? -(lw/2+4) : (lw/2+4);

    // Line 1: "PHASE N" — small colored label
    var phaseTagEl = svgEl("text", {
      id:"road-label-tag-"+pin.num,
      x:tcx, y:"-28", "text-anchor":"middle",
      "font-size":"11", "font-weight":"700", fill:p.color,
      "letter-spacing":"0.2em", "font-family":"Courier New, monospace"
    });
    phaseTagEl.textContent = "PHASE " + pin.num;
    labelG.appendChild(phaseTagEl);

    // Line 2: title text only — no overflow
    var titleEl = svgEl("text", {
      id:"road-label-title-"+pin.num,
      x:tcx, y:"-10", "text-anchor":"middle",
      "font-size":"15", "font-weight":"800", fill:"#eef4ff"
    });
    titleEl.textContent = p.title;
    labelG.appendChild(titleEl);

    // Line 3: sub (era/years) — bigger and bright
    var subEl = svgEl("text", {
      id:"road-label-sub-"+pin.num,
      x:tcx, y:"14", "text-anchor":"middle",
      "font-size":"13", "font-weight":"600", fill:p.color
    });
    subEl.textContent = p.sub;
    labelG.appendChild(subEl);

    g.appendChild(labelG);
    svg.appendChild(g);
  });

  // Build progress dots (now inside year box)
  var dotBar = document.getElementById("road-progress-dots");
  if (dotBar) {
    ROAD_PHASES.forEach(function(p) {
      var d = document.createElement("span");
      d.className = "road-dot";
      d.id = "road-dot-"+p.num;
      d.style.border = "1.5px solid "+p.color+"55";
      dotBar.appendChild(d);
    });
  }
}

// -- Pin click: animate year + open modal --
function roadPinClick(n) {
  roadActiveNum = n;
  roadUpdatePinVisuals();
  roadAnimYear(n);
  roadOpenModal(n);
}

// -- Year counter animation --
function roadAnimYear(n) {
  var p      = ROAD_PHASES[n - 1];
  var target = p.year;
  var from   = roadYearNow;

  if (roadYearTimer) clearInterval(roadYearTimer);

  var box   = document.getElementById("road-year-box");
  var numEl = document.getElementById("road-year-num");
  var label = document.getElementById("road-year-label");
  var sub   = document.getElementById("road-year-sub");
  if (!box || !numEl) return;

  box.style.setProperty("--ry-color", p.color);
  box.classList.add("running");
  numEl.style.color = p.color;
  // Keep "YEAR ODOMETER" label always visible — update sub for phase info
  if (sub) sub.textContent = "traveling\u2026";

  var diff = target - from;
  if (diff === 0) {
    box.classList.remove("running");
    if (sub) sub.textContent = "Phase " + n + " \u00b7 " + p.sub;
    return;
  }

  var STEPS    = 50;
  var absD     = Math.abs(diff);
  var stepSize = diff > 0 ? Math.max(1, Math.round(absD / STEPS)) : Math.min(-1, -Math.round(absD / STEPS));
  var interval = Math.max(12, Math.round(900 / Math.abs(diff / stepSize)));
  var current  = from;

  roadYearTimer = setInterval(function() {
    current += stepSize;
    var done = stepSize > 0 ? current >= target : current <= target;
    if (done) {
      current = target;
      clearInterval(roadYearTimer);
      // Keep box visually bright after animation — don't snap back to dim default
      box.classList.remove("running");
      box.style.borderColor = p.color;
      box.style.boxShadow   = "0 0 28px " + p.color + "88, inset 0 0 12px rgba(0,0,0,0.5)";
      numEl.style.textShadow = "0 0 24px " + p.color + "99, 0 0 48px " + p.color + "44";
      if (sub) sub.textContent = "Phase " + n + " \u00b7 " + p.sub;
    }
    numEl.textContent = current;
    roadYearNow = current;
  }, interval);
}

// -- Open modal for phase n --
function roadOpenModal(n) {
  var p = ROAD_PHASES[n - 1];
  roadOpenNum = n;

  // Build header
  var hdr = document.getElementById("road-modal-header");
  if (hdr) {
    hdr.style.background   = p.bg;
    hdr.style.borderBottom = "2px solid " + p.color + "55";
    hdr.innerHTML =
      '<svg class="road-modal-pin-icon" width="38" height="46" viewBox="-25 -25 50 64" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 0 -25 C 15 -25 25 -14 25 0 C 25 16 0 37 0 37 C 0 37 -25 16 -25 0 C -25 -14 -15 -25 0 -25 Z" fill="' + p.color + '"/>' +
        '<circle r="12" fill="rgba(255,255,255,0.22)"/>' +
        '<text text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="900" fill="#fff">' + n + '</text>' +
      '</svg>' +
      '<div class="road-modal-title-area">' +
        '<div class="road-modal-eyebrow" style="color:' + p.color + '">' +
          'PHASE ' + n + ' OF 6 \u00b7 ' + p.sub.split('\u00b7')[0].trim().toUpperCase() +
        '</div>' +
        '<div class="road-modal-title">' + p.title + '</div>' +
      '</div>' +
      '<div class="road-modal-year-badge" style="color:' + p.color + ';background:' + p.color + '1a;border:2px solid ' + p.color + '66">' + p.year + '</div>' +
      '<button class="road-modal-close" onclick="roadCloseModal()" aria-label="Close">&#x2715;</button>' +
      (n === 1 ? '<span class="road-start-badge">&#9654; Start Journey</span>' : '');
  }

  // Show correct panel — hide others first
  document.querySelectorAll(".road-modal-body .vs-panel").forEach(function(panel) {
    panel.classList.remove("active");
    panel.setAttribute("hidden", "");
  });
  var panel = document.getElementById("vs-panel-" + n);
  if (panel) {
    panel.classList.add("active");
    panel.removeAttribute("hidden");
  }

  // Style modal card border/glow
  var card = document.getElementById("road-modal-card");
  if (card) {
    card.style.border    = "2px solid " + p.color + "66";
    card.style.boxShadow = "0 0 90px " + p.color + "44, 0 32px 90px rgba(0,0,0,0.85)";
  }

  // Open overlay first so the panel has dimensions when carousel measures
  document.getElementById("road-modal").classList.add("open");

  // After first paint: reset carousels and rebuild dots if needed
  setTimeout(function() {
    if (!panel) return;
    panel.querySelectorAll(".vs-carr-track").forEach(function(t) {
      t.scrollLeft = 0;
      var dotId  = t.id.replace("vs-c-", "vs-dots-");
      var dotBox = document.getElementById(dotId);
      // Rebuild dots if missing (modal was hidden at DOMContentLoaded)
      if (dotBox && dotBox.children.length === 0) {
        var imgs = t.querySelectorAll(".vs-carr-img");
        imgs.forEach(function(img, idx) {
          var dot = document.createElement("button");
          dot.className = "vs-carr-dot" + (idx === 0 ? " active" : "");
          dot.setAttribute("aria-label", "Image " + (idx + 1));
          (function(i) {
            dot.addEventListener("click", function() {
              t.scrollTo({ left: i * t.clientWidth, behavior: "smooth" });
            });
          })(idx);
          dotBox.appendChild(dot);
        });
      }
      vsUpdateArrows(t);
      vsUpdateDots(t, document.getElementById(dotId));
    });
  }, 60);

  // Mark visited
  if (roadVisited.indexOf(n) === -1) roadVisited.push(n);
  roadUpdatePinVisuals();
  roadUpdateFooter(n);
}

// -- Footer: next-stop CTA or all-done --
function roadUpdateFooter(n) {
  var p = ROAD_PHASES[n - 1];
  var footer = document.getElementById("road-modal-footer");
  if (!footer) return;

  var nextPhase = null;
  for (var i = 0; i < ROAD_PHASES.length; i++) {
    if (roadVisited.indexOf(ROAD_PHASES[i].num) === -1) {
      nextPhase = ROAD_PHASES[i]; break;
    }
  }

  if (nextPhase) {
    footer.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">' +
        '<span class="road-modal-explored" style="color:' + p.color + '">\u2713 Phase ' + n + ' explored! &nbsp;\u2022&nbsp; Stop ' + n + ' of 6 completed.</span>' +
      '</div>' +
      '<button class="road-modal-next-btn" style="background:' + nextPhase.color + ';color:#000"' +
        ' onclick="roadCloseModal();setTimeout(function(){roadPinClick(' + nextPhase.num + ')},80)">' +
        'Next Stop: ' + nextPhase.title + ' \u2192' +
      '</button>';
  } else {
    footer.innerHTML =
      '<div class="road-modal-complete" style="font-size:18px;font-weight:800;color:#f5d060;text-shadow:0 0 24px #c9a84c99,0 0 48px #c9a84c44;letter-spacing:0.02em;">All 6 sites visited. Journey Complete. Explore McLean\'s Lasting Legacy \u2193</div>';
  }
}

function roadCloseModal() {
  var overlay = document.getElementById("road-modal");
  if (overlay) overlay.classList.remove("open");
  roadOpenNum = null;
}

// Close on backdrop click
document.addEventListener("click", function(e) {
  var overlay = document.getElementById("road-modal");
  if (e.target === overlay) roadCloseModal();
});

// Escape key closes modal
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape" && roadOpenNum !== null) roadCloseModal();
});

// -- Update SVG pin visuals: active glow + visited state --
function roadUpdatePinVisuals() {
  ROAD_PHASES.forEach(function(p) {
    var isVisited = roadVisited.indexOf(p.num) !== -1;
    var isActive  = p.num === roadActiveNum;

    var grp   = document.getElementById("road-pin-g-"      + p.num);
    var glow  = document.getElementById("road-pin-glow-"   + p.num);
    var body  = document.getElementById("road-pin-body-"   + p.num);
    var inner = document.getElementById("road-pin-inner-"  + p.num);
    var txt   = document.getElementById("road-pin-text-"   + p.num);
    var cDot  = document.getElementById("road-conn-dot-"   + p.num);
    var cLine = document.getElementById("road-conn-line-"  + p.num);
    var lRect = document.getElementById("road-label-rect-" + p.num);
    var lTit  = document.getElementById("road-label-title-"+ p.num);
    var lSub  = document.getElementById("road-label-sub-"  + p.num);
    var yBdg  = document.getElementById("road-year-badge-" + p.num);
    var yBg   = document.getElementById("road-year-bg-"    + p.num);
    var dot   = document.getElementById("road-dot-"        + p.num);

    // Clear active class on all groups
    if (grp) grp.classList.remove("road-pin-active");

    // Active pin: glow ring + bright label border
    if (isActive) {
      if (grp)  grp.classList.add("road-pin-active");
      if (glow) { glow.setAttribute("opacity", "0.75"); glow.setAttribute("stroke", p.color); }
      if (lRect){ lRect.setAttribute("stroke", p.color); lRect.setAttribute("stroke-width", "2.5"); }
      if (lTit) { lTit.setAttribute("fill", "#ffffff"); }
    } else {
      if (glow) glow.setAttribute("opacity", "0");
      if (lRect){ lRect.setAttribute("stroke-width", "1.4"); }
    }

    // Visited: fill pin gold/color + checkmark
    if (isVisited) {
      if (body)  { body.setAttribute("fill", p.color); body.setAttribute("stroke-width", "0"); }
      if (inner) { inner.setAttribute("fill", "rgba(255,255,255,0.18)"); }
      if (txt)   { txt.textContent = "\u2713"; txt.setAttribute("fill", "#fff"); txt.setAttribute("font-size","15"); }
      if (cDot)  { cDot.setAttribute("fill", p.color); }
      if (cLine) { cLine.setAttribute("opacity", "0.85"); }
      if (!isActive && lRect) { lRect.setAttribute("stroke", p.color + "88"); }
      if (!isActive && lTit)  { lTit.setAttribute("fill", p.color); }
      if (yBdg)  { yBdg.setAttribute("fill", p.color); }
      if (yBg)   { yBg.setAttribute("fill", p.color + "44"); yBg.setAttribute("stroke", p.color); }
      if (dot) {
        dot.style.background = p.color;
        dot.style.boxShadow  = "0 0 9px " + p.color;
        dot.style.border     = "2px solid " + p.color;
      }
    }
  });
}
