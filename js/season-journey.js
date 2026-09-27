/* Shared interactive season milestones for the homepage and team page. */
(() => {
  'use strict';
  const todayParts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York'
  }).formatToParts(new Date());
  const datePart = type => todayParts.find(part => part.type === type).value;
  const todayNY = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;

  document.querySelectorAll('.sh-journey').forEach(journey => {
    const milestones = [...journey.querySelectorAll('.sh-journey__track li')];
    const track = journey.querySelector('.sh-journey__track');
    const details = journey.querySelector('.sh-journey__details');
    if (!milestones.length || !details) return;
    const detailDate = details.querySelector('.sh-journey__details-date');
    const detailName = details.querySelector('.sh-journey__details-name');
    const detailPlace = details.querySelector('.sh-journey__details-place');
    const detailExtra = details.querySelector('.sh-journey__details-extra');
    const isTeamJourney = journey.classList.contains('team-season-journey');
    const mobile = window.matchMedia('(max-width: 720px)');
    const previousButton = journey.querySelector('.sh-journey__step--previous');
    const nextButton = journey.querySelector('.sh-journey__step--next');
    const position = journey.querySelector('.sh-journey__position');
    const hasControls = Boolean(previousButton && nextButton && position);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let selectedIndex = -1;
    let nextMilestone = null;
    milestones.forEach(item => {
      const date = item.querySelector('time')?.dateTime;
      if (!date) return;
      if (date < todayNY) item.classList.add('is-past');
      else if (!nextMilestone) nextMilestone = item;
    });
    if (nextMilestone) nextMilestone.classList.add('is-next');

    const centerSelected = animate => {
      if (!hasControls || !mobile.matches || selectedIndex < 0) return;
      const item = milestones[selectedIndex];
      const target = item.offsetLeft + item.offsetWidth / 2 - track.clientWidth / 2;
      track.scrollTo({
        left: Math.max(0, Math.min(target, track.scrollWidth - track.clientWidth)),
        behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant'
      });
    };
    const showMilestone = (item, animate = true) => {
      const index = milestones.indexOf(item);
      if (index === selectedIndex) return;
      selectedIndex = index;
      const button = item.querySelector('.sh-journey__milestone');
      milestones.forEach(milestone => {
        const selected = milestone === item;
        milestone.classList.toggle('is-selected', selected);
        milestone.querySelector('button').setAttribute('aria-pressed', String(selected));
      });
      detailDate.textContent = button.querySelector('time, .sh-journey__date').textContent;
      detailName.textContent = button.dataset.name;
      detailPlace.textContent = button.dataset.place;
      detailExtra.textContent = button.dataset.extra || '';
      detailExtra.hidden = !button.dataset.extra;
      details.scrollLeft = 0;
      if (hasControls) {
        previousButton.disabled = index === 0;
        nextButton.disabled = index === milestones.length - 1;
        position.textContent = `${index + 1} of ${milestones.length}`;
        centerSelected(animate);
      }
    };
    milestones.forEach(item => {
      const button = item.querySelector('button');
      button.addEventListener('pointerenter', event => {
        if ((event.pointerType === 'mouse' || event.pointerType === 'pen') &&
            !(hasControls && mobile.matches)) showMilestone(item);
      });
      button.addEventListener('focus', () => showMilestone(item));
      button.addEventListener('click', () => showMilestone(item));
    });
    if (hasControls) {
      previousButton.addEventListener('click', () => showMilestone(milestones[selectedIndex - 1]));
      nextButton.addEventListener('click', () => showMilestone(milestones[selectedIndex + 1]));
      mobile.addEventListener('change', () => centerSelected(false));
      new ResizeObserver(() => centerSelected(false)).observe(track);
    }
    showMilestone(isTeamJourney ? milestones[1] : nextMilestone || milestones[milestones.length - 1], false);
  });
})();