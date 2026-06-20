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

  /* ── STAR FIELD ────────────────────────────────────────── */
  function makeStar(cx, cy, r) {
    var d = r;
    var s = r * 0.32;
    return [
      '<g class="dn-sparkle">',
      '  <circle cx="'+cx+'" cy="'+cy+'" r="'+s+'" fill="#FAE07C"/>',
      '  <line x1="'+(cx-d)+'" y1="'+cy+'" x2="'+(cx+d)+'" y2="'+cy+'"',
      '        stroke="#E8A828" stroke-width="0.9" opacity="0.75"/>',
      '  <line x1="'+cx+'" y1="'+(cy-d)+'" x2="'+cx+'" y2="'+(cy+d)+'"',
      '        stroke="#E8A828" stroke-width="0.9" opacity="0.75"/>',
      '  <line x1="'+(cx-d*0.65)+'" y1="'+(cy-d*0.65)+'" x2="'+(cx+d*0.65)+'" y2="'+(cy+d*0.65)+'"',
      '        stroke="#E8A828" stroke-width="0.55" opacity="0.45"/>',
      '  <line x1="'+(cx+d*0.65)+'" y1="'+(cy-d*0.65)+'" x2="'+(cx-d*0.65)+'" y2="'+(cy+d*0.65)+'"',
      '        stroke="#E8A828" stroke-width="0.55" opacity="0.45"/>',
      '</g>'
    ].join('\n');
  }

  /* Stars: [cx-percent-of-width, cy-px, radius] */
  var leftStars  = [[5,38,5],[10,90,3],[16,30,4],[22,115,3],[28,65,3.5],[35,42,2.5],[38,130,2.5]];
  var rightStars = [[95,38,5],[90,90,3],[84,30,4],[78,115,3],[72,65,3.5],[65,42,2.5],[62,130,2.5]];

  var vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  var svgParts = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+vw+' 200"',
    '     style="width:100%;height:200px;" preserveAspectRatio="none"',
    '     aria-hidden="true">'
  ];

  leftStars.forEach(function(s)  { svgParts.push(makeStar(s[0]/100*vw, s[1], s[2])); });
  rightStars.forEach(function(s) { svgParts.push(makeStar(s[0]/100*vw, s[1], s[2])); });
  svgParts.push('</svg>');

  var field = document.createElement('div');
  field.id = 'dn-star-field';
  field.innerHTML = svgParts.join('\n');
  document.body.appendChild(field);

})();
