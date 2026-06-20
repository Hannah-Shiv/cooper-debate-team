// impact.js — flip cards + animated stat counters

// -- Flip cards: click to flip, click again to flip back --
var cards = document.querySelectorAll(".impact-card");
for (var i = 0; i < cards.length; i++) {
  (function(card) {
    card.addEventListener("click", function() {
      card.classList.toggle("flipped");
    });
    card.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.classList.toggle("flipped"); }
    });
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
  })(cards[i]);
}

// -- Animated stat counters --
function animateCounter(el, target, suffix, duration) {
  var start    = 0;
  var startTs  = null;
  var isHash   = String(target).charAt(0) === "#";
  var numVal   = isHash ? parseInt(String(target).slice(1)) : parseInt(target);
  var prefix   = isHash ? "#" : "";

  if (isNaN(numVal)) { return; }

  function step(ts) {
    if (!startTs) startTs = ts;
    var pct      = Math.min((ts - startTs) / duration, 1);
    var ease     = 1 - Math.pow(1 - pct, 3);
    var current  = Math.round(ease * numVal);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (pct < 1) requestAnimationFrame(step);
    else         el.textContent = prefix + numVal.toLocaleString() + suffix;
  }
  requestAnimationFrame(step);
}

function runCounters() {
  document.querySelectorAll(".impact-stat-num").forEach(function(el) {
    var raw = el.textContent.trim();
    var suffix = raw.indexOf("K+") !== -1 ? "K+" : (raw.indexOf("+") !== -1 ? "+" : "");
    var clean  = raw.replace("K+","").replace("+","");
    animateCounter(el, clean, suffix, 1400);
  });
}

// Trigger counters when stats section scrolls into view
var statsEl = document.querySelector(".impact-stats");
if (statsEl && "IntersectionObserver" in window) {
  var counterDone = false;
  var obs = new IntersectionObserver(function(entries) {
    if (entries[0].isIntersecting && !counterDone) {
      counterDone = true;
      runCounters();
      obs.disconnect();
    }
  }, { threshold: 0.3 });
  obs.observe(statsEl);
} else if (statsEl) {
  runCounters();
}
