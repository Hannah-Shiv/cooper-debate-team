// dome-nav.js — Hannah, Netre, Moorva — Cooper Middle School, McLean VA — TSA Nationals 2026
// Dome navigation (compact hamburger + ring + submenus) for all pages.
// Loaded after nav.js; overrides toggleMenu() to drive #circ-wrap instead of #radial-nav.

var _openSubKey = null;

function _closeSub(wrap) {
  if (!wrap) wrap = document.getElementById('circ-wrap');
  if (!wrap) return;
  if (_openSubKey) wrap.classList.remove(_openSubKey + '-open');
  wrap.classList.remove('sub-open');
  wrap.querySelectorAll('.dn-item.sub-active').forEach(function(el) {
    el.classList.remove('sub-active');
    el.setAttribute('aria-expanded', 'false');
  });
  _openSubKey = null;
}

function toggleSub(key, e) {
  if (e) e.stopPropagation();
  var wrap = document.getElementById('circ-wrap');
  if (!wrap) return;
  var isOpen = _openSubKey === key;
  _closeSub(wrap);
  if (!isOpen) {
    wrap.classList.add('sub-open', key + '-open');
    _openSubKey = key;
    var btn = e && e.currentTarget;
    if (btn) {
      btn.classList.add('sub-active');
      btn.setAttribute('aria-expanded', 'true');
    }
    _crumbSub();
  } else {
    _crumbOpen(); // sub closed but dome still open
  }
}

// Breadcrumb helper — shift the breadcrumb bar below the dome using inline style
// (inline style wins over any CSS rule regardless of specificity)
function _crumb() { return document.querySelector('.breadcrumb'); }
function _crumbOpen()  { var c = _crumb(); if (c) c.style.marginTop = '215px'; }
function _crumbSub()   { var c = _crumb(); if (c) c.style.marginTop = '270px'; }
function _crumbReset() { var c = _crumb(); if (c) c.style.marginTop = ''; }

function toggleMenu() {
  var wrap = document.getElementById('circ-wrap');
  var btn  = document.getElementById('circ-btn');
  if (!wrap) return;
  var opening = !wrap.classList.contains('open');
  wrap.classList.toggle('open', opening);
  if (btn) btn.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
  if (opening) { _crumbOpen(); } else { _closeSub(wrap); _crumbReset(); }
}

document.addEventListener('click', function(e) {
  var wrap = document.getElementById('circ-wrap');
  if (!wrap) return;
  // Close menu when a sub-item link is clicked
  if (e.target.closest('.dn-sub')) {
    wrap.classList.remove('open');
    _closeSub(wrap);
    _crumbReset();
    return;
  }
  // Close menu when clicking outside
  if (!wrap.contains(e.target)) {
    wrap.classList.remove('open');
    _closeSub(wrap);
    _crumbReset();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var wrap = document.getElementById('circ-wrap');
  if (wrap) {
    wrap.classList.remove('open');
    _closeSub(wrap);
    _crumbReset();
  }
});

// Intelligence threads — signal arcs radiating from left & right sides of the dome
// Dark backdrop + quad-bezier wires with glowing amber dots; fades in on dome open.
function buildIntelThreads(wrap) {
  var old = document.getElementById('intel-threads');
  if (old) old.remove();

  var W  = window.innerWidth;
  var H  = 130;
  var cx = W / 2;
  // Origins: left-centre and right-centre of the 72-px dome circle
  var lx = cx - 36, ly = 36;
  var rx = cx + 36, ry = 36;
  var ns = 'http://www.w3.org/2000/svg';

  var svg = document.createElementNS(ns, 'svg');
  svg.id = 'intel-threads';
  // viewBox sets the internal coordinate space; CSS width:100% stretches to viewport
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  // -- Dark backdrop rect --
  var bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', 'rgba(3,6,14,0.88)');
  svg.appendChild(bg);

  // -- Glow filter for dots --
  var defs = document.createElementNS(ns, 'defs');
  var filt = document.createElementNS(ns, 'filter');
  filt.id = 'thr-glow';
  filt.setAttribute('x', '-100%'); filt.setAttribute('y', '-100%');
  filt.setAttribute('width', '300%'); filt.setAttribute('height', '300%');
  var blur = document.createElementNS(ns, 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', '3.5');
  blur.setAttribute('result', 'blur');
  var merge = document.createElementNS(ns, 'feMerge');
  var mn1 = document.createElementNS(ns, 'feMergeNode'); mn1.setAttribute('in', 'blur');
  var mn2 = document.createElementNS(ns, 'feMergeNode'); mn2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mn1); merge.appendChild(mn2);
  filt.appendChild(blur); filt.appendChild(merge);
  defs.appendChild(filt);
  svg.appendChild(defs);

  // -- Helpers ------------─
  // Point on quadratic bezier at parameter t
  function qb(t, x0,y0, cpx,cpy, x1,y1) {
    var m = 1-t;
    return { x: m*m*x0 + 2*m*t*cpx + t*t*x1,
             y: m*m*y0 + 2*m*t*cpy + t*t*y1 };
  }

  // Draw arc + place glowing dots along it. dotTs = [[t, delay], ...]
  function arc(ox,oy, cpx,cpy, ex,ey, opacity, dotTs) {
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d','M '+ox+','+oy+' Q '+cpx+','+cpy+' '+ex+','+ey);
    p.setAttribute('stroke','rgba(212,175,55,'+opacity+')');
    p.setAttribute('stroke-width','1.1');
    p.setAttribute('fill','none');
    svg.appendChild(p);
    dotTs.forEach(function(td) {
      var pt = qb(td[0], ox,oy, cpx,cpy, ex,ey);
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', pt.x.toFixed(1));
      c.setAttribute('cy', pt.y.toFixed(1));
      c.setAttribute('r', '2.8');
      c.setAttribute('fill', 'rgba(255,185,45,0.9)');
      c.setAttribute('filter', 'url(#thr-glow)');
      c.classList.add('thr-dot');
      c.style.animationDelay = td[1].toFixed(2)+'s';
      svg.appendChild(c);
    });
  }

  // -- LEFT arcs (from dome left-centre, spreading left / up / down) ----─
  // Straight left to left edge mid
  arc(lx,ly, lx*0.42,ly,          0, 36,  0.30, [[0.28,0.00],[0.60,0.42],[0.88,0.80]]);
  // Sweeps up to top-left corner
  arc(lx,ly, lx*0.28, 6,          4,  0,  0.22, [[0.30,0.18],[0.65,0.62]]);
  // Sweeps down to bottom-left
  arc(lx,ly, lx*0.36,82,          0,124,  0.26, [[0.32,0.38],[0.68,0.78]]);
  // Arcs UP toward top, left of centre
  arc(lx,ly, cx*0.38, 4,   cx*0.20,  0,  0.18, [[0.40,0.52],[0.76,1.02]]);
  // Arcs to far lower-left corner
  arc(lx,ly, lx*0.18,96,          0,H,   0.14, [[0.50,1.18]]);
  // Gentle mid-sweep to left-centre-low
  arc(lx,ly, lx*0.50,56,          0, 72,  0.19, [[0.38,0.64]]);

  // -- RIGHT arcs (mirror of left) --
  var rw = W - rx; // space to the right of rx
  // Straight right to right edge mid
  arc(rx,ry, rx+rw*0.58,ry,        W, 36,  0.30, [[0.28,0.08],[0.60,0.48],[0.88,0.86]]);
  // Sweeps up to top-right corner
  arc(rx,ry, rx+rw*0.72, 6,      W-4,  0,  0.22, [[0.30,0.22],[0.65,0.68]]);
  // Sweeps down to bottom-right
  arc(rx,ry, rx+rw*0.64,82,        W,124,  0.26, [[0.32,0.42],[0.68,0.82]]);
  // Arcs UP toward top, right of centre
  arc(rx,ry, cx*1.62, 4,    cx*1.80,  0,  0.18, [[0.40,0.56],[0.76,1.06]]);
  // Arcs to far lower-right corner
  arc(rx,ry, rx+rw*0.82,96,        W,H,   0.14, [[0.50,1.22]]);
  // Gentle mid-sweep to right-centre-low
  arc(rx,ry, rx+rw*0.50,56,        W, 72,  0.19, [[0.38,0.68]]);

  document.body.appendChild(svg);

  // Sync visibility with dome open/close
  new MutationObserver(function() {
    svg.classList.toggle('open', wrap.classList.contains('open'));
  }).observe(wrap, { attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('DOMContentLoaded', function() {
  var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var activeMap = {
    'index.html':    '.dn-p1',
    '':              '.dn-p1',
    'before.html':   '.dn-p2',
    'arrival.html':  '.dn-p2',
    'timeline.html': '.dn-p2',
    'research.html': '.dn-p3',
    'challenge.html':'.dn-p3',
    'impact.html':   '.dn-p4',
    'process.html':  '.dn-p5',
    'reference.html':'.dn-p6',
  };
  var sel = activeMap[page] || '.dn-p1';
  var el = document.querySelector(sel);
  if (el) el.classList.add('active');

  var wrap = document.getElementById('circ-wrap');
  if (wrap) buildIntelThreads(wrap);
});
