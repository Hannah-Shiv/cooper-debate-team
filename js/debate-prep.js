(function () {
  'use strict';

  var storageKey = 'cooper-debate-prep-draft-v2';
  var emailKey = 'cooper-debate-prep-email-v1';
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
  var gate = $('prepGate');
  var gateForm = $('prepGateForm');
  var gateName = $('prepGateName');
  var gateEmail = $('prepGateEmail');
  var gateStudentId = $('prepGateStudentId');
  var gateError = $('prepGateError');
  var studio = document.querySelector('.studio-shell');
  var studioContent = $('studioContent');

  function wordCount(value) {
    return value.trim() ? value.trim().split(/\s+/).length : 0;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function isRichTextField(field) {
    return field && field.getAttribute && field.getAttribute('contenteditable') === 'true';
  }

  function sanitizeRichText(html) {
    var template = document.createElement('template');
    var allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'P', 'BR', 'DIV'];
    template.innerHTML = html;
    Array.from(template.content.querySelectorAll('*')).forEach(function (node) {
      if (allowedTags.indexOf(node.tagName) === -1) {
        node.replaceWith(document.createTextNode(node.textContent || ''));
        return;
      }
      Array.from(node.attributes).forEach(function (attribute) {
        node.removeAttribute(attribute.name);
      });
    });
    return template.innerHTML;
  }

  function valueOf(field) {
    if (typeof field.value === 'string') return field.value;
    if (isRichTextField(field)) return sanitizeRichText(field.innerHTML);
    return field.dataset.value || '';
  }

  function textValueOf(field) {
    if (typeof field.value === 'string') return field.value;
    if (isRichTextField(field)) return (field.innerText || '').replace(/\u00a0/g, ' ');
    return field.dataset.value || '';
  }

  function setValue(field, value) {
    var nextValue = typeof value === 'string' ? value : '';
    if (typeof field.value === 'string') {
      field.value = nextValue;
      return;
    }
    if (isRichTextField(field)) {
      if (/<(?:b|strong|i|em|u|ul|ol|li|p|br|div)\b/i.test(nextValue)) {
        field.innerHTML = sanitizeRichText(nextValue);
      } else {
        field.textContent = nextValue;
      }
      return;
    }
    field.dataset.value = nextValue;
    field.textContent = nextValue || '—';
  }

  function initialsFor(name) {
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }

  function updatePaperSaveState(label, detail) {
    $('paperSaveState').textContent = label;
    $('paperSavedTime').textContent = detail;
    $('paperFooterSavedTime').textContent = detail;
  }

  function updateRequirement(id, value, complete) {
    var item = $(id);
    item.textContent = value;
    item.classList.toggle('is-complete', complete);
  }

  function openStudio(email, name, studentId) {
    setValue(fields.name, name);
    setValue(fields.studentId, studentId);
    setValue(fields.email, email);
    gateName.value = name;
    gateStudentId.value = studentId;
    gateEmail.value = email;
    $('studentInitials').textContent = initialsFor(name);
    try {
      localStorage.setItem(emailKey, email);
    } catch (error) {
      // The draft save path reports local storage failures when it saves.
    }
    studio.classList.remove('is-locked');
    studioContent.inert = false;
    studioContent.removeAttribute('aria-disabled');
    gate.classList.add('is-complete');
    document.body.classList.remove('prep-gated');
  }

  function initializeGate() {
    var rememberedEmail = '';
    try {
      rememberedEmail = localStorage.getItem(emailKey) || valueOf(fields.email) || '';
    } catch (error) {
      rememberedEmail = valueOf(fields.email) || '';
    }
    gateName.value = valueOf(fields.name);
    gateEmail.value = rememberedEmail;
    gateStudentId.value = valueOf(fields.studentId);
    studio.classList.add('is-locked');
    studioContent.inert = true;
    studioContent.setAttribute('aria-disabled', 'true');
    if (validEmail(rememberedEmail) && gateName.value.trim() && gateStudentId.value.trim()) {
      openStudio(rememberedEmail, gateName.value.trim(), gateStudentId.value.trim());
      return;
    }
    document.body.classList.add('prep-gated');
    gateName.focus();
  }

  function updateDaysRemaining() {
    var dueDate = new Date('2026-09-16T15:00:00-04:00');
    var days = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
    $('daysLeft').textContent = days > 0
      ? days + (days === 1 ? ' day left' : ' days left')
      : 'Deadline passed';
  }

  function collect() {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      name: valueOf(fields.name),
      studentId: valueOf(fields.studentId),
      email: valueOf(fields.email),
      title: fields.title.value,
      essay: valueOf(fields.essay),
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
    var essayText = textValueOf(fields.essay);
    var words = wordCount(essayText);
    var characters = essayText.replace(/\s/g, '').length;
    var pages = words ? Math.max(1, Math.ceil(words / 500)) : 0;
    var evidenceReady = Boolean(fields.evidence.value.trim());
    var reasoningReady = Boolean(fields.reasoning.value.trim() && fields.impacts.value.trim());
    $('wordCount').textContent = words.toLocaleString();
    $('editorWordCount').textContent = words.toLocaleString();
    $('pageCount').textContent = pages;
    $('sourceCount').textContent = sources.length;
    $('statSources').textContent = sources.length;
    $('characterCount').textContent = characters.toLocaleString();
    $('wordProgressBar').style.width = Math.min(100, (words / 750) * 100) + '%';
    updateRequirement('requirementWords', words.toLocaleString() + ' / 750–1,000', words >= 750 && words <= 1000);
    updateRequirement('requirementPages', pages + ' / 2', pages === 2);
    updateRequirement('requirementSources', sources.length + ' / 5', sources.length >= 5);
    updateRequirement('requirementEvidence', evidenceReady ? 'Added' : 'In progress', evidenceReady);
    updateRequirement('requirementReasoning', reasoningReady ? 'Added' : 'In progress', reasoningReady);

    ['contentions', 'reasoning', 'evidence', 'impacts', 'sources'].forEach(function (key) {
      var status = document.querySelector('[data-case-status="' + key + '"]');
      var started = key === 'sources' ? sources.length > 0 : Boolean(fields[key].value.trim());
      status.textContent = started ? (key === 'sources' ? 'Sources added' : 'Notes added') : 'Optional';
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
      var number = document.createElement('span');
      var label = document.createElement('span');
      var remove = document.createElement('button');
      row.className = 'source-item';
      number.className = 'source-index';
      number.textContent = String(index + 1).padStart(2, '0');
      label.className = 'source-label';
      label.textContent = source;
      if (/^https?:\/\//i.test(source)) {
        var link = document.createElement('a');
        link.className = 'source-label';
        link.href = source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source;
        label = link;
      }
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
      row.append(number, label, remove);
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
      updatePaperSaveState(quiet ? 'Saved automatically' : 'Draft saved',
        'Last saved ' + savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (error) {
      state.textContent = 'Local save unavailable';
      state.style.color = '#f4a6a6';
      time.textContent = 'Copy your work before leaving this page';
      updatePaperSaveState('Local save unavailable', 'Copy your work before leaving');
    }
  }

  function markDirty() {
    state.textContent = 'Saving changes';
    state.style.color = '#f2d16b';
    updatePaperSaveState('Saving changes', 'Autosave in progress');
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      save({ quiet: true });
    }, 900);
  }

  function restoreValue(data, key) {
    if (typeof data[key] === 'string') setValue(fields[key], data[key]);
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
      updatePaperSaveState('Draft recovered', data.updatedAt
        ? 'Last saved ' + new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : 'Recovered from this device');
    } catch (error) {
      state.textContent = 'Draft could not be recovered';
      state.style.color = '#f4a6a6';
      updatePaperSaveState('Draft could not be recovered', 'Start a new draft');
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

  function syncStanceCards() {
    document.querySelectorAll('.choice').forEach(function (card) {
      card.classList.toggle('is-selected', card.querySelector('input').checked);
    });
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
      if (typeof fields[key].value !== 'string' && !isRichTextField(fields[key])) return;
      renderStats();
      markDirty();
      if (key === 'email') gateEmail.value = valueOf(fields.email);
      if (key === 'email' && validEmail(valueOf(fields.email))) {
        try {
          localStorage.setItem(emailKey, valueOf(fields.email).trim());
        } catch (error) {
          // The draft save path reports local storage failures when it saves.
        }
      }
    });
  });

  function continueFromGate(event) {
    event.preventDefault();
    var name = gateName.value.trim();
    var email = gateEmail.value.trim();
    var studentId = gateStudentId.value.trim();
    if (!name || !validEmail(email) || !studentId) {
      gateError.hidden = false;
      if (!name) gateName.focus();
      else if (!validEmail(email)) gateEmail.focus();
      else gateStudentId.focus();
      return;
    }
    gateError.hidden = true;
    openStudio(email, name, studentId);
    renderStats();
    syncStanceCards();
    markDirty();
  }

  gateForm.addEventListener('submit', continueFromGate);
  $('prepGateOpen').addEventListener('click', continueFromGate);

  document.querySelectorAll('input[name="stance"]').forEach(function (input) {
    input.addEventListener('change', function () {
      syncStanceCards();
      markDirty();
    });
  });

  document.querySelectorAll('.checks input').forEach(function (input) {
    input.addEventListener('change', markDirty);
  });

  document.querySelectorAll('[data-editor-command]').forEach(function (button) {
    button.addEventListener('mousedown', function (event) {
      event.preventDefault();
    });
    button.addEventListener('click', function () {
      fields.essay.focus();
      document.execCommand(button.dataset.editorCommand, false, null);
      fields.essay.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  fields.essay.addEventListener('paste', function (event) {
    event.preventDefault();
    var plainText = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, plainText);
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

  $('saveEssayBtn').addEventListener('click', function () {
    save({ quiet: false });
  });

  $('changeRouteBtn').addEventListener('click', function () {
    document.querySelector('.route-area').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  function openPreview() {
    var essayWords = wordCount(textValueOf(fields.essay));
    $('previewHeading').textContent = fields.title.value || 'Untitled position paper';
    $('previewMeta').textContent = (valueOf(fields.name) || 'Unnamed student') + ' · ' +
      document.querySelector('input[name="stance"]:checked').value + ' · ' +
      essayWords.toLocaleString() + (essayWords === 1 ? ' word' : ' words') + ' · ' +
      sources.length + (sources.length === 1 ? ' source' : ' sources');
    if (textValueOf(fields.essay).trim()) {
      $('previewCopy').innerHTML = valueOf(fields.essay);
    } else {
      $('previewCopy').textContent = 'Your essay preview will appear here once you begin writing.';
    }
    $('previewPanel').classList.add('open');
    document.body.style.overflow = 'hidden';
    $('closePreview').focus();
  }

  $('previewBtn').addEventListener('click', openPreview);
  $('previewBtnFooter').addEventListener('click', openPreview);

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
    var identityReady = valueOf(fields.name).trim() && valueOf(fields.studentId).trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueOf(fields.email).trim());
    var essayReady = wordCount(textValueOf(fields.essay)) >= 50;
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
  syncStanceCards();
  renderStats();
  updateDaysRemaining();
  initializeGate();
})();