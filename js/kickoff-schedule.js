/* Shared Fall 2026 kickoff schedule for the public site and member calendar. */
(function () {
  const scheduleMarkup = `
    <section class="kickoff-schedule" aria-labelledby="kickoff-schedule-title">
      <div class="kickoff-schedule__eyebrow">
        <span class="kickoff-schedule__eyebrow-icon" aria-hidden="true">▦</span>
        <span>Fall 2026 · Team Start</span>
      </div>
      <h2 class="kickoff-schedule__title" id="kickoff-schedule-title">Debate Kickoff Schedule</h2>
      <p class="kickoff-schedule__intro">Confirmed dates and weekly meeting times.<br>We’ll update the mini-debate venue once it is assigned.</p>
      <hr class="kickoff-schedule__rule">

      <div class="kickoff-schedule__dates">
        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__date-heading">
            <span class="kickoff-schedule__event-icon" data-icon="calendar" aria-hidden="true"></span>
            <span>
              <span class="kickoff-schedule__weekday">Thursday</span>
              <span class="kickoff-schedule__date">September 10</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Debate Info Session</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>During QST<strong>9:35 AM – 10:25 AM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>Lecture Hall</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__date-heading">
            <span class="kickoff-schedule__event-icon" data-icon="people" aria-hidden="true"></span>
            <span>
              <span class="kickoff-schedule__weekday">Monday</span>
              <span class="kickoff-schedule__date">September 14</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Activity Fair · A Session</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>After school<strong>Late buses begin at 4:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>TBD</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card kickoff-schedule__date-card--pending">
          <div class="kickoff-schedule__hours"><strong>2</strong>hours</div>
          <div class="kickoff-schedule__date-heading">
            <span class="kickoff-schedule__event-icon" data-icon="chat" aria-hidden="true"></span>
            <span>
              <span class="kickoff-schedule__weekday">Tuesday</span>
              <span class="kickoff-schedule__date">September 22</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Mini-Debates</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>Both A &amp; B Sessions<strong>2:30 PM – 4:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>Room to be confirmed</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card kickoff-schedule__date-card--pending">
          <div class="kickoff-schedule__hours"><strong>2</strong>hours</div>
          <div class="kickoff-schedule__date-heading">
            <span class="kickoff-schedule__event-icon" data-icon="chat" aria-hidden="true"></span>
            <span>
              <span class="kickoff-schedule__weekday">Wednesday</span>
              <span class="kickoff-schedule__date">September 23</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Mini-Debates</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>Both A &amp; B Sessions<strong>2:30 PM – 4:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>Room to be confirmed</span>
          </div>
        </article>
      </div>

      <div class="kickoff-schedule__weekly">
        <h3 class="kickoff-schedule__weekly-heading">Weekly Debate Meetings <span aria-hidden="true">★</span></h3>
        <p class="kickoff-schedule__weekly-subtitle">Lecture Hall on Tuesdays, unless a conflict is announced.</p>
        <div class="kickoff-schedule__weekly-columns">
          <div class="kickoff-schedule__weekly-card">
            <div class="kickoff-schedule__weekly-card-title">Tuesday · Regular Meetings</div>
            <div class="kickoff-schedule__weekly-content">
              <div class="kickoff-schedule__session"><strong>A Session</strong><span class="kickoff-schedule__session-time">◷ &nbsp;2:30 PM – 3:30 PM</span></div>
              <div class="kickoff-schedule__session"><strong>B Session</strong><span class="kickoff-schedule__session-time">◷ &nbsp;3:30 PM – 4:30 PM</span></div>
            </div>
            <div class="kickoff-schedule__weekly-note"><strong>★</strong> Mini-debates may run across both sessions (2:30 PM – 4:30 PM).</div>
          </div>
          <div class="kickoff-schedule__weekly-card kickoff-schedule__weekly-card--optional">
            <div class="kickoff-schedule__weekly-card-title">Wednesday · Optional Practice</div>
            <div class="kickoff-schedule__optional-copy">
              <span class="kickoff-schedule__event-icon" data-icon="people" aria-hidden="true"></span>
              <span><strong>Optional practice</strong>Same time as A &amp; B Sessions<br>(2:30 PM – 4:30 PM)</span>
            </div>
          </div>
        </div>
      </div>

      <div class="kickoff-schedule__footer">
        <span class="kickoff-schedule__footer-icon" aria-hidden="true">⌁</span>
        <span><strong>Stay informed</strong>Check the website and announcements regularly for venue updates and any changes.</span>
      </div>
    </section>
  `;

  function mount() {
    document.querySelectorAll(".kickoff-schedule-mount").forEach((mountPoint) => {
      mountPoint.innerHTML = scheduleMarkup;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();