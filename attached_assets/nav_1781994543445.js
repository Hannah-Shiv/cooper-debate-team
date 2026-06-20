//
// nav.js — Hannah, Netre, Moorva — Cooper Middle School, McLean VA — TSA Nationals 2026
//
// UPGRADED to match the full design mockup:
//   - Pulsing rings invite click on the hamburger button
//   - Hub blooms in the center with its own rings
//   - 6 main items orbit at R=210px, blooming outward with stagger
//   - Clicking an item sweeps a red arc from hub to that item
//   - "The Story" expands 3 sub-circles; other items dim
//   - Clicking a sub-circle slides in a content-preview panel on the right
//   - Hub click (when story open) collapses sub-menu back
//   - Back to normal nav if you click hub again
//
// Page map:
//   index.html   → Home (rn-i1)
//   before.html  → The Story (rn-i2) + Before CIA sub (rn-s1)
//   arrival.html → The Story (rn-i2) + CIA Arrives sub (rn-s2)
//   timeline.html→ The Story (rn-i2) + Timeline sub (rn-s3)
//   research.html→ Research (rn-i3)
//   impact.html  → Impact (rn-i4)
//   process.html → Process (rn-i5)
//   reference.html→ Refs (rn-i6)
//

var _storyOpen = false;

// Content-preview data for each sub-item
// Hannah: we wrote these blurbs ourselves to match what's on the pages!!
var _previewData = {
  's1': {
    tag: 'Story',
    title: 'Before the CIA',
    body: 'Rolling farms, country estates, and a quiet railroad town — McLean before Langley changed everything.',
    img: 'images/old_mclean_virginia_01.jpg',
    href: 'before.html'
  },
  's2': {
    tag: 'Story',
    title: 'The CIA Arrives',
    body: 'A classified directive, a chosen plot of farmland, and the construction that transformed a community overnight.',
    img: 'images/cia-construction-01.jpg',
    href: 'arrival.html'
  },
  's3': {
    tag: 'Timeline',
    title: 'Key Moments',
    body: 'From Eisenhower\'s 1955 directive to today — major events that shaped Langley and McLean, decade by decade.',
    img: 'images/Eisenhower-signing-1955.jpg',
    href: 'timeline.html'
  }
};

/* -- Open / Close the overlay -------------------------- */
function toggleMenu() {
  var nav = document.getElementById('radial-nav');
  var btn = document.getElementById('circ-btn');
  if (!nav) return;

  var opening = !nav.classList.contains('open');
  nav.classList.toggle('open', opening);
  if (btn) btn.classList.toggle('open', opening);
  document.body.style.overflow = opening ? 'hidden' : '';

  if (!opening) {
    _closeStory(true);
    _hidePreview();
    _clearArc();
  } else {
    // Draw the arc to the active item when opening
    _drawArcToActive();
  }
}

/* -- Story submenu toggle ---- */
// Netre: clicking The Story reveals the 3 sub-circles. Hub click collapses.
function _openStory() {
  _storyOpen = true;
  var nav = document.getElementById('radial-nav');
  if (nav) nav.classList.add('story-open');
  _drawArc('rn-i2');
}
function _closeStory() {
  _storyOpen = false;
  var nav = document.getElementById('radial-nav');
  if (nav) nav.classList.remove('story-open');
  _hidePreview();
  _drawArcToActive();
}

/* -- Arc sweep ----------── */
// Netre: draws a red arc from the hub centre to the target item's centre.
// Uses an SVG path element injected into #rn-arc-svg.

// Item centre positions (viewport-relative, relative to 50vw/50vh):
// R=210, angles in standard math (cos/sin):
//   i1  90°: (0, -210)
//   i2 150°: (-182, -105)
//   i3 210°: (-182,  105)
//   i4 270°: (0,    210)
//   i5 330°: (182,  105)
//   i6  30°: (182, -105)
var _arcOffsets = {
  'rn-i1': [0,    -210],
  'rn-i2': [-182, -105],
  'rn-i3': [-182,  105],
  'rn-i4': [0,     210],
  'rn-i5': [182,   105],
  'rn-i6': [182,  -105],
};

function _drawArc(itemCls) {
  var svg  = document.getElementById('rn-arc-svg');
  var path = document.getElementById('rn-arc-path');
  if (!svg || !path) return;

  var off = _arcOffsets[itemCls];
  if (!off) { _clearArc(); return; }

  var cx = window.innerWidth  / 2;
  var cy = window.innerHeight / 2;
  var tx = cx + off[0];
  var ty = cy + off[1];

  // Control point: midpoint pushed slightly inward toward hub
  var mx = cx + off[0] * 0.45;
  var my = cy + off[1] * 0.45;

  var d = 'M ' + cx + ' ' + cy + ' Q ' + mx + ' ' + my + ' ' + tx + ' ' + ty;
  path.setAttribute('d', d);

  // Animate dash
  var len = Math.sqrt(off[0]*off[0] + off[1]*off[1]);
  path.style.strokeDasharray  = len;
  path.style.strokeDashoffset = len;
  // Force reflow then animate
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 0.38s ease, opacity 0.20s ease';
  path.style.strokeDashoffset = '0';
  path.style.opacity = '0.80';
}

function _clearArc() {
  var path = document.getElementById('rn-arc-path');
  if (path) { path.style.opacity = '0'; }
}

function _drawArcToActive() {
  // Find which item has .active
  var activeItem = document.querySelector('#radial-nav .rn-item.active');
  if (!activeItem) { _clearArc(); return; }
  var cls = Array.from(activeItem.classList).find(function(c){ return _arcOffsets[c]; });
  if (cls) _drawArc(cls);
  else _clearArc();
}

/* -- Content-preview panel --── */
// Moorva: clicking a sub-circle slides in a mini preview on the right side!!
function _showPreview(key) {
  var panel = document.getElementById('rn-preview');
  if (!panel) return;
  var data = _previewData[key];
  if (!data) return;

  panel.querySelector('.rn-preview-tag').textContent   = data.tag;
  panel.querySelector('.rn-preview-title').textContent = data.title;
  panel.querySelector('.rn-preview-body').textContent  = data.body;
  var img  = panel.querySelector('.rn-preview-img');
  var link = panel.querySelector('.rn-preview-link');
  if (img)  img.src  = data.img;
  if (link) link.href = data.href;

  panel.classList.add('visible');
}
function _hidePreview() {
  var panel = document.getElementById('rn-preview');
  if (panel) panel.classList.remove('visible');
}

/* -- Wire up after DOM loads -- */
document.addEventListener('DOMContentLoaded', function () {

  /* Active page highlight */
  var page  = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var activeMap = {
    'index.html':    '.rn-i1',
    '':              '.rn-i1',
    'before.html':   '.rn-i2',
    'arrival.html':  '.rn-i2',
    'timeline.html': '.rn-i2',
    'research.html': '.rn-i3',
    'challenge.html':'.rn-i3',
    'impact.html':   '.rn-i4',
    'process.html':  '.rn-i5',
    'reference.html':'.rn-i6',
  };
  var activeSel = activeMap[page] || '.rn-i1';
  var activeEl  = document.querySelector(activeSel);
  if (activeEl) activeEl.classList.add('active');

  // Sub-page active sub-item
  // Moorva: if we ARE on a Story sub-page, mark the current sub-item active too!!
  var subMap = {
    'before.html':   '.rn-s1',
    'arrival.html':  '.rn-s2',
    'timeline.html': '.rn-s3',
  };
  if (subMap[page]) {
    var subEl = document.querySelector(subMap[page]);
    if (subEl) subEl.classList.add('active');
  }

  /* Story button */
  var storyBtn = document.getElementById('rn-story-btn');
  if (storyBtn) {
    storyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_storyOpen) _closeStory();
      else _openStory();
    });
  }

  /* Hub click — when story is open, collapse back; otherwise close menu */
  var hub = document.querySelector('.rn-hub');
  if (hub) {
    hub.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_storyOpen) { _closeStory(); }
      else { toggleMenu(); }
    });
  }

  /* Sub-item clicks → show preview panel, draw arc */
  var subKeys = { 'rn-s1': 's1', 'rn-s2': 's2', 'rn-s3': 's3' };
  Object.keys(subKeys).forEach(function(cls) {
    var el = document.querySelector('.' + cls);
    if (!el) return;
    el.addEventListener('click', function (e) {
      // Only intercept if not navigating (i.e., click shows preview first)
      // Hannah: on desktop show the preview; on mobile navigate straight through
      if (window.innerWidth > 700) {
        e.preventDefault();
        _showPreview(subKeys[cls]);
        // Draw arc to the story item (i2) to show the connection
        _drawArc('rn-i2');
      }
      // On mobile fall through to normal navigation
    });
  });

  /* Other main items: collapse story + hide preview when clicked */
  document.querySelectorAll('.rn-item:not(.rn-has-sub)').forEach(function (el) {
    el.addEventListener('click', function () {
      if (_storyOpen) _closeStory();
      _hidePreview();
    });
  });

  /* Click on dark backdrop (the nav div itself) = close */
  var nav = document.getElementById('radial-nav');
  if (nav) {
    nav.addEventListener('click', function (e) {
      if (e.target === nav) toggleMenu();
    });
  }

  /* Escape key closes */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var navEl = document.getElementById('radial-nav');
    if (navEl && navEl.classList.contains('open')) toggleMenu();
  });

  /* Back-to-top */
  var topBtn = document.getElementById('back-to-top');
  if (topBtn) {
    window.addEventListener('scroll', function () {
      topBtn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });
    topBtn.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* Redraw arc on resize */
  window.addEventListener('resize', function () {
    var rn = document.getElementById('radial-nav');
    if (rn && rn.classList.contains('open')) {
      _drawArcToActive();
    }
  }, { passive: true });
});

//
// DONE!! nav.js upgraded to match the full design mockup.
// Hannah Netre Moorva — Team 4101 — TSA Nationals 2026 — GO TEAM!!
//
