(function () {
  'use strict';

  /* -- Focus Question accordion -- */
  document.querySelectorAll('.rq-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var isOpen = card.classList.contains('rq-open');
      document.querySelectorAll('.rq-card').forEach(function (c) {
        c.classList.remove('rq-open');
        c.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        card.classList.add('rq-open');
        card.setAttribute('aria-expanded', 'true');
      }
    });
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });

  /* -- Source card accordion -- */
  document.querySelectorAll('.src-card').forEach(function (card) {
    var trigger = card.querySelector('.src-card-header');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var isOpen = card.classList.contains('src-open');
      document.querySelectorAll('.src-card').forEach(function (c) {
        c.classList.remove('src-open');
        var t = c.querySelector('.src-card-header');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        card.classList.add('src-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
    trigger.setAttribute('aria-expanded', 'false');
  });

  /* -- Team card click toggle -- */
  document.querySelectorAll('.team-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var isOpen = card.classList.contains('team-open');
      document.querySelectorAll('.team-card').forEach(function (c) { c.classList.remove('team-open'); });
      if (!isOpen) card.classList.add('team-open');
    });
  });

  /* -- Workflow v2 -- */
  var wf2Nodes = document.querySelectorAll('.wf2-node');
  var wf2Panel = document.getElementById('wf2-panel');
  var wf2PanelInner = document.getElementById('wf2-panel-inner');

  var wf2Data = {
    question: {
      num: 'Step 01', icon: '&#128161;', pc: '#ffe58f', ps: 'rgba(255,229,143,.07)',
      title: 'QUESTION',
      tagline: 'We started with big questions about how McLean became what it is today.',
      outcome: 'Three focused research questions that guided every source, every decision, and every page of the website.',
      items: [
        { icon: '&#127919;', label: 'Topic Selection',  desc: 'Chose McLean\'s CIA-era transformation as our research subject.' },
        { icon: '&#128101;', label: 'Team Roles',       desc: 'Divided historical, technical, and impact research between members.' },
        { icon: '&#128203;', label: 'Research Goals',   desc: 'Set clear objectives for what evidence we needed to find.' },
        { icon: '&#128269;', label: 'Scope Definition', desc: 'Focused on 1950–1975 as the key period of McLean\'s transformation.' }
      ]
    },
    research: {
      num: 'Step 02', icon: '&#128193;', pc: '#60a5fa', ps: 'rgba(96,165,250,.07)',
      title: 'RESEARCH',
      tagline: 'We gathered information from a wide range of primary and secondary sources.',
      outcome: '18+ categorized sources — maps, records, documents, photographs, and county reports.',
      items: [
        { icon: '&#128230;', label: 'Historical Maps',    desc: 'Showed land use before and after the CIA\'s arrival in Langley.' },
        { icon: '&#128202;', label: 'Census Records',     desc: 'Tracked McLean\'s dramatic population growth from 1950–1970.' },
        { icon: '&#128196;', label: 'Government Docs',    desc: 'Revealed CIA site selection decisions and federal planning records.' },
        { icon: '&#128373;', label: 'CIA Documentation',  desc: 'Official history of the Langley headquarters construction timeline.' }
      ]
    },
    analysis: {
      num: 'Step 03', icon: '&#128202;', pc: '#2dd4bf', ps: 'rgba(45,212,191,.07)',
      title: 'ANALYZE',
      tagline: 'We examined patterns and connections across all collected evidence.',
      outcome: 'Key patterns identified: population growth, infrastructure expansion, economic shifts, and identity change.',
      items: [
        { icon: '&#128101;', label: 'Population Growth', desc: 'Population grew nearly 10× between 1950 and 1970.' },
        { icon: '&#127963;', label: 'Infrastructure',    desc: 'Roads, schools, and utilities expanded in direct response to CIA growth.' },
        { icon: '&#128176;', label: 'Economic Shift',    desc: 'Property values and incomes outpaced surrounding Virginia communities.' },
        { icon: '&#127963;', label: 'Identity Change',   desc: 'McLean\'s character shifted permanently from rural to federal suburb.' }
      ]
    },
    verification: {
      num: 'Step 04', icon: '&#9989;', pc: '#a78bfa', ps: 'rgba(167,139,250,.07)',
      title: 'VERIFY',
      tagline: 'Ensuring accuracy was essential. We verified findings through multiple reliable methods.',
      outcome: 'Confident, credible, and evidence-based information that shaped our entire story.',
      items: [
        { icon: '&#9989;',  label: 'Cross-Checked Sources', desc: 'Compared multiple sources to confirm events, dates, and locations.' },
        { icon: '&#128197;', label: 'Verified Timelines',   desc: 'Ensured chronological accuracy of historical events and transformations.' },
        { icon: '&#128203;', label: 'Validated Facts',      desc: 'Checked statistics, names, and claims with trusted references.' },
        { icon: '&#128065;', label: 'Peer Review',          desc: 'Reviewed findings as a team to catch errors and strengthen conclusions.' }
      ]
    },
    design: {
      num: 'Step 05', icon: '&#128396;', pc: '#fbbf24', ps: 'rgba(251,191,36,.07)',
      title: 'DESIGN',
      tagline: 'We transformed research findings into page structures, visuals, and content.',
      outcome: 'A complete content map for all 8 pages — structure, interactions, and visual plan defined.',
      items: [
        { icon: '&#128221;', label: 'Page Structure',     desc: 'Mapped each research finding to a dedicated page section.' },
        { icon: '&#128290;', label: 'Navigation Design',  desc: 'Designed the dome nav to reflect the project\'s circular story arc.' },
        { icon: '&#127912;', label: 'Visual System',      desc: 'Established the black, gold, and blue CIA-era color palette.' },
        { icon: '&#9889;',   label: 'Interactive Plan',   desc: 'Planned timelines, accordions, and charts before writing any code.' }
      ]
    },
    website: {
      num: 'Step 06', icon: '&#128187;', pc: '#4ade80', ps: 'rgba(74,222,128,.07)',
      title: 'BUILD',
      tagline: 'We built our website to share Langley\'s story with impact and clarity.',
      outcome: 'Langley Legacy — a live, interactive historical experience ready for TSA National 2026.',
      items: [
        { icon: '&#10024;',  label: 'Interactive Features', desc: 'Expandable cards, timelines, and workflow charts in pure HTML/CSS/JS.' },
        { icon: '&#128241;', label: 'Responsive Design',    desc: 'Works seamlessly across desktop, tablet, and mobile devices.' },
        { icon: '&#9855;',   label: 'Accessibility',        desc: 'Keyboard navigation, ARIA labels, and semantic HTML throughout.' },
        { icon: '&#127942;', label: 'TSA Ready',            desc: 'Meets all TSA Website Design competition standards for 2026.' }
      ]
    }
  };

  if (wf2Nodes.length && wf2Panel && wf2PanelInner) {
    wf2Nodes.forEach(function (node) {
      node.addEventListener('click', function () {
        var key = node.dataset.wf2;
        var data = wf2Data[key];
        var isActive = node.classList.contains('wf2-active');

        wf2Nodes.forEach(function (n) {
          n.classList.remove('wf2-active');
          n.setAttribute('aria-expanded', 'false');
        });

        if (!isActive && data) {
          node.classList.add('wf2-active');
          node.setAttribute('aria-expanded', 'true');

          wf2PanelInner.style.setProperty('--pc', data.pc);
          wf2PanelInner.style.setProperty('--ps', data.ps);

          var pCircle = document.getElementById('wf2-pcircle');
          if (pCircle) { pCircle.style.setProperty('--pc', data.pc); pCircle.style.setProperty('--ps', data.ps); }

          document.getElementById('wf2-pnum').textContent = data.num;
          document.getElementById('wf2-picon').innerHTML = data.icon;
          document.getElementById('wf2-ptitle').textContent = data.title;
          document.getElementById('wf2-ptagline').textContent = data.tagline;
          document.getElementById('wf2-poutcome').textContent = data.outcome;

          var itemsEl = document.getElementById('wf2-pitems');
          itemsEl.innerHTML = data.items.map(function (item) {
            return '<div class="wf2-item">' +
              '<div class="wf2-item-header">' +
                '<div class="wf2-item-icon-wrap">' + item.icon + '</div>' +
                '<div class="wf2-item-label">' + item.label + '</div>' +
              '</div>' +
              '<div class="wf2-item-desc">' + item.desc + '</div>' +
              '</div>';
          }).join('');

          wf2Panel.classList.add('wf2-panel-open');
        } else {
          wf2Panel.classList.remove('wf2-panel-open');
        }
      });
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.click(); }
      });
    });
    wf2Nodes[0].click();
  }
})();
