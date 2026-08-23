/* ============================================================
   COOPER DEBATE TEAM — members-nav.js  v8
   Member-portal version of the dome navigation.
   Injects #circ-wrap into #dome-nav-root on all member pages.
   Set window.__NAV_PAGE before loading this script:
     "portal"    → members.html
     "calendar"  → members-calendar.html
     "directory" → members-directory.html
     "stats"      → members-stats.html
      "volunteers" → members-volunteers.html
      "applications" → members-applications.html
   ============================================================ */

(function () {
  'use strict';

  var PAGE = window.__NAV_PAGE || '';
  var includeCoachNav = false;

  /* ── Sign-out (exposed globally so onclick can call it) ── */
  window.memberSignOut = function () {
    try {
      firebase.auth().signOut()
        .then(function ()  { window.location.href = 'index.html'; })
        .catch(function () { window.location.href = 'index.html'; });
    } catch (e) {
      window.location.href = 'index.html';
    }
  };

  /* ── Nav items ─────────────────────────────────────────── */
  var ITEMS = [
    {
      cls: 'dn-p1', href: 'members-resources.html', label: 'Resources',
      active: PAGE === 'portal',
      /* open book */
      icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 19.5V5a2 2 0 0 1 2-2h14v17H6.5A2.5 2.5 0 0 1 4 19.5z"/>'
    },
    {
      cls: 'dn-p2', href: 'members-calendar.html', label: 'Calendar',
      active: PAGE === 'calendar',
      /* calendar grid */
      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
    },
    {
      cls: 'dn-p3', href: 'members-directory.html', label: 'Directory',
      active: PAGE === 'directory',
      /* two people */
      icon: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2"/><circle cx="17" cy="7" r="2.5"/><path d="M21 21v-1.5a4 4 0 0 0-5-3.86"/>'
    },
    {
      cls: 'dn-p4', href: 'members-stats.html', label: 'Stats',
      active: PAGE === 'stats',
      /* bar chart */
      icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
    },
    {
      cls: 'dn-p5', href: 'members-blog.html', label: 'Blog',
      active: PAGE === 'blog',
      /* document with lines */
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'
    },
    {
      cls: 'dn-p6', href: 'members-volunteers.html', label: 'Volunteer',
      active: PAGE === 'volunteers',
      /* helping hands */
      icon: '<path d="M8 11V5a2 2 0 0 1 4 0v5"/><path d="M12 10V4a2 2 0 0 1 4 0v7"/><path d="M16 10V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4 13.2a2 2 0 0 1 3.1-2.5L9 13"/>'
    },
    {
      cls: 'dn-p7', href: 'members-applications.html', label: 'Applications',
      active: PAGE === 'applications', coachOnly: true,
      /* clipboard / application */
      icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 9h7M8.5 13h7M8.5 17h4"/><path d="M7.2 9.1l.8.8 1.3-1.6"/>'
    }
  ];

  /* ── Build & inject ────────────────────────────────────── */
  function buildNav() {
    var root = document.getElementById('dome-nav-root');
    if (!root) return;

    var visibleItems = ITEMS.filter(function (it) {
      return !it.coachOnly || includeCoachNav;
    });
    var itemsHtml = visibleItems.map(function (it, index) {
      var position = includeCoachNav ? 'dn-p' + (index + 1) : it.cls;
      var cls = 'dn-item ' + position + (it.active ? ' active' : '');
      return (
        '<a class="' + cls + '" href="' + it.href + '">' +
          '<svg class="dn-icon" viewBox="0 0 24 24">' + it.icon + '</svg>' +
          '<span>' + it.label + '</span>' +
        '</a>'
      );
    }).join('\n  ');

    root.innerHTML =
      '<div id="circ-wrap" class="member-dome' + (includeCoachNav ? ' coach-dome' : '') + '">\n' +
      '  <button id="circ-btn" onclick="toggleMenu()" aria-label="Open navigation" aria-expanded="false">\n' +
      '    <span class="dn-hamburger" aria-hidden="true" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;pointer-events:none;transition:transform 0.3s ease;">\n' +
      '      <span style="display:block;width:22px;height:2.5px;background:#fff;border-radius:1.5px;"></span>\n' +
      '      <span style="display:block;width:22px;height:2.5px;background:#fff;border-radius:1.5px;"></span>\n' +
      '      <span style="display:block;width:22px;height:2.5px;background:#fff;border-radius:1.5px;"></span>\n' +
      '    </span>\n' +
      '  </button>\n' +
      '  ' + itemsHtml + '\n' +
      '</div>';
  }

  // The application route is not placed in the initial DOM. Firebase Auth is
  // used here only to decide what navigation to show; the applications page and
  // its server endpoint independently verify coach access before showing data or
  // saving a decision.
  function updateCoachNavigation(user) {
    var nextValue = !!(user && typeof getAdminRole === 'function' && getAdminRole(user.email) === 'coach');
    if (nextValue !== includeCoachNav) {
      includeCoachNav = nextValue;
      buildNav();
    }
  }

  /* Run before dome-nav.js's DOMContentLoaded so #circ-wrap exists when it fires */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(updateCoachNavigation);
  }

})();
