/* ============================================================
   COOPER DEBATE TEAM — dome-nav.js
   Dome navigation adapted from Langley Legacy TSA 2026
   by Hannah Shiv, Netre, and Moorva — Cooper Middle School
   ============================================================ */

/* ── Global toggle (called from onclick="toggleMenu()") ───── */
function setDomeState(wrap, isOpen) {
  var btn = document.getElementById('circ-btn');
  wrap.classList.toggle('open', isOpen);
  document.body.classList.toggle('dome-open', isOpen);
  if (btn) {
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  }
}

window.toggleMenu = function () {
  var wrap = document.getElementById('circ-wrap');
  if (!wrap) return;
  setDomeState(wrap, !wrap.classList.contains('open'));
};

/* ── Intel Threads — quadratic bezier arcs + glow dots ──── */
function buildIntelThreads(wrap) {
  var old = document.getElementById('intel-threads');
  if (old) old.remove();

  var W  = window.innerWidth;
  var H  = 130;
  var cx = W / 2;
  var lx = cx - 36, ly = 36;   /* left exit of center button  */
  var rx = cx + 36, ry = 36;   /* right exit of center button */
  var ns = 'http://www.w3.org/2000/svg';

  var svg = document.createElementNS(ns, 'svg');
  svg.id = 'intel-threads';
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  /* No dark backdrop — keep corners visible when dome is open */

  /* Glow filter */
  var defs = document.createElementNS(ns, 'defs');
  var filt = document.createElementNS(ns, 'filter');
  filt.id = 'thr-glow';
  filt.setAttribute('x', '-150%'); filt.setAttribute('y', '-150%');
  filt.setAttribute('width', '400%'); filt.setAttribute('height', '400%');
  var blur = document.createElementNS(ns, 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', '5');
  blur.setAttribute('result', 'blur');
  var merge = document.createElementNS(ns, 'feMerge');
  var mn1   = document.createElementNS(ns, 'feMergeNode'); mn1.setAttribute('in', 'blur');
  var mn2   = document.createElementNS(ns, 'feMergeNode'); mn2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mn1); merge.appendChild(mn2);
  filt.appendChild(blur); filt.appendChild(merge);
  defs.appendChild(filt);
  svg.appendChild(defs);

  /* Quadratic bezier interpolation */
  function qb(t, x0,y0, cpx,cpy, x1,y1) {
    var m = 1 - t;
    return {
      x: m*m*x0 + 2*m*t*cpx + t*t*x1,
      y: m*m*y0 + 2*m*t*cpy + t*t*y1
    };
  }

  /* Draw one arc + its glowing dots
     dotTs = [[t, animDelay], ...] */
  function arc(ox,oy, cpx,cpy, ex,ey, opacity, dotTs) {
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M '+ox+','+oy+' Q '+cpx+','+cpy+' '+ex+','+ey);
    path.setAttribute('stroke', 'rgba(212,175,55,'+opacity+')');
    path.setAttribute('stroke-width', '1.1');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    /* Stars/dots removed — arcs only */
  }

  var isMobile = W < 640;
  var rw = W - rx;

  if (isMobile) {
    /* Mobile — 3 arcs per side, dots pushed to t≈0.82 (near screen edges) */
    arc(lx,ly,  lx*0.40, ly,          0,  36,  0.32, [[0.82,0.00]]);
    arc(lx,ly,  lx*0.34, 72,          0, 110,  0.28, [[0.80,0.35]]);
    arc(lx,ly,  lx*0.48, 48,          0,  66,  0.22, [[0.78,0.70]]);

    arc(rx,ry,  rx+rw*0.60, ry,       W,  36,  0.32, [[0.82,0.10]]);
    arc(rx,ry,  rx+rw*0.66, 72,       W, 110,  0.28, [[0.80,0.45]]);
    arc(rx,ry,  rx+rw*0.52, 48,       W,  66,  0.22, [[0.78,0.80]]);
  } else {
    /* Desktop — 3 arcs per side (halved), 2 dots each */
    arc(lx,ly,  lx*0.42, ly,          0,  36,  0.30, [[0.28,0.00],[0.72,0.42]]);
    arc(lx,ly,  lx*0.28,  6,          4,   0,  0.22, [[0.32,0.18],[0.70,0.62]]);
    arc(lx,ly,  lx*0.36, 82,          0, 124,  0.26, [[0.30,0.38],[0.72,0.78]]);

    arc(rx,ry,  rx+rw*0.58, ry,       W,  36,  0.30, [[0.28,0.08],[0.72,0.48]]);
    arc(rx,ry,  rx+rw*0.72,  6,     W-4,   0,  0.22, [[0.32,0.22],[0.70,0.68]]);
    arc(rx,ry,  rx+rw*0.64, 82,       W, 124,  0.26, [[0.30,0.42],[0.72,0.82]]);
  }

  /* Append INSIDE wrap so z-index is relative to the same stacking context
     as ::before (backdrop at z-index -1). intel-threads at z-index 1 paints
     above the backdrop but below circle items (z-index 3).
     position:fixed on the SVG still anchors it to the viewport, not wrap.  */
  wrap.appendChild(svg);

  /* Initial visibility sync (MutationObserver only fires on changes) */
  svg.classList.toggle('open', wrap.classList.contains('open'));

  /* Sync SVG visibility with dome open/closed */
  new MutationObserver(function() {
    svg.classList.toggle('open', wrap.classList.contains('open'));
  }).observe(wrap, { attributes: true, attributeFilter: ['class'] });

  /* Rebuild on resize */
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { buildIntelThreads(wrap); }, 200);
  });
}

/* ── DOM ready ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  /* Active page highlight */
  var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var activeMap = {
    'about.html':       '.dn-p1',
    'awards.html':      '.dn-p2',
    'announcements.html': '.dn-p3',
    'resources.html':   '.dn-p4',
    'tournaments.html': '.dn-p5',
    'gallery.html':     '.dn-p6'
  };
  var sel = activeMap[page];
  if (sel) {
    var el = document.querySelector(sel);
    if (el) el.classList.add('active');
  }

  var wrap = document.getElementById('circ-wrap');
  if (!wrap) return;

  /* Close on outside click */
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) {
      setDomeState(wrap, false);
    }
  });

  /* Close when a nav link is clicked */
  wrap.addEventListener('click', function (e) {
    var item = e.target.closest('.dn-item');
    if (item && item.tagName === 'A') {
      setDomeState(wrap, false);
    }
  });

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setDomeState(wrap, false);
  });

  /* Intel-thread arcs disabled */
});
