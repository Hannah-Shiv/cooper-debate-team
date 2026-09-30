(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CooperVolunteerCoverageAnalysisPages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

function renderAnalysisPages(doc, helpers, model) {
  const { C, text, panel, rule, icon, header, title, footer, beginPage } = helpers;
  const readableName = helpers.readableName || (person => person.name);
  const events = model.events;
  const volunteers = model.volunteers;
  const eventColor = event => ({ color: event.color, pale: event.pale });
  const signupsFor = index => volunteers
    .filter(person => person.dates.includes(index))
    .sort((a, b) => a.name.localeCompare(b.name));
  const countFor = index => model.counts[index] ?? signupsFor(index).length;
  const gapFor = index => Math.max(0, events[index].target - countFor(index));
  const seasonText = `${model.seasonLabel} SEASON`;
  const overallPercent = model.target ? Math.round(model.filled / model.target * 100) : 0;
  const takeaways = () => {
    const byGap = events.map((event, i) => ({ event, i, gap: gapFor(i) }))
      .sort((a, b) => b.gap - a.gap || a.i - b.i);
    const mostSelected = events.map((event, i) => ({ event, i, count: countFor(i) }))
      .sort((a, b) => b.count - a.count || a.i - b.i)[0];
    return [
      byGap[0].gap
        ? `Largest gaps: ${byGap[0].event.short} (${byGap[0].gap}) and ${byGap[1].event.short} (${byGap[1].gap}).`
        : "All tournament targets are covered.",
      `Overall season coverage is ${overallPercent}% (${model.filled} of ${model.target} spots filled).`,
      `${mostSelected.event.short} has the most volunteer selections (${mostSelected.count}).`,
      `A total of ${model.open} judge spots still need to be filled.`,
      model.open
        ? `Prioritize outreach for ${byGap[0].event.short} and ${byGap[1].event.short}.`
        : "Maintain volunteer communication and confirm tournament assignments.",
    ];
  };

  // Page 3 — a complete, event-by-event signup roster.
  beginPage(doc);
  header(doc, 77);
  title(doc, 84, "Volunteers by Tournament", `${seasonText} · JUDGE INFORMATION`,
    `ALL ${volunteers.length} VOLUNTEERS · ${model.selections} SELECTED DATES (OUT OF ${volunteers.length * events.length} TOTAL POSSIBLE)`,
    { fontSize: 31, titleWidth: 650, subtitleWidth: 850, height: 67 });

  events.forEach((event, i) => {
    const x = 22 + 199 * i, y = 174, w = 192, h = 429;
    const allPeople = signupsFor(i);
    const eventCoreLimit = volunteers.length > 25 ? 18 : 25;
    const people = allPeople.slice(0, eventCoreLimit);
    const continued = people.length < allPeople.length;
    const colors = eventColor(event, i);
    panel(doc, x, y, w, h, "#ffffff", colors.pale, 5);
    doc.save().roundedRect(x + 1, y + 1, w - 2, 94, 5).fill(colors.color);
    doc.rect(x + 1, y + 81, w - 2, 14).fill(colors.color);
    doc.restore();
    doc.circle(x + 27, y + 30, 20).fill(i === 2 ? C.navy : colors.color);
    doc.lineWidth(1).strokeColor("#ffffff").circle(x + 27, y + 30, 21).stroke();
    icon(doc, event.icon, x + 27, y + 30, "#ffffff");
    const fg = i === 2 ? C.ink : "#ffffff";
    text(doc, event.short, x + 53, y + 22, i === 0 ? 132 : 85,
      i === 4 ? 12.5 : 16, fg, "Times-Bold");
    if (i !== 0) {
      panel(doc, x + w - 48, y + 17, 41, 25, "#ffffff", "#ffffff", 4);
      text(doc, `${countFor(i)}/${event.target}`, x + w - 47, y + 22, 39, 13,
        colors.color, "Times-Bold", "center");
    }
    text(doc, event.date, x + 13, y + 56, w - 22, 10.4, fg, "Helvetica-Bold");
    text(doc, event.venue, x + 13, y + 73, w - 22, 9.6, fg);
    text(doc, `${allPeople.length} VOLUNTEERS SIGNED UP`, x + 11, y + 101, w - 20,
      9.5, C.navy, "Helvetica-Bold");
    if (continued) {
      text(doc, `Showing 1–${people.length} here; full list continues in appendix.`,
        x + 11, y + 112, w - 20, 7.8, C.muted);
    }
    const dividerY = y + (continued ? 131 : 120);
    rule(doc, x + 9, dividerY, x + w - 9, dividerY, C.border);

    const listTop = y + (continued ? 139 : 128);
    const listHeight = h - (continued ? 153 : 142);
    const rowHeight = people.length ? Math.min(24, listHeight / people.length) : 24;
    people.forEach((person, j) => {
      const rowY = listTop + j * rowHeight;
      if (j % 2 === 0) doc.rect(x + 2, rowY - 2, w - 4, rowHeight).fill("#f1f7fb");
      text(doc, `${j + 1}`, x + 10, rowY + 2, 20, Math.min(11.5, rowHeight * .55), C.muted, "Helvetica");
      const nameWidth = w - 42;
      const nameSize = Math.min(12.2, rowHeight * .6);
      text(doc, readableName(person, nameWidth, nameSize, "Helvetica"),
        x + 34, rowY + 1, nameWidth, nameSize, C.ink, "Helvetica");
    });
  });
  footer(doc, 3, "Volunteers by Tournament");

  // Page 4 — season summary and actionable, model-derived coverage analysis.
  beginPage(doc);
  header(doc, 77);
  title(doc, 84, "Season Overview & Next Steps", `${seasonText} · JUDGE INFORMATION`,
    "KEY STATISTICS · TOURNAMENT PARTICIPATION · COVERAGE GAPS · NEXT STEPS",
    { fontSize: 28, titleWidth: 510, subtitleWidth: 520, height: 67 });

  panel(doc, 644, 82, 360, 65, C.paleGold || "#fff8e7", "#eee3c8", 6);
  text(doc, "Season Coverage", 658, 87, 180, 12, C.ink, "Helvetica-Bold");
  panel(doc, 658, 111, 224, 11, "#d7dce2", "#d7dce2", 6);
  if (model.filled) panel(doc, 658, 111, 224 * Math.min(1, model.filled / model.target),
    11, C.green, C.green, 6);
  text(doc, `${model.filled} of ${model.target} target spots filled`, 658, 128, 166, 9.4, C.ink);
  text(doc, `${model.open} spots open`, 824, 128, 58, 9.4, C.ink, "Helvetica", "right");
  rule(doc, 894, 91, 894, 138, "#e6dccc");
  text(doc, `${overallPercent}%`, 900, 88, 92, 30, C.ink, "Times-Bold", "center");
  text(doc, "Overall Coverage", 900, 124, 92, 9.4, C.ink, "Helvetica", "center");

  const section = (x, y, w, label, subtitle, symbol) => {
    doc.rect(x, y, w, 50).fill(C.navy);
    doc.circle(x + 28, y + 25, 19).fill("#ffffff");
    icon(doc, symbol, x + 28, y + 25, C.navy);
    text(doc, label, x + 56, y + 7, w - 65, 18, "#ffffff", "Times-Bold");
    text(doc, subtitle, x + 56, y + 29, w - 65, 11, "#e7eef8");
  };
  const barsPanel = (x, y, w, h, label, subtitle, symbol) => {
    panel(doc, x, y, w, h, "#ffffff", C.border, 6);
    section(x, y, w, label, subtitle, symbol);
  };

  // Participation chart: five bars on a zero-based scale.
  barsPanel(22, 167, 462, 276, "Tournament Participation",
    "Number of volunteers who selected each tournament", "calendar");
  const participationMax = Math.max(5, Math.ceil(Math.max(...events.map((_, i) => countFor(i))) / 5) * 5);
  const px0 = 150, px1 = 466, chartW = px1 - px0;
  const participationTop = 234, participationBottom = 397, rowH = 32;
  events.forEach((event, i) => {
    const y = participationTop + i * rowH;
    text(doc, `${event.short}\n(${event.dateShort})`, 30, y - 1, 110, 11.5,
      C.ink, "Helvetica-Bold", "right");
    rule(doc, px0, y + 17, px1, y + 17, "#e6edf3", 0.6);
    const colors = eventColor(event, i);
    const width = chartW * countFor(i) / participationMax;
    if (width > 0) panel(doc, px0, y + 3, width, 20, colors.color, colors.color, 4);
    text(doc, countFor(i), Math.min(px0 + width + 7, px1 - 2), y + 5, 30, 14,
      C.ink, "Helvetica-Bold");
  });
  const axisY = 407;
  rule(doc, px0, axisY, px1, axisY, C.muted, 0.8);
  for (let tick = 0; tick <= participationMax; tick += 5) {
    const x = px0 + chartW * tick / participationMax;
    rule(doc, x, axisY - 3, x, axisY + 3, C.muted, 0.8);
    text(doc, tick, x - 13, axisY + 5, 26, 10, C.muted, "Helvetica", "center");
  }
  text(doc, "Number of Volunteers", px0, 428, chartW, 11, C.ink, "Helvetica", "center");

  // Coverage gap table, with capped bars and uncapped ratio labels.
  barsPanel(497, 167, 507, 276, "Coverage Gap Analysis",
    "How many more judges are needed at each tournament", "target");
  const columns = { name: 548, ratio: 671, open: 765, coverage: 841 };
  text(doc, "Tournament", columns.name, 224, 123, 11.5, C.navy, "Helvetica-Bold");
  text(doc, "Filled / Target", columns.ratio, 224, 94, 11.5, C.navy, "Helvetica-Bold", "center");
  text(doc, "Open Spots", columns.open, 224, 76, 11.5, C.navy, "Helvetica-Bold", "center");
  text(doc, "Coverage", columns.coverage, 224, 154, 11.5, C.navy, "Helvetica-Bold", "center");
  rule(doc, 508, 240, 993, 240, C.border);
  events.forEach((event, i) => {
    const y = 246 + i * 37;
    const colors = eventColor(event, i);
    const ratio = event.target ? countFor(i) / event.target : 0;
    const percent = Math.round(ratio * 100);
    doc.circle(522, y + 12, 14).fill(colors.color);
    doc.save().translate(522, y + 12).scale(.62);
    icon(doc, event.icon, 0, 0, "#ffffff");
    doc.restore();
    text(doc, event.short, columns.name, y + 6, 119, 12.5, C.ink, "Helvetica-Bold");
    text(doc, `${countFor(i)} / ${event.target}`, columns.ratio, y + 6, 94, 14,
      C.ink, "Helvetica-Bold", "center");
    text(doc, gapFor(i), columns.open, y + 6, 76, 15,
      gapFor(i) ? C.red : C.green, "Helvetica-Bold", "center");
    panel(doc, columns.coverage, y + 3, 132, 24, colors.pale, colors.pale, 4);
    text(doc, `${percent}%`, columns.coverage + 3, y + 7, 48, 13,
      colors.color, "Helvetica-Bold", "center");
    panel(doc, columns.coverage + 52, y + 7, 72, 15, "#dce5eb", "#dce5eb", 4);
    const barWidth = 72 * Math.min(1, Math.max(0, ratio));
    if (barWidth > 0) panel(doc, columns.coverage + 52, y + 7, barWidth, 15,
      colors.color, colors.color, 4);
    rule(doc, 508, y + 34, 993, y + 34, "#e7eef3", 0.6);
  });

  // Priority gaps, ranked largest to smallest and displayed against zero.
  barsPanel(22, 452, 462, 177, "Where Do We Need Judges Most?",
    "Number of additional judges needed (largest to smallest gap)", "alert");
  const rankedGaps = events.map((event, i) => ({ event, i, gap: gapFor(i) }))
    .sort((a, b) => b.gap - a.gap || a.i - b.i);
  const gapMax = Math.max(1, Math.ceil(Math.max(...rankedGaps.map(item => item.gap)) / 2) * 2);
  const gx0 = 185, gx1 = 461, gapW = gx1 - gx0;
  rankedGaps.forEach(({ event, i, gap }, row) => {
    const y = 509 + row * 21;
    text(doc, `${event.short} (${event.dateShort})`, 30, y + 2, 146, 11,
      C.ink, "Helvetica-Bold", "right");
    const colors = eventColor(event, i);
    const width = gapW * gap / gapMax;
    if (width > 0) panel(doc, gx0, y, width, 14, colors.color, colors.color, 3);
    text(doc, gap, Math.min(gx0 + width + 6, gx1 - 3), y + 1, 24, 12.5,
      gap ? colors.color : C.ink, "Helvetica-Bold");
  });
  const gapAxisY = 616;
  rule(doc, gx0, gapAxisY, gx1, gapAxisY, C.muted, 0.8);
  for (let tick = 0, step = Math.max(1, Math.ceil(gapMax / 4)); tick <= gapMax; tick += step) {
    const x = gx0 + gapW * tick / gapMax;
    rule(doc, x, gapAxisY - 2, x, gapAxisY + 2, C.muted, 0.7);
    text(doc, Math.round(tick), x - 11, gapAxisY + 3, 22, 7.5, C.muted, "Helvetica", "center");
  }

  // Model-derived takeaways and actionable outreach message.
  barsPanel(497, 452, 507, 177, "Key Takeaways & Next Steps",
    "Prioritize outreach to close the remaining coverage gaps", "info");
  takeaways().forEach((value, i) => {
    const y = 508 + i * 23;
    doc.circle(523, y + 6, 10.5).fill(C.gold);
    text(doc, i + 1, 515, y - 1, 16, 12, C.navy, "Helvetica-Bold", "center");
    text(doc, value, 544, y - 1, 443, 12, C.ink, "Helvetica-Bold");
  });
  footer(doc, 4, "Season Overview & Next Steps");
}

  return renderAnalysisPages;
});