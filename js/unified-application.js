(function () {
  'use strict';

  var switcher = document.querySelector('.application-workspace-switcher');
  if (!switcher) return;

  var buttons = Array.from(switcher.querySelectorAll('[data-application-section]'));
  var panels = {
    team: document.getElementById('team-application-panel'),
    'debate-prep': document.getElementById('debate-prep-panel')
  };
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var currentSection = 'team';
  var prepLoadPromise = null;

  function sectionFromLocation() {
    var params = new URLSearchParams(window.location.search);
    return params.get('section') === 'debate-prep' || window.location.hash === '#debate-prep'
      ? 'debate-prep'
      : 'team';
  }

  function sectionUrl(section) {
    var url = new URL(window.location.href);
    url.hash = '';
    if (section === 'debate-prep') {
      url.searchParams.set('section', 'debate-prep');
    } else {
      url.searchParams.delete('section');
    }
    return url.pathname + url.search;
  }

  function updateControls(section) {
    buttons.forEach(function (button) {
      var selected = button.dataset.applicationSection === section;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.querySelector('.entry-link').textContent =
        button.dataset.applicationSection === 'team'
          ? 'Continue to application →'
          : 'Open prep studio →';
    });
  }

  function sectionEntryHeading(section) {
    var sectionHeading = section === 'team'
      ? document.getElementById('application-progress-title')
      : document.querySelector('#debate-prep-panel .studio-mast h1');
    return sectionHeading;
  }

  function scrollSectionEntry(section) {
    var scrollTarget = sectionEntryHeading(section);
    if (!scrollTarget) {
      scrollTarget = section === 'team'
        ? document.getElementById('first-name')
        : document.getElementById('prepGateName');
    }
    if (!scrollTarget) return;

    scrollTarget.scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'center'
    });
  }

  function focusSectionEntry(section) {
    var target = section === 'team'
      ? document.getElementById('first-name')
      : document.getElementById('prepGateName');
    if (!target) return;

    scrollSectionEntry(section);
    target.focus({ preventScroll: true });
  }

  function loadDebatePrep() {
    if (prepLoadPromise) return prepLoadPromise;

    var panel = panels['debate-prep'];
    prepLoadPromise = fetch('debate-prep.html?v=14', { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('The Debate Prep Studio could not be loaded.');
        return response.text();
      })
      .then(function (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        var sourceStyle = parsed.querySelector('style');
        var studio = parsed.querySelector('.studio-shell');
        var preview = parsed.getElementById('previewPanel');
        if (!sourceStyle || !studio || !preview) {
          throw new Error('The Debate Prep Studio is missing required content.');
        }

        var style = document.createElement('style');
        style.id = 'debate-prep-embedded-styles';
        style.textContent = sourceStyle.textContent;
        var unifiedStyles = document.getElementById('unified-application-styles');
        document.head.insertBefore(style, unifiedStyles || null);

        panel.replaceChildren(studio, preview);

        return new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          script.src = 'js/debate-prep.js?v=7';
          script.onload = resolve;
          script.onerror = function () {
            reject(new Error('The Debate Prep Studio controls could not be loaded.'));
          };
          document.body.appendChild(script);
        });
      })
      .catch(function (error) {
        panel.innerHTML =
          '<div class="application-panel-error" role="alert">' +
          '<strong>Debate Prep is temporarily unavailable</strong>' +
          '<p>' + error.message + ' Refresh the page to try again.</p>' +
          '</div>';
        throw error;
      });

    return prepLoadPromise;
  }

  function finishSwitch(nextSection) {
    var outgoing = panels[currentSection];
    var focusWasInOutgoing = outgoing && outgoing.contains(document.activeElement);
    document.dispatchEvent(new CustomEvent('applicationsectionbeforechange', {
      detail: { from: currentSection, to: nextSection }
    }));

    Object.keys(panels).forEach(function (key) {
      var active = key === nextSection;
      panels[key].hidden = !active;
      panels[key].classList.remove('is-entering');
      panels[key].setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active && !reducedMotion.matches) {
        panels[key].classList.add('is-entering');
        window.setTimeout(function () {
          panels[key].classList.remove('is-entering');
        }, 230);
      }
    });
    currentSection = nextSection;
    document.dispatchEvent(new CustomEvent('applicationsectionchange', {
      detail: { section: nextSection }
    }));

    if (focusWasInOutgoing) {
      var selectedButton = buttons.find(function (button) {
        return button.dataset.applicationSection === nextSection;
      });
      if (selectedButton) selectedButton.focus({ preventScroll: true });
    }
  }

  function showSection(nextSection, options) {
    var settings = options || {};
    if (!panels[nextSection]) nextSection = 'team';

    updateControls(nextSection);

    if (settings.history !== false && nextSection !== currentSection) {
      window.history.pushState({ applicationSection: nextSection }, '', sectionUrl(nextSection));
    }

    if (nextSection === 'debate-prep') loadDebatePrep().catch(function () {});
    if (nextSection === currentSection && !panels[nextSection].hidden) {
      panels[nextSection].classList.remove('is-entering');
      if (settings.focusEntry) {
        if (nextSection === 'debate-prep' && prepLoadPromise) {
          prepLoadPromise.then(function () { focusSectionEntry(nextSection); });
        } else {
          focusSectionEntry(nextSection);
        }
      }
      return;
    }
    finishSwitch(nextSection);
    if (settings.focusEntry) {
      if (nextSection === 'debate-prep' && prepLoadPromise) {
        prepLoadPromise.then(function () { focusSectionEntry(nextSection); });
      } else {
        focusSectionEntry(nextSection);
      }
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      showSection(button.dataset.applicationSection, { focusEntry: true });
    });
    button.addEventListener('keydown', function (event) {
      var currentIndex = buttons.indexOf(button);
      var nextIndex = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      buttons[nextIndex].focus({ preventScroll: true });
      showSection(buttons[nextIndex].dataset.applicationSection, { focusEntry: true });
    });
  });

  window.addEventListener('popstate', function () {
    showSection(sectionFromLocation(), { history: false });
  });

  var initialSection = sectionFromLocation();
  currentSection = initialSection;
  updateControls(initialSection);
  Object.keys(panels).forEach(function (key) {
    panels[key].hidden = key !== initialSection;
    panels[key].setAttribute('aria-hidden', key === initialSection ? 'false' : 'true');
  });
  if (initialSection === 'debate-prep') loadDebatePrep().catch(function () {});
  if (initialSection === 'debate-prep') {
    loadDebatePrep().then(function () {
      if (currentSection === 'debate-prep') scrollSectionEntry('debate-prep');
    }).catch(function () {});
  }

  window.setTimeout(loadDebatePrep, 0);
})();