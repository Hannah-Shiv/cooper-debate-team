/* ============================================================
   COOPER DEBATE TEAM — members-nav.js  v1
   Member-portal version of the dome navigation.
   Injects #circ-wrap into #dome-nav-root on all member pages.
   Set window.__NAV_PAGE before loading this script:
     "portal"    → members.html
     "calendar"  → members-calendar.html
     "directory" → members-directory.html  (future)
     "stats"     → members-stats.html      (future)
   ============================================================ */

(function () {
  'use strict';

  var PAGE = window.__NAV_PAGE || '';

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
      cls: 'dn-p1', href: 'members.html', label: 'Portal',
      active: PAGE === 'portal',
      /* shield — protected members area */
      icon: '<path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>'
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
      cls: 'dn-p5', href: 'index.html', label: 'Home',
      active: false,
      /* house */
      icon: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/>'
    },
    {
      cls: 'dn-p6', href: '#', label: 'Sign Out',
      active: false, signout: true,
      /* log-out arrow */
      icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
    }
  ];

  /* ── Build & inject ────────────────────────────────────── */
  function buildNav() {
    var root = document.getElementById('dome-nav-root');
    if (!root) return;

    var itemsHtml = ITEMS.map(function (it) {
      var cls     = 'dn-item ' + it.cls + (it.active ? ' active' : '');
      var onclick = it.signout ? ' onclick="memberSignOut();return false;"' : '';
      return (
        '<a class="' + cls + '" href="' + it.href + '"' + onclick + '>' +
          '<svg class="dn-icon" viewBox="0 0 24 24">' + it.icon + '</svg>' +
          '<span>' + it.label + '</span>' +
        '</a>'
      );
    }).join('\n  ');

    root.innerHTML =
      '<div id="circ-wrap">\n' +
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

  /* Run before dome-nav.js's DOMContentLoaded so #circ-wrap exists when it fires */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }

})();
