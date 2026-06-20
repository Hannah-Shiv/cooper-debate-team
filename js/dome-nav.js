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
    if (item && item.tagName === 'A') {
      closeMenu();
    }
  });

  /* Close on outside click ----------------------------------- */
  function handleOutsideClick(e) {
    if (!wrap.contains(e.target)) closeMenu();
  }

  /* Close on Escape ------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

})();
