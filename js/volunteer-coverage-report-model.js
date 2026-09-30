(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CooperVolunteerCoverageReportModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

/** One source of truth for every roster, count, gap, and chart in the report. */
function buildReportModel(input) {
  if (!input || !Array.isArray(input.events) || input.events.length !== 5) {
    throw new Error("This four-page report requires five tournament dates.");
  }
  if (!Array.isArray(input.volunteers)) {
    throw new Error("Volunteer records are required.");
  }
  if (typeof input.seasonLabel !== "string" || !input.seasonLabel.trim()) {
    throw new Error("A season label is required.");
  }
  const events = input.events.map(event => {
    for (const key of ["short", "venue", "date", "dateShort", "icon"]) {
      if (typeof event[key] !== "string" || !event[key].trim()) {
        throw new Error(`Tournament ${key} is required.`);
      }
    }
    if (!Number.isInteger(event.target) || event.target <= 0) {
      throw new Error("Tournament targets must be positive integers.");
    }
    if (![event.color, event.pale].every(color => /^#[0-9a-f]{6}$/i.test(color))) {
      throw new Error("Tournament colors must be six-digit hex colors.");
    }
    return { ...event };
  });
  const volunteers = input.volunteers.map((person, originalIndex) => {
    if (typeof person.name !== "string" || !person.name.trim()) throw new Error("Volunteer name is required.");
    const name = person.name.trim();
    if (!Array.isArray(person.dates) || person.dates.some(i =>
      !Number.isInteger(i) || i < 0 || i >= events.length)) {
      throw new Error(`Invalid date selection for ${name}.`);
    }
    if (new Set(person.dates).size !== person.dates.length) {
      throw new Error(`Duplicate date selection for ${name}.`);
    }
    return {
      name, dates: [...person.dates].sort((a, b) => a - b),
      ...(person.id !== undefined ? { id: String(person.id) } : {}),
      originalIndex,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "en")
    || String(a.id ?? "").localeCompare(String(b.id ?? ""), "en")
    || a.originalIndex - b.originalIndex);
  volunteers.forEach(person => { delete person.originalIndex; });
  const counts = events.map((_, i) => volunteers.filter(person => person.dates.includes(i)).length);
  const selections = counts.reduce((sum, n) => sum + n, 0);
  const target = events.reduce((sum, event) => sum + event.target, 0);
  const filled = counts.reduce((sum, n, i) => sum + Math.min(n, events[i].target), 0);
  const model = {
    events, volunteers, counts, selections, target, filled, open: target - filled,
    seasonLabel: input.seasonLabel.trim(), sampleData: input.sampleData === true,
  };
  const eventCoreLimit = volunteers.length > 25 ? 18 : 25;
  model.appendixPages = Math.ceil(Math.max(0, volunteers.length - 25) / 30)
    + events.reduce((pages, _, index) =>
      pages + Math.ceil(Math.max(0, counts[index] - eventCoreLimit) / 21), 0);
  model.pageCount = 4 + model.appendixPages;
  return model;
}

  return { buildReportModel };
});