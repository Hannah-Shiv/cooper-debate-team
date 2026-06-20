/* ============================================================
   COOPER DEBATE TEAM — dome-nav.js
   Dome navigation adapted from Langley Legacy TSA 2026
   by Hannah Shiv, Netre, and Moorva — Cooper Middle School
   ============================================================ */

/* ── Global toggle (called from onclick="toggleMenu()") ───── */
window.toggleMenu = function () {
  var wrap = document.getElementById('circ-wrap');
  var btn  = document.getElementById('circ-btn');
  if (!wrap) return;
  var opening = !wrap.classList.contains('open');
  wrap.classList.toggle('open', opening);
  if (btn) btn.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
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

  /* Dark backdrop rect */
  var bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', 'rgba(3,6,14,0.88)');
  svg.appendChild(bg);

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

    dotTs.forEach(function(td) {
      var pt  = qb(td[0], ox,oy, cpx,cpy, ex,ey);
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pt.x.toFixed(1));
      dot.setAttribute('cy', pt.y.toFixed(1));
      dot.setAttribute('r',  '3.4');
      dot.setAttribute('fill',   'rgba(255,225,80,1.0)');
      dot.setAttribute('filter', 'url(#thr-glow)');
      dot.classList.add('thr-dot');
      dot.style.animationDelay = td[1].toFixed(2) + 's';
      svg.appendChild(dot);
    });
  }

  var isMobile = W < 640;
  var rw = W - rx;

  if (isMobile) {
    /* Mobile — 3 arcs per side, 1 dot each (less congested) */
    arc(lx,ly,  lx*0.40, ly,          0,  36,  0.32, [[0.50,0.00]]);
    arc(lx,ly,  lx*0.34, 72,          0, 110,  0.28, [[0.48,0.35]]);
    arc(lx,ly,  lx*0.48, 48,          0,  66,  0.22, [[0.45,0.70]]);

    arc(rx,ry,  rx+rw*0.60, ry,       W,  36,  0.32, [[0.50,0.10]]);
    arc(rx,ry,  rx+rw*0.66, 72,       W, 110,  0.28, [[0.48,0.45]]);
    arc(rx,ry,  rx+rw*0.52, 48,       W,  66,  0.22, [[0.45,0.80]]);
  } else {
    /* Desktop — 6 arcs per side, 2–3 dots each */
    arc(lx,ly,  lx*0.42, ly,          0,  36,  0.30, [[0.28,0.00],[0.60,0.42],[0.88,0.80]]);
    arc(lx,ly,  lx*0.28,  6,          4,   0,  0.22, [[0.30,0.18],[0.65,0.62]]);
    arc(lx,ly,  lx*0.36, 82,          0, 124,  0.26, [[0.32,0.38],[0.68,0.78]]);
    arc(lx,ly,  cx*0.38,  4,   cx*0.20,  0,  0.18, [[0.40,0.52],[0.76,1.02]]);
    arc(lx,ly,  lx*0.18, 96,          0,   H,  0.14, [[0.50,1.18]]);
    arc(lx,ly,  lx*0.50, 56,          0,  72,  0.19, [[0.38,0.64]]);

    arc(rx,ry,  rx+rw*0.58, ry,       W,  36,  0.30, [[0.28,0.08],[0.60,0.48],[0.88,0.86]]);
    arc(rx,ry,  rx+rw*0.72,  6,     W-4,   0,  0.22, [[0.30,0.22],[0.65,0.68]]);
    arc(rx,ry,  rx+rw*0.64, 82,       W, 124,  0.26, [[0.32,0.42],[0.68,0.82]]);
    arc(rx,ry,  cx*1.62,     4,  cx*1.80,  0,  0.18, [[0.40,0.56],[0.76,1.06]]);
    arc(rx,ry,  rx+rw*0.82, 96,       W,   H,  0.14, [[0.50,1.22]]);
    arc(rx,ry,  rx+rw*0.50, 56,       W,  72,  0.19, [[0.38,0.68]]);
  }

  document.body.appendChild(svg);

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
    'tournaments.html': '.dn-p3',
    'resources.html':   '.dn-p4',
    'gallery.html':     '.dn-p5',
    'members.html':     '.dn-p6'
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
      wrap.classList.remove('open');
    }
  });

  /* Close when a nav link is clicked */
  wrap.addEventListener('click', function (e) {
    var item = e.target.closest('.dn-item');
    if (item && item.tagName === 'A') {
      wrap.classList.remove('open');
    }
  });

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') wrap.classList.remove('open');
  });

  /* Build the dynamic intel-thread arcs */
  buildIntelThreads(wrap);
});
