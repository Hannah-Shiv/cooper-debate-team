/* ============================================================
   COOPER DEBATE TEAM — dome-nav.js
   Adapted from Langley Legacy TSA 2026 (Hannah Shiv, Netre, Moorva)
   ============================================================ */

(function () {
  'use strict';

  const wrap     = document.getElementById('circ-wrap');
  const btn      = document.getElementById('circ-btn');
  const threads  = document.getElementById('intel-threads');

  if (!wrap || !btn) return;

  /* Active page highlighting --------------------------------- */
  const page = location.pathname.split('/').pop() || 'index.html';
  const pageMap = {
    'index.html':       'home',
    '':                 'home',
    'about.html':       'about',
    'awards.html':      'awards',
    'tournaments.html': 'tourn',
    'resources.html':   'res',
    'gallery.html':     'gallery',
    'blog.html':        'blog',
    'members.html':     'members',
  };
  const activePage = pageMap[page];

  /* Mark the active main circle */
  if (activePage && activePage !== 'home') {
    const activeBtn = document.querySelector(`.dn-item[data-section="${activePage}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }

  /* Toggle menu open/close ----------------------------------- */
  let menuOpen = false;
  let activeSub = null;

  function openMenu() {
    menuOpen = true;
    wrap.classList.add('open');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (threads) threads.classList.add('open');
    document.addEventListener('click', handleOutsideClick, true);
  }

  function closeMenu() {
    menuOpen = false;
    activeSub = null;
    wrap.className = wrap.className
      .replace(/\b\w+-open\b/g, '')
      .replace('open', '')
      .replace('sub-open', '')
      .trim();
    wrap.classList.remove('open', 'sub-open');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (threads) threads.classList.remove('open');

    /* Remove sub-active from all circles */
    document.querySelectorAll('.dn-item').forEach(el => el.classList.remove('sub-active'));
    document.removeEventListener('click', handleOutsideClick, true);
  }

  window.toggleMenu = function () {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  /* Toggle sub-menu ------------------------------------------ */
  window.toggleSub = function (section, event) {
    if (event) event.stopPropagation();

    if (!menuOpen) {
      openMenu();
    }

    if (activeSub === section) {
      /* Close sub-menu, stay in main menu */
      closeSub();
      return;
    }

    closeSub(false);
    activeSub = section;

    /* Add section class so CSS shows correct pills + connector */
    wrap.classList.add('sub-open', section + '-open');

    /* Mark the clicked circle as sub-active */
    document.querySelectorAll('.dn-item').forEach(el => el.classList.remove('sub-active'));
    const clicked = document.querySelector(`.dn-item[data-section="${section}"]`);
    if (clicked) clicked.classList.add('sub-active');
  };

  function closeSub(removeSubOpen = true) {
    if (activeSub) {
      wrap.classList.remove(activeSub + '-open');
    }
    activeSub = null;
    if (removeSubOpen) wrap.classList.remove('sub-open');
    document.querySelectorAll('.dn-item').forEach(el => el.classList.remove('sub-active'));
  }

  /* Close on outside click ----------------------------------- */
  function handleOutsideClick(e) {
    if (!wrap.contains(e.target)) {
      closeMenu();
    }
  }

  /* Close on Escape ------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  /* Announcement bar close ----------------------------------- */
  const annClose = document.querySelector('.announcement-close');
  const annBar   = document.querySelector('.announcement-bar');
  if (annClose && annBar) {
    annClose.addEventListener('click', function () {
      annBar.style.transition = 'max-height 0.4s ease, opacity 0.4s ease, padding 0.4s ease';
      annBar.style.maxHeight = '0';
      annBar.style.opacity = '0';
      annBar.style.padding = '0';
      setTimeout(() => annBar.remove(), 400);
    });
  }

})();
