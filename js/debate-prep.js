(function () {
  'use strict';

  var storageKey = 'cooper-debate-prep-draft-v2';
  var $ = function (id) { return document.getElementById(id); };
  var fields = {
    name: $('studentName'),
    studentId: $('studentId'),
    email: $('studentEmail'),
    title: $('paperTitle'),
    essay: $('essay'),
    contentions: $('contentions'),
    reasoning: $('reasoning'),
    evidence: $('evidence'),
    impacts: $('impacts')
  };
  var sources = [];
  var route = 'guided';
  var autosaveTimer = null;
  var state = $('saveState');
  var time = $('savedTime');

  function wordCount(value) {
    return value.trim() ? value.trim().split(/\s+/).length : 0;
  }

  function collect() {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      name: fields.name.value,
      studentId: fields.studentId.value,
      email: fields.email.value,
      title: fields.title.value,
      essay: fields.essay.value,
      contentions: fields.contentions.value,
      reasoning: fields.reasoning.value,
      evidence: fields.evidence.value,
      impacts: fields.impacts.value,
      stance: document.querySelector('input[name="stance"]:checked').value,
      route: route,
      sources: sources,
      checks: Array.from(document.querySelectorAll('.checks input')).map(function (box) {
        return box.checked;
      })
    };
  }

  function renderStats() {
    var words = wordCount(fields.essay.value);
    $('wordCount').textContent = words.toLocaleString();
    $('pageCount').textContent = (words ? Math.max(1, Math.ceil(words / 500)) : 0) + ' / 2';
    $('sourceCount').textContent = sources.length;
    $('statSources').textContent = sources.length;

    ['contentions', 'reasoning', 'evidence', 'impacts'].forEach(function (key) {
      var status = document.querySelector('[data-case-status="' + key + '"]');
      var started = Boolean(fields[key].value.trim());
      status.textContent = started ? 'Notes added' : 'Optional';
      status.classList.toggle('done', started);
    });
  }

  function renderSources() {
    var list = $('sourceList');
    list.innerHTML = '';
    if (!sources.length) {
      list.innerHTML = '<p class="studio-note">Add sources as you find them.</p>';
      return;
    }
    sources.forEach(function (source, index) {
      var row = document.createElement('div');
      var label = document.createElement('span');
      var remove = document.createElement('button');
      row.className = 'source-item';
      label.textContent = source;
      remove.className = 'remove-source';
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove source ' + (index + 1));
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        sources.splice(index, 1);
        renderSources();
        renderStats();
        markDirty();
      });
      row.append(label, remove);
      list.appendChild(row);
    });
  }

  function savedLabel(date) {
    return 'Saved ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · on this device';
  }

  function save(options) {
    var quiet = options && options.quiet;
    clearTimeout(autosaveTimer);
    try {
      var draft = collect();
      localStorage.setItem(storageKey, JSON.stringify(draft));
      var savedAt = new Date(draft.updatedAt);
      state.textContent = quiet ? 'Autosaved' : 'Draft saved';
      state.style.color = '';
      time.textContent = savedLabel(savedAt);
    } catch (error) {
      state.textContent = 'Local save unavailable';
      state.style.color = '#f4a6a6';
      time.textContent = 'Copy your work before leaving this page';
    }
  }

  function markDirty() {
    state.textContent = 'Saving changes';
    state.style.color = '#f2d16b';
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      save({ quiet: true });
    }, 900);
  }

  function restoreValue(data, key) {
    if (typeof data[key] === 'string') fields[key].value = data[key];
  }

  function load() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var data = JSON.parse(raw);
      Object.keys(fields).forEach(function (key) {
        restoreValue(data, key);
      });
      route = data.route === 'essay' ? 'essay' : 'guided';
      sources = Array.isArray(data.sources) ? data.sources.filter(function (source) {
        return typeof source === 'string';
      }).slice(0, 20) : [];
      var stance = document.querySelector('input[name="stance"][value="' + (data.stance || 'Pro') + '"]');
      if (stance) stance.checked = true;
      (Array.isArray(data.checks) ? data.checks : []).forEach(function (checked, index) {
        var box = document.querySelectorAll('.checks input')[index];
        if (box) box.checked = checked === true;
      });
      setRoute(route);
      renderSources();
      renderStats();
      state.textContent = 'Draft recovered';
      state.style.color = '';
      time.textContent = data.updatedAt ? savedLabel(new Date(data.updatedAt)) : 'Recovered from this device';
    } catch (error) {
      state.textContent = 'Draft could not be recovered';
      state.style.color = '#f4a6a6';
    }
  }

  function setRoute(next) {
    route = next === 'essay' ? 'essay' : 'guided';
    document.querySelectorAll('.route-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.route === route);
      var input = card.querySelector('input');
      input.checked = input.value === route;
    });
    $('caseSection').hidden = route === 'essay';
    $('essayHint').textContent = route === 'essay' ? 'Option B · Essay only' : 'Option A · Guided';
    document.querySelectorAll('.guided-check').forEach(function (item) {
      item.hidden = route === 'essay';
    });
    $('routeNote').querySelector('span').textContent = route === 'essay'
      ? 'Essay Only is a complete route. Contentions, position reasoning, evidence notes, and impacts are not required.'
      : 'Use as many coaching notes as you find helpful. You can still begin the essay at any time.';
  }

  document.querySelectorAll('input[name="route"]').forEach(function (input) {
    input.addEventListener('change', function () {
      setRoute(input.value);
      markDirty();
      if (route === 'essay') {
        fields.essay.focus({ preventScroll: true });
        fields.essay.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  Object.keys(fields).forEach(function (key) {
    fields[key].addEventListener('input', function () {
      renderStats();
      markDirty();
    });
  });

  document.querySelectorAll('input[name="stance"], .checks input').forEach(function (input) {
    input.addEventListener('change', markDirty);
  });

  $('addSource').addEventListener('click', function () {
    var value = $('sourceInput').value.trim();
    if (!value) return;
    $('sourceInput').value = '';
    sources.push(value.slice(0, 500));
    renderSources();
    renderStats();
    markDirty();
  });

  $('sourceInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('addSource').click();
    }
  });

  $('saveBtn').addEventListener('click', function () {
    save({ quiet: false });
  });

  $('previewBtn').addEventListener('click', function () {
    $('previewMeta').textContent = (fields.name.value || 'Unnamed student') + ' · ' +
      (fields.title.value || 'Untitled position paper') + ' · ' +
      document.querySelector('input[name="stance"]:checked').value;
    $('previewCopy').textContent = fields.essay.value ||
      'Your essay preview will appear here once you begin writing.';
    $('previewPanel').classList.add('open');
    document.body.style.overflow = 'hidden';
    $('closePreview').focus();
  });

  function closePreview() {
    $('previewPanel').classList.remove('open');
    document.body.style.overflow = '';
    $('previewBtn').focus();
  }

  $('closePreview').addEventListener('click', closePreview);
  $('previewPanel').addEventListener('click', function (event) {
    if (event.target === $('previewPanel')) closePreview();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && $('previewPanel').classList.contains('open')) closePreview();
  });

  $('finalBtn').addEventListener('click', function () {
    var visibleChecks = Array.from(document.querySelectorAll('.checks label:not([hidden]) input'));
    var identityReady = fields.name.value.trim() && fields.studentId.value.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim());
    var essayReady = wordCount(fields.essay.value) >= 50;
    var checksReady = visibleChecks.every(function (box) { return box.checked; });
    var ready = identityReady && essayReady && checksReady;
    $('finalMessage').textContent = ready
      ? 'Ready for review in development. No submission was sent.'
      : 'Add your name, student ID, valid personal email, at least 50 essay words, and complete the visible checklist.';
    $('finalMessage').style.color = ready ? 'var(--studio-mint)' : '#f2d16b';
    save({ quiet: true });
  });

  window.addEventListener('beforeunload', function () {
    if (state.textContent === 'Saving changes') save({ quiet: true });
  });

  load();
  renderStats();
})();