/* ============================================================
   COOPER DEBATE TEAM — main.js
   Animations, counters, countdown, interactions
   ============================================================ */

(function () {
  'use strict';

  /* === INTERSECTION OBSERVER — fade-up animations === */
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll('.fade-up, .fade-in').forEach(function (el) {
    observer.observe(el);
  });

  /* === ANIMATED STAT COUNTERS === */
  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = 1800;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const counterObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  document.querySelectorAll('[data-target]').forEach(function (el) {
    counterObserver.observe(el);
  });

  /* === TOURNAMENT COUNTDOWN === */
  function updateCountdown() {
    const target = document.getElementById('countdown-target');
    if (!target) return;

    const targetDate = new Date(target.getAttribute('data-date'));
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      ['days', 'hours', 'mins', 'secs'].forEach(function (unit) {
        const el = document.getElementById('cd-' + unit);
        if (el) el.textContent = '00';
      });
      return;
    }

    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs  = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = n => String(n).padStart(2, '0');

    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');

    if (dEl) dEl.textContent = pad(days);
    if (hEl) hEl.textContent = pad(hours);
    if (mEl) mEl.textContent = pad(mins);
    if (sEl) sEl.textContent = pad(secs);
  }

  if (document.getElementById('countdown-target')) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  /* === SMOOTH SCROLL for anchor links === */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* === STAGGER child animations === */
  document.querySelectorAll('.stagger').forEach(function (container) {
    Array.from(container.children).forEach(function (child, i) {
      child.style.setProperty('--i', i);
    });
  });

  /* === MOBILE MENU: push content down when dome opens === */
  const circWrap = document.getElementById('circ-wrap');
  if (circWrap) {
    const mo = new MutationObserver(function () {
      const isOpen    = circWrap.classList.contains('open');
      const isSubOpen = circWrap.classList.contains('sub-open');
      document.body.classList.toggle('dome-open',     isOpen && !isSubOpen);
      document.body.classList.toggle('dome-sub-open', isSubOpen);
    });
    mo.observe(circWrap, { attributes: true, attributeFilter: ['class'] });
  }

  /* === GALLERY lightbox placeholder === */
  document.querySelectorAll('.gallery-item').forEach(function (item) {
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') item.click();
    });
  });

  /* === BLOG search filter === */
  const blogSearch = document.getElementById('blog-search');
  if (blogSearch) {
    blogSearch.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      document.querySelectorAll('.blog-card').forEach(function (card) {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

})();
