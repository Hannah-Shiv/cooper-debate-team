/* Shared Fall 2026 kickoff schedule for the public site and member calendar. */
(function () {
  const scheduleMarkup = `
    <section class="kickoff-schedule" aria-labelledby="kickoff-schedule-title">
      <div class="kickoff-schedule__eyebrow">
        <span class="kickoff-schedule__eyebrow-icon" aria-hidden="true">▦</span>
        <span>Fall 2026 · Team Start</span>
      </div>
      <h2 class="kickoff-schedule__title" id="kickoff-schedule-title">Debate Kickoff Schedule</h2>
       <p class="kickoff-schedule__intro">Confirmed recruitment dates, practice sessions, and team expectations for the start of the 2026–27 season.</p>
      <hr class="kickoff-schedule__rule">

      <div class="kickoff-schedule__dates">
        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__date-heading">
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-calendar.png" alt="">
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
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-activity-fair.png" alt="">
            <span>
              <span class="kickoff-schedule__weekday">Monday</span>
              <span class="kickoff-schedule__date">September 14</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Activity Fair · A Session</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>After school<strong>Approximately 2:30 PM – 3:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>A Session</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__date-heading">
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-calendar.png" alt="">
            <span>
              <span class="kickoff-schedule__weekday">Wednesday</span>
              <span class="kickoff-schedule__date">September 16</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Debate Team Applications Due</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">✓</span>
            <span>Submit the existing Debate Team application by this deadline.</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__hours"><strong>2</strong>hours</div>
          <div class="kickoff-schedule__date-heading">
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-mini-debates-tuesday.png" alt="">
            <span>
              <span class="kickoff-schedule__weekday">Tuesday</span>
              <span class="kickoff-schedule__date">September 22</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Debate Team Practice Session</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>Practice session<strong>2:30 PM – 4:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>Cafeteria</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__hours"><strong>2</strong>hours</div>
          <div class="kickoff-schedule__date-heading">
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-mini-debates-wednesday.png" alt="">
            <span>
              <span class="kickoff-schedule__weekday">Wednesday</span>
              <span class="kickoff-schedule__date">September 23</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">Debate Team Practice Session</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">◷</span>
            <span>Practice session<strong>2:30 PM – 4:30 PM</strong></span>
          </div>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">●</span>
            <span>Lecture Hall</span>
          </div>
        </article>

        <article class="kickoff-schedule__date-card">
          <div class="kickoff-schedule__date-heading">
            <img class="kickoff-schedule__date-icon" src="images/kickoff-icon-calendar.png" alt="">
            <span>
              <span class="kickoff-schedule__weekday">Tuesday</span>
              <span class="kickoff-schedule__date">September 29</span>
            </span>
          </div>
          <h3 class="kickoff-schedule__event-title">First Debate Team Meeting</h3>
          <div class="kickoff-schedule__detail">
            <span class="kickoff-schedule__detail-icon" aria-hidden="true">★</span>
            <span>The 2026–27 season begins.</span>
          </div>
        </article>
      </div>

      <div class="kickoff-schedule__weekly">
        <h3 class="kickoff-schedule__weekly-heading">Weekly Debate Meetings <span aria-hidden="true">★</span></h3>
        <p class="kickoff-schedule__weekly-subtitle">Starting September 29, members should keep Tuesday afternoons clear for team meetings.</p>
        <div class="kickoff-schedule__weekly-columns kickoff-schedule__weekly-columns--single">
          <div class="kickoff-schedule__weekly-card">
            <div class="kickoff-schedule__optional-copy">
              <span class="kickoff-schedule__event-icon" data-icon="people" aria-hidden="true"></span>
              <span><strong>Tuesday team meetings</strong>Exact meeting time and location will be shared with team members.</span>
            </div>
          </div>
        </div>
      </div>

      <div class="kickoff-schedule__footer">
        <span class="kickoff-schedule__footer-icon" aria-hidden="true">⌁</span>
        <span><strong>Stay informed</strong>Check the Tournament Calendar for the October 24 WASDL tournament and Cooper’s hosted November 14 Middle School PF tournament.</span>
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