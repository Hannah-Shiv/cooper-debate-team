/* ============================================================
   COOPER DEBATE TEAM — dome-nav.js
   Adapted from Langley Legacy TSA 2026 (Hannah Shiv, Netre, Moorva)
   ============================================================ */

(function () {
  'use strict';

  const wrap    = document.getElementById('circ-wrap');
  const btn     = document.getElementById('circ-btn');
  const threads = document.getElementById('intel-threads');

  if (!wrap || !btn) return;

  /* Active page highlighting --------------------------------- */
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.dn-item').forEach(function (el) {
    const href = (el.getAttribute('href') || '').split('/').pop();
    if (href && href === page) el.classList.add('active');
  });

  /* Toggle menu open/close ----------------------------------- */
  let menuOpen = false;

  function openMenu() {
    menuOpen = true;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (threads) threads.classList.add('open');
    document.addEventListener('click', handleOutsideClick, true);
  }

  function closeMenu() {
    menuOpen = false;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (threads) threads.classList.remove('open');
    document.removeEventListener('click', handleOutsideClick, true);
  }

  window.toggleMenu = function () {
    if (menuOpen) { closeMenu(); } else { openMenu(); }
  };

  /* Close when a nav item is clicked ------------------------- */
  wrap.addEventListener('click', function (e) {
    const item = e.target.closest('.dn-item');
    if (item && item.tagName === 'A') closeMenu();
  });

  /* Close on outside click ----------------------------------- */
  function handleOutsideClick(e) {
    if (!wrap.contains(e.target)) closeMenu();
  }

  /* Close on Escape ------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  /* ── THREAD BULBS ──────────────────────────────────────────
     Inject glowing gold bulbs along the radial lines that fan
     out from the center nav button (intel-threads SVG).
     The SVG uses viewBox "0 0 1200 140"; center is (600,40).
  ────────────────────────────────────────────────────────── */
  if (!threads) return;

  var NS = 'http://www.w3.org/2000/svg';
  var cx0 = 600, cy0 = 40;

  /* Endpoints must match the <line> elements in each page's
     intel-threads SVG (order doesn't matter for effect)      */
  var lines = [
    { x: 80,   y: 130 },
    { x: 240,  y: 140 },
    { x: 380,  y: 140 },
    { x: 760,  y: 140 },
    { x: 920,  y: 130 },
    { x: 1100, y: 110 }
  ];

  /* t-values along each line: 3 bulbs per ray               */
  var tSteps = [0.28, 0.54, 0.80];
  /* Bulb radius decreases toward the tip                     */
  var radii  = [2.8, 2.2, 1.6];

  lines.forEach(function (ep, li) {
    tSteps.forEach(function (t, bi) {
      var bx = (cx0 + t * (ep.x - cx0)).toFixed(1);
      var by = (cy0 + t * (ep.y - cy0)).toFixed(1);
      var c  = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', bx);
      c.setAttribute('cy', by);
      c.setAttribute('r',  radii[bi]);
      c.setAttribute('fill', '#FFD700');
      c.setAttribute('class', 'thr-bulb');
      /* Stagger animation so bulbs pulse like travelling light */
      c.style.animationDelay = ((li * 0.15) + (bi * 0.32)) + 's';
      threads.appendChild(c);
    });
  });

  /* Also brighten the existing endpoint dots                 */
  threads.querySelectorAll('.thr-dot').forEach(function (dot) {
    dot.setAttribute('fill', '#FFD700');
    dot.setAttribute('opacity', '0.9');
    dot.setAttribute('r', parseFloat(dot.getAttribute('r') || 2) + 0.5);
  });

})();
