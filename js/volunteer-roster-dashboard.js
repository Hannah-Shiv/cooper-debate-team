/* Public season volunteer roster. Only pass fields exposed by the public projection. */
(function () {
  "use strict";

  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const csvCell = value => {
    const safe = String(value ?? "").replace(/^[\s]*[=+\-@]/, match => `'${match}`);
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const shortDate = id => {
    const [year, month, day] = id.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  function render(root, { signups, tournaments, season, available = true, testMode = false }) {
    const ids = new Set(tournaments.map(item => item.id));
    const people = signups
      .filter(item => typeof item.parentName === "string" && Array.isArray(item.selectedTournamentIds))
      .map(item => ({
        name: item.parentName.trim(),
        dates: tournaments.filter(tournament => item.selectedTournamentIds.includes(tournament.id)).map(item => item.id),
      }))
      .filter(item => item.name && item.dates.length);
    const target = tournaments.reduce((sum, item) => sum + item.judgeTarget, 0);
    const counts = Object.fromEntries(tournaments.map(item =>
      [item.id, people.filter(person => person.dates.includes(item.id)).length]));
    const commitments = people.reduce((sum, person) => sum + person.dates.length, 0);
    const filled = tournaments.reduce((sum, item) => sum + Math.min(counts[item.id], item.judgeTarget), 0);
    const unfilled = tournaments.reduce((sum, item) => sum + Math.max(item.judgeTarget - counts[item.id], 0), 0);
    const distribution = tournaments.map((_, index) => people.filter(person => person.dates.length === index + 1).length);
    const state = { view: "tournament", selected: "", filter: "", query: "", sort: "name", descending: false };
    let pdfMessage = "";
    let pdfError = false;

    const shown = value => available ? value : "—";
    const accentTitle = (title, length) =>
      `<span class="vdb-heading-accent">${escape(title.slice(0, length))}</span>${escape(title.slice(length))}`;
    const personRows = () => {
      const chosen = state.view === "tournament" ? state.selected : state.filter;
      const rows = people.filter(person =>
        (!chosen || person.dates.includes(chosen)) &&
        person.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
      rows.sort((a, b) => {
        const comparison = state.sort === "count"
          ? a.dates.length - b.dates.length || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name);
        return state.descending ? -comparison : comparison;
      });
      return rows;
    };
    const resultCount = () => {
      const count = personRows().length;
      const context = tournaments.find(item => item.id ===
        (state.view === "tournament" ? state.selected : state.filter))?.name || "All tournaments";
      return `<span class="vdb-result-number">${shown(count)}</span> <span class="vdb-result-label">volunteer${count === 1 ? "" : "s"} · ${escape(context)}</span>`;
    };
    const metric = (label, value, description, icon) => `
      <div class="vdb-metric"><span class="vdb-metric-icon" aria-hidden="true"><img src="images/volunteer-roster-${icon}.png" alt="" width="240" height="240"></span>
        <div class="vdb-metric-copy"><span class="vdb-metric-label">${escape(label)}</span>
          <span class="vdb-metric-value"><strong>${value}</strong><small>${description}</small></span></div>
      </div>`;
    const bar = (value, maximum) => `<span class="vdb-bar-track" aria-hidden="true"><span style="width:${Math.min(100, Math.round(value / Math.max(maximum, 1) * 100))}%"></span></span>`;
    const card = tournament => {
      const count = counts[tournament.id];
      const gap = Math.max(tournament.judgeTarget - count, 0);
      const color = !available ? "" : !gap ? "covered" : count >= tournament.judgeTarget / 2 ? "close" : "needs";
      return `<button class="vdb-tournament-card ${color} ${state.selected === tournament.id ? "is-selected" : ""}"
          type="button" data-tournament="${escape(tournament.id)}" aria-pressed="${state.selected === tournament.id}"
          aria-label="${escape(tournament.name)} at ${escape(tournament.location)}, ${escape(tournament.date)}: ${available ? `${count} of ${tournament.judgeTarget} volunteers available` : "volunteer data unavailable"}. ${state.selected === tournament.id ? "Clear filter" : "Filter roster"}">
          <span class="vdb-card-top"><strong>${escape(tournament.name)}</strong>
            <span class="vdb-status">${shown(gap ? `Needs ${gap}` : "Covered")}</span></span>
          <span class="vdb-card-meta"><span class="vdb-card-meta-copy"><small>Tournament date</small><b>${escape(tournament.date)}</b></span></span>
          <span class="vdb-card-counts"><span><span class="vdb-card-stat-copy"><small>Judge target</small><b>${tournament.judgeTarget}</b></span></span>
            <span><span class="vdb-card-stat-copy"><small>Volunteers</small><b>${shown(count)}</b></span></span></span>
          <span class="vdb-card-caption">Coverage <b>${shown(`${Math.min(100, Math.round(count / tournament.judgeTarget * 100))}%`)}</b></span>
          ${bar(count, tournament.judgeTarget)}
        </button>`;
    };
    const matrix = rows => {
      const context = state.view === "tournament" && state.selected
        ? tournaments.find(item => item.id === state.selected)?.name || "Selected tournament"
        : state.view === "volunteer" && state.filter
          ? tournaments.find(item => item.id === state.filter)?.name || "Selected tournament" : "All tournaments";
      return `<div class="vdb-table-scroll" tabindex="0" role="region" aria-label="Volunteer commitments table, scroll horizontally for all dates">
        <table class="vdb-table"><thead><tr><th scope="col">Parent volunteer</th>
          ${tournaments.map(item => `<th scope="col"><span>${escape(item.name.replace(" Middle School", "").replace(" — Virtual Tournament", " · Virtual"))}</span><small>${shortDate(item.id)}</small></th>`).join("")}
          <th scope="col">Dates selected</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows.map(person => `<tr><th scope="row">${escape(person.name)}</th>
          ${tournaments.map(item => `<td><span class="vdb-mark ${person.dates.includes(item.id) ? "yes" : "no"}"
            aria-label="${escape(item.name)}: ${person.dates.includes(item.id) ? "selected" : "not selected"}">${person.dates.includes(item.id) ? "✓" : "–"}</span></td>`).join("")}
          <td><strong>${person.dates.length}</strong></td><td><span class="vdb-complete">✓ Complete</span></td></tr>`).join("") ||
          `<tr><td class="vdb-table-empty" colspan="${tournaments.length + 3}">${!available ? "—" : people.length ? "No volunteers match this selection." : "No completed season registrations are listed yet."}</td></tr>`}
        </tbody></table></div>`;
    };
    const participation = () => `<div class="vdb-panel vdb-participation"><div class="vdb-participation-heading">
        <h4>${accentTitle("Availability by tournament", 5)}</h4><p>Completed volunteer registrations compared with the target of 12.</p></div>
        <div class="vdb-bars">${tournaments.map(item => `<div class="vdb-bar-row">
          <span>${escape(item.name.replace(" Middle School", "").replace(" — Virtual Tournament", " · Virtual"))}</span>
          ${bar(counts[item.id], item.judgeTarget)}
          <strong>${shown(counts[item.id])} / ${item.judgeTarget}</strong></div>`).join("")}</div></div>`;
    const attention = () => {
      const gaps = tournaments.map(item => ({ ...item, gap: Math.max(item.judgeTarget - counts[item.id], 0) }))
        .filter(item => item.gap).sort((a, b) => b.gap - a.gap);
      return `<div class="vdb-panel vdb-attention"><div class="vdb-attention-heading">
        <div class="vdb-attention-heading-copy"><h4>${accentTitle("Needs attention", 5)}</h4><p>Tournaments below their volunteer target.</p></div></div>
        ${!available ? '<p class="vdb-good">—</p>' : gaps.length
          ? `<div class="vdb-attention-list">${gaps.map((item, index) => `
            <div class="vdb-attention-row"><span class="vdb-attention-rank" aria-label="Rank ${index + 1}">${index + 1}</span>
              <span class="vdb-attention-name">${escape(item.name.replace(" Middle School", "").replace(" — Virtual Tournament", " · Virtual"))}</span>
              <time datetime="${escape(item.id)}">${shortDate(item.id)}</time><strong>Needs ${item.gap}</strong></div>`).join("")}</div>`
          : '<p class="vdb-good">All tournaments have reached their volunteer targets.</p>'}</div>`;
    };
    const distributionPanel = () => `<div class="vdb-panel vdb-distribution"><h4>${accentTitle("Volunteer commitment distribution", 6)}</h4>
        <p>Number of volunteers by tournaments selected.</p>
        <div class="vdb-distribution-bars">${distribution.map((count, index) => `<div>
          <strong>${shown(count)}</strong><span class="vdb-vertical-bar" style="height:${Math.max(count ? 8 : 2, Math.round(count / Math.max(...distribution, 1) * 100))}%"></span>
          <small>${index + 1} ${index ? "dates" : "date"}</small></div>`).join("")}</div></div>`;
    const insights = () => {
      const fewest = [...tournaments].sort((a, b) => counts[a.id] - counts[b.id])[0];
      return `<div class="vdb-panel vdb-insights"><h4>${accentTitle("Key insights", 3)}</h4>
        ${available ? `<p><strong>${distribution[distribution.length - 1]}</strong> volunteer${distribution[distribution.length - 1] === 1 ? "" : "s"} selected all five tournaments.</p>
        <p><strong>${distribution[0]}</strong> volunteer${distribution[0] === 1 ? "" : "s"} selected one tournament.</p>
        <p><strong>${escape(fewest.name)}</strong> has the fewest volunteers (${counts[fewest.id]} of ${fewest.judgeTarget}).</p>` : '<p>—</p>'}
      </div>`;
    };

    const draw = () => {
      const selectedItem = tournaments.find(item => item.id === state.selected);
      root.innerHTML = `<div class="vdb-dashboard" data-view="${state.view}">
        <header class="vdb-header"><div class="vdb-heading-row"><h3>${accentTitle("Judge Volunteer Coverage", 5)}</h3>
          <div class="vdb-switch" role="group" aria-label="Volunteer roster view">
            <button type="button" data-view="tournament" aria-pressed="${state.view === "tournament"}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 4h3"/></svg>By Tournament</button>
            <button type="button" data-view="volunteer" aria-pressed="${state.view === "volunteer"}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2H2Zm14-15a3 3 0 0 1 0 6m3 9v-2a5 5 0 0 0-3-4.6"/></svg>By Volunteer</button>
          </div>
          <div class="vdb-heading-meta"><p class="vdb-eyebrow">COOPER DEBATE TEAM · ${escape(season.replace("-", "–"))}</p>
            <p>Season-wide volunteer availability across five tournaments.</p></div>
          <div class="vdb-header-actions"><span class="vdb-season"
            ${testMode ? 'title="Development test roster · resets on restart. Downloaded reports are labeled TEST DATA."' : ""}>▦ &nbsp; Season ${escape(season.replace("-", "–"))}</span>
            <button type="button" class="vdb-save-pdf" data-save-pdf
              aria-label="Save PDF for season ${escape(season)}"
              title="${available ? "Download the complete season report, including all volunteers and tournaments" : "PDF unavailable until the season roster loads"}"
              ${!available || root.dataset.pdfSaving === "true" ? "disabled" : ""}
              aria-busy="${root.dataset.pdfSaving === "true"}">
              <img src="images/volunteer-save-pdf.png?v=1" alt="" width="1828" height="538">
              <span class="vdb-sr-only">Save PDF</span><span class="vdb-pdf-busy" aria-hidden="true">Creating PDF…</span>
            </button>
            <p class="vdb-pdf-feedback ${pdfError ? "" : "vdb-sr-only"}" role="${pdfError ? "alert" : "status"}" aria-live="polite" ${pdfMessage ? "" : "hidden"}>${escape(pdfMessage)}</p>
          </div></div>
        </header>
        <div class="vdb-metrics" aria-label="Season volunteer summary">
          ${metric("Parent volunteers", shown(people.length), "Completed registrations", "parents")}
          ${metric("Tournament commitments", shown(commitments), "Selected dates", "commitments")}
          ${metric("Overall average", shown(`${target ? Math.round(filled / target * 100) : 0}%`), available ? `${filled}/${target} spots filled` : `Target: ${target} spots`, "average")}
          ${metric("Tournaments", tournaments.length, "In this season", "tournaments")}
          ${metric("Unfilled judge spots", shown(unfilled), "Across all tournaments", "unfilled")}
        </div>
        ${state.view === "tournament" ? `<section class="vdb-panel vdb-tournaments" aria-labelledby="vdb-tournaments-heading">
          <div class="vdb-panel-heading"><div><h4 id="vdb-tournaments-heading">${accentTitle("Tournaments", 4)}</h4><p>Choose a tournament to filter the volunteer matrix below.</p></div>
            ${state.selected ? '<button type="button" class="vdb-clear" data-clear>Show all tournaments</button>' : ""}</div>
          <div class="vdb-tournament-grid">${tournaments.map(card).join("")}</div></section>` : ""}
        <section class="vdb-panel vdb-matrix-panel" aria-labelledby="vdb-matrix-heading">
          <div class="vdb-panel-heading"><div><h4 id="vdb-matrix-heading">${state.view === "tournament"
            ? accentTitle("Tournament coverage matrix", 6) : accentTitle("Parent volunteers", 4)}</h4>
            <p>${state.view === "tournament" ? selectedItem ? `Showing volunteers available for ${escape(selectedItem.name)}.` : "Every completed registration, across all five dates." : "Each row shows one completed season registration."}</p></div>
            <div class="vdb-controls"><label class="vdb-search"><span class="vdb-sr-only">Search volunteer name</span><input type="search" data-search placeholder="Search volunteer name…" value="${escape(state.query)}"></label>
              ${state.view === "volunteer" ? `<label class="vdb-sr-only" for="vdb-filter">Filter by tournament</label><select id="vdb-filter" data-filter>
                <option value="">All tournaments</option>${tournaments.map(item => `<option value="${escape(item.id)}" ${state.filter === item.id ? "selected" : ""}>${escape(item.name)}</option>`).join("")}</select>` : ""}
              <label class="vdb-sr-only" for="vdb-sort">Sort volunteers</label><select id="vdb-sort" data-sort>
                <option value="name" ${state.sort === "name" && !state.descending ? "selected" : ""}>Name A–Z</option>
                <option value="name-desc" ${state.sort === "name" && state.descending ? "selected" : ""}>Name Z–A</option>
                <option value="count-desc" ${state.sort === "count" && state.descending ? "selected" : ""}>Most dates</option>
                <option value="count" ${state.sort === "count" && !state.descending ? "selected" : ""}>Fewest dates</option>
              </select></div></div>
          <p class="vdb-result-count" aria-live="polite">${resultCount()}</p>
          <div class="vdb-matrix">${matrix(personRows())}</div>
        </section>
        <div class="vdb-lower">${state.view === "tournament"
          ? `${participation()}${attention()}`
          : `${participation()}${distributionPanel()}${insights()}`}</div>
        <footer class="vdb-footer"><p>Availability is not a confirmed judging assignment. Names and selected dates are public; contact and student details remain private.</p>
          <div><button type="button" data-export ${available ? "" : "disabled"}>Export public CSV</button><button type="button" data-print>Print view</button></div></footer>
      </div>`;
    };
    const refreshMatrix = () => {
      root.querySelector(".vdb-matrix").innerHTML = matrix(personRows());
      root.querySelector(".vdb-result-count").innerHTML = resultCount();
    };
    const updatePdfControls = () => {
      const busy = root.dataset.pdfSaving === "true";
      const button = root.querySelector("[data-save-pdf]");
      if (button) {
        button.disabled = !available || busy;
        button.setAttribute("aria-busy", String(busy));
      }
      const feedback = root.querySelector(".vdb-pdf-feedback");
      if (feedback) {
        feedback.hidden = !pdfMessage;
        feedback.setAttribute("role", pdfError ? "alert" : "status");
        feedback.classList.toggle("vdb-sr-only", !pdfError);
        feedback.textContent = pdfMessage;
      }
    };
    const savePdf = async () => {
      if (!available || root.dataset.pdfSaving === "true") return;
      root.dataset.pdfSaving = "true";
      pdfError = false;
      pdfMessage = "Creating the complete season PDF…";
      updatePdfControls();
      try {
        if (!window.CooperVolunteerCoveragePdf) throw new Error("PDF creation could not load. Refresh the page and try again.");
        await window.CooperVolunteerCoveragePdf.save({
          tournaments: tournaments.map(item => ({
            id: item.id, name: item.name, location: item.location, date: item.date, judgeTarget: item.judgeTarget,
          })),
          people: people.map(person => ({ name: person.name, dates: [...person.dates] })),
          season,
          sampleData: testMode,
        });
        pdfMessage = "Season PDF downloaded.";
      } catch (error) {
        pdfError = true;
        pdfMessage = error?.message || "Could not create the season PDF. Please try again.";
      } finally {
        delete root.dataset.pdfSaving;
        updatePdfControls();
      }
    };

    root.onclick = event => {
      const button = event.target.closest("button");
      if (!button || !root.contains(button)) return;
      if (button.dataset.view) { state.view = button.dataset.view; state.selected = ""; state.filter = ""; state.query = ""; draw(); }
      if (button.dataset.tournament) { state.selected = state.selected === button.dataset.tournament ? "" : button.dataset.tournament; draw(); }
      if (button.hasAttribute("data-clear")) { state.selected = ""; draw(); }
      if (button.hasAttribute("data-print")) window.print();
      if (button.hasAttribute("data-save-pdf")) void savePdf();
      if (button.hasAttribute("data-export") && available) {
        const header = ["Parent volunteer", ...tournaments.map(item => item.name), "Dates selected", "Status"];
        const rows = personRows().map(person => [person.name, ...tournaments.map(item => person.dates.includes(item.id) ? "Yes" : "No"), person.dates.length, "Complete"]);
        const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `cooper-public-volunteers-${season}-${state.view}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    root.oninput = event => {
      if (event.target.matches("[data-search]")) { state.query = event.target.value; refreshMatrix(); }
    };
    root.onchange = event => {
      if (event.target.matches("[data-filter]")) { state.filter = ids.has(event.target.value) ? event.target.value : ""; refreshMatrix(); }
      if (event.target.matches("[data-sort]")) {
        state.sort = event.target.value.startsWith("count") ? "count" : "name";
        state.descending = event.target.value.endsWith("-desc");
        refreshMatrix();
      }
    };
    draw();
  }

  window.CooperVolunteerDashboard = { render };
})();