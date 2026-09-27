/* Season dates shown on the public homepage. The full schedule remains authoritative. */
(function () {
  'use strict';
  const root = document.getElementById('season-hub');
  if (!root) return;

  const tournaments = [
    { date: '2026-10-24T08:00:00-04:00', title: 'October 24, 2026', place: 'Congressional School · Falls Church', cardPlace: 'Congressional School\nFalls Church, VA' },
    { date: '2026-11-14T08:00:00-05:00', title: 'November 14, 2026', place: 'Cooper Middle School · McLean' },
    { date: '2026-12-05T08:00:00-05:00', title: 'December 5, 2026', place: 'Longfellow Middle School · McLean' },
    { date: '2027-01-30T08:00:00-05:00', title: 'January 30, 2027', place: 'Norwood School · Bethesda' },
    { date: '2027-02-20T08:00:00-05:00', title: 'February 20, 2027', place: 'Online tournament' }
  ];
  const events = [
    { date: '2026-09-29T14:30:00-04:00', label: 'First team meeting', detail: 'Cooper Middle School · 2:30–4:30 p.m.', href: 'tournaments.html?tab=calendar-results' },
    { date: '2026-09-29T19:30:00-04:00', label: 'Parent/guardian meeting', detail: 'Google Meet · 7:30 p.m. · details from Coach Konde', href: 'tournaments.html?tab=parent-info' },
    ...tournaments.map(t => ({ date: t.date, label: 'WASDL tournament', detail: t.place, href: 'tournaments.html?tab=calendar-results' })),
    { date: '2027-03-12T08:00:00-05:00', label: 'Metro Finals', detail: 'March 12–13 · for qualifying teams', href: 'tournaments.html?tab=calendar-results' }
  ];
  const now = new Date();
  const nyParts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York'
  }).formatToParts(now);
  const nyPart = type => nyParts.find(part => part.type === type).value;
  const todayNY = `${nyPart('year')}-${nyPart('month')}-${nyPart('day')}`;
  const next = tournaments.find(t => t.date.slice(0, 10) >= todayNY);
  const nextName = document.getElementById('sh-next-name');
  const nextPlace = document.getElementById('sh-next-place');
  if (next) {
    const heading = document.createElement('span');
    heading.textContent = next.title.replace(/, \d{4}$/, ',');
    const year = document.createElement('em');
    year.textContent = next.title.match(/\d{4}$/)[0];
    nextName.replaceChildren(heading, year);
    nextPlace.textContent = next.cardPlace || next.place;
  } else {
    document.querySelector('.sh-card--tournament .sh-kicker').textContent = 'Tournament season';
    nextName.textContent = 'What a season.';
    nextPlace.textContent = 'The five preliminary tournaments have concluded.';
  }

  const upcoming = events.filter(e => new Date(e.date) > now).slice(0, 3);
  const month = document.getElementById('sh-calendar-month');
  const list = document.getElementById('sh-calendar-events');
  if (upcoming.length) {
    month.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'America/New_York' }).format(new Date(upcoming[0].date));
    const fragment = document.createDocumentFragment();
    upcoming.forEach(event => {
      const day = new Date(event.date);
      const label = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'America/New_York' }).format(day);
      const number = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'America/New_York' }).format(day);
      const link = document.createElement('a');
      link.href = event.href;
      link.className = 'sh-event';
      const date = document.createElement('span');
      date.className = 'sh-event__date';
      const m = document.createElement('small');
      m.textContent = label;
      const n = document.createElement('strong');
      n.textContent = number;
      date.append(m, n);
      const details = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = event.label;
      const subtitle = document.createElement('small');
      subtitle.textContent = event.detail;
      details.append(title, subtitle);
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      link.append(date, details, arrow);
      fragment.append(link);
    });
    list.replaceChildren(fragment);
  } else {
    month.textContent = 'Season complete';
    list.replaceChildren();
    const note = document.createElement('p');
    note.className = 'sh-calendar__empty';
    note.textContent = 'The published 2026–27 milestones have passed. Check the full calendar for the latest team updates.';
    list.append(note);
  }

  const ny = new Intl.DateTimeFormat('en-US', {
    month: 'numeric', year: 'numeric', timeZone: 'America/New_York'
  }).formatToParts(now);
  const currentMonth = Number(ny.find(p => p.type === 'month')?.value);
  const currentYear = Number(ny.find(p => p.type === 'year')?.value);
  if (currentYear > 2026 || (currentYear === 2026 && currentMonth > 10)) {
    document.getElementById('sh-topic-kicker').textContent = 'Public Forum · Season resources';
    document.getElementById('sh-topic-title').textContent = 'The conversation continues.';
    document.getElementById('sh-topic-resolution').textContent =
      'Public Forum topics change throughout the season. Visit Resources for the latest research and topic materials.';
  }
})();