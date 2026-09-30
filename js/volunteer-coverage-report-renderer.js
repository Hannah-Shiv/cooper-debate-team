(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CooperVolunteerCoverageReportRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

const renderAnalysisPages = typeof module === "object" && module.exports
  ? require("./volunteer-coverage-report-analysis-pages.js")
  : root.CooperVolunteerCoverageAnalysisPages;

let artworkResolver = name => name;
function setArtworkResolver(resolver) {
  artworkResolver = resolver;
}
const ART = name => artworkResolver(name);
const LOGICAL_TO_PHYSICAL = 528 / 683;
// Work in reference-image coordinates so the PDF retains the reference's 3:2 aspect ratio.
const W = 1024;
const H = 683;
const C = {
  navy: "#071d4c", deep: "#041432", ink: "#08183e", blue: "#0f60d6",
  green: "#087d58", gold: "#f4bd2e", red: "#ce152b", cyan: "#077392",
  paper: "#ffffff", pale: "#f2f8fd", border: "#d5e6f0", muted: "#445873",
  paleGreen: "#e8f8f1", paleGold: "#fff8e7", paleRed: "#fff0f2",
};

function text(doc, value, x, y, width, size = 11, color = C.ink, font = "Helvetica", align = "left") {
  const content = String(value);
  doc.fillColor(color).font(font).fontSize(size);
  const measured = Math.max(...content.split("\n").map(line => doc.widthOfString(line)));
  if (measured > width) doc.fontSize(size * width / measured * .985);
  doc.text(content, x, y, { width, align, lineBreak: false });
}

function wouldShrinkBelowSevenPoints(doc, value, width, size, font) {
  doc.font(font).fontSize(size);
  const measured = Math.max(...String(value).split("\n").map(line => doc.widthOfString(line)));
  return measured > width && size * width / measured * .985 * LOGICAL_TO_PHYSICAL < 7;
}

function wrapMeasured(doc, value, width, font, size) {
  doc.font(font).fontSize(size);
  const lines = [];
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (doc.widthOfString(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    for (const character of word) {
      if (line && doc.widthOfString(line + character) > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function ellipsizeAtWidth(doc, value, width, size, font) {
  doc.font(font).fontSize(size);
  const suffix = "…";
  const characters = Array.from(String(value));
  while (characters.length && doc.widthOfString(`${characters.join("")}${suffix}`) > width) {
    characters.pop();
  }
  return characters.length ? `${characters.join("")}${suffix}` : suffix;
}

let appendixNames = new WeakSet();
function compactName(doc, person, width, size, font) {
  return appendixNames.has(person)
    ? ellipsizeAtWidth(doc, person.name, width, size, font)
    : person.name;
}

function panel(doc, x, y, w, h, fill, border = C.border, radius = 6, thickness = 1) {
  doc.lineWidth(thickness).roundedRect(x, y, w, h, radius).fillAndStroke(fill, border);
}

function rule(doc, x1, y1, x2, y2, color = C.border, weight = 1) {
  doc.lineWidth(weight).strokeColor(color).moveTo(x1, y1).lineTo(x2, y2).stroke();
}

function beginPage(doc) {
  doc.addPage({ size: [792, 528], margin: 0 });
  doc.scale(792 / W, 528 / H);
  // Text flow checks must use logical coordinates, not the scaled MediaBox.
  // The actual PDF page dictionary remains the reference's 792 × 528 points.
  doc.page.width = W;
  doc.page.height = H;
  doc.rect(0, 0, W, H).fill(C.paper);
}

function icon(doc, name, x, y, color = C.navy) {
  doc.save().translate(x, y).strokeColor(color).fillColor(color).lineWidth(2.6);
  switch (name) {
    case "people":
      for (const [px, py, r] of [[-11, -7, 5], [0, -11, 6], [11, -7, 5]]) doc.circle(px, py, r).fill();
      doc.roundedRect(-19, 2, 14, 12, 6).fill();
      doc.roundedRect(-9, -1, 18, 17, 8).fill();
      doc.roundedRect(5, 2, 14, 12, 6).fill();
      break;
    case "calendar":
      doc.roundedRect(-16, -14, 32, 28, 3).stroke();
      rule(doc, -16, -6, 16, -6, color, 2);
      rule(doc, -9, -18, -9, -11, color, 2.5);
      rule(doc, 9, -18, 9, -11, color, 2.5);
      doc.moveTo(-6, 2).lineTo(-1, 7).lineTo(9, -3).stroke();
      break;
    case "target":
      for (const r of [16, 10, 4]) doc.circle(0, 0, r).stroke();
      rule(doc, 0, 0, 17, -16, color, 3);
      break;
    case "trophy":
      doc.moveTo(-13, -13).lineTo(13, -13).lineTo(10, -1)
        .bezierCurveTo(8, 6, -8, 6, -10, -1).closePath().fill();
      doc.circle(-13, -7, 7).stroke();
      doc.circle(13, -7, 7).stroke();
      doc.rect(-2, 5, 4, 8).fill();
      doc.roundedRect(-11, 12, 22, 3, 1).fill();
      break;
    case "building":
      doc.moveTo(-16, -9).lineTo(0, -16).lineTo(16, -9).closePath().fill();
      doc.rect(-13, -6, 26, 18).stroke();
      for (const dx of [-8, 0, 8]) doc.rect(dx - 2, -4, 4, 14).fill();
      doc.rect(-17, 12, 34, 3).fill();
      break;
    case "book":
      doc.moveTo(0, -9).bezierCurveTo(-4, -13, -12, -14, -17, -11)
        .lineTo(-17, 10).bezierCurveTo(-10, 8, -3, 9, 0, 13).closePath().stroke();
      doc.moveTo(0, -9).bezierCurveTo(5, -13, 12, -14, 17, -11)
        .lineTo(17, 10).bezierCurveTo(10, 8, 3, 9, 0, 13).closePath().stroke();
      rule(doc, 0, -9, 0, 13, color, 2);
      break;
    case "laptop":
      doc.roundedRect(-16, -12, 32, 22, 2).stroke();
      doc.moveTo(-20, 13).lineTo(20, 13).lineTo(15, 17).lineTo(-15, 17).closePath().fill();
      break;
    case "star":
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? 8 : 18;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (!i) doc.moveTo(px, py); else doc.lineTo(px, py);
      }
      doc.closePath().fill();
      break;
    case "bars":
      for (const [dx, h] of [[-14, 9], [-3, 17], [8, 27]]) doc.rect(dx, 14 - h, 7, h).fill();
      break;
    case "bulb":
      doc.circle(0, -5, 12).fillAndStroke(C.gold, C.navy);
      doc.fillColor(C.gold).rect(-6, 3, 12, 11).fill();
      rule(doc, -7, 10, 7, 10, C.navy, 2);
      rule(doc, -7, 15, 7, 15, C.navy, 2);
      rule(doc, -4, 18, 4, 18, C.navy, 2);
      break;
    case "alert":
      doc.circle(0, 0, 17).fill();
      text(doc, "!", -8, -16, 16, 28, "#ffffff", "Helvetica-Bold", "center");
      break;
    case "check":
      doc.circle(0, 0, 17).fill();
      doc.strokeColor("#ffffff").lineWidth(3.6).moveTo(-8, 0).lineTo(-2, 6).lineTo(9, -7).stroke();
      break;
    case "info":
      doc.circle(0, 0, 17).fill();
      text(doc, "i", -9, -16, 18, 27, "#ffffff", "Times-Bold", "center");
      break;
    default:
      doc.circle(0, 0, 15).stroke();
  }
  doc.restore();
}

function header(doc, height) {
  const gradient = doc.linearGradient(0, 0, W, height);
  gradient.stop(0, "#031a42").stop(.48, "#04366a").stop(1, "#02193c");
  doc.rect(0, 0, W, height).fill(gradient);
  doc.save().fillOpacity(.3).fillColor("#1078b2");
  doc.moveTo(15, 0).lineTo(350, 0).lineTo(115, height - 3).lineTo(0, height - 3).closePath().fill();
  doc.moveTo(670, 0).lineTo(850, 0).lineTo(712, height - 3).lineTo(460, height - 3).closePath().fill();
  doc.moveTo(760, 0).lineTo(958, 0).lineTo(754, height - 2).lineTo(710, height - 2).closePath().fill();
  doc.restore();
  doc.save().fillOpacity(.85).fillColor(C.gold)
    .moveTo(793, height - 3).lineTo(910, 0).lineTo(932, 0)
    .lineTo(834, height - 3).closePath().fill();
  doc.restore();
  doc.rect(0, height - 3, W, 3).fill(C.gold);
  const compact = height < 70;
  doc.image(ART("cooper-debate-badge.png"), compact ? 41 : 32, compact ? 1 : 2,
    { fit: compact ? [73, 55] : [89, 72] });
  doc.image(ART("cooper-jaguar-mark.png"), compact ? 925 : 919, compact ? 1 : 3,
    { fit: compact ? [67, 54] : [75, 70] });
  text(doc, "Cooper Debate Team", 320, compact ? 0 : 2, 392,
    compact ? 39 : 43, "#ffffff", "GreatVibes", "center");
  text(doc, "S P E A K   ·   R E A S O N   ·   L E A D", 355, compact ? 34 : 46, 321,
    compact ? 8 : 9, C.gold, "Helvetica-Bold", "center");
  text(doc, "C O O P E R  M I D D L E  S C H O O L   ·   M C L E A N,  V I R G I N I A",
    344, compact ? 46 : 61, 347, compact ? 6.5 : 7, "#e5effc", "Helvetica", "center");
}

function title(doc, y, name, eyebrow, subline, options = {}) {
  const h = options.height || 72;
  const gradient = doc.linearGradient(0, y, 0, y + h);
  gradient.stop(0, "#075ba4").stop(.4, "#051b50").stop(1, "#040e31");
  panel(doc, 26, y, 78, h, gradient, C.border, 5);
  doc.image(ART("judge-confirmation-gavel.png"), 39, y + (h - 51) / 2, { fit: [51, 51] });
  text(doc, eyebrow, 125, y + 2, 516, 12, C.ink, "Helvetica-Bold");
  text(doc, name, 124, y + 19, options.titleWidth || 531, options.fontSize || 35,
    C.ink, "Times-Bold");
  text(doc, subline, 125, y + 59, options.subtitleWidth || 527, options.subtitleSize || 10.2,
    C.navy, "Helvetica-Bold");
}

function footer(doc, page, name, sampleData = true, totalPages = 4) {
  rule(doc, 22, 638, 1004, 638, C.border, 1);
  text(doc, `${page} / ${totalPages}   ·   ${name.toUpperCase()}${sampleData ? "   ·   TEST DATA" : ""}`,
    670, 647, 332, 7.8, C.navy, "Helvetica-Bold", "right");
  doc.fillColor("#d7effa").moveTo(0, 660).bezierCurveTo(200, 668, 380, 655, 1024, 661)
    .lineTo(1024, H).lineTo(0, H).closePath().fill();
  doc.fillColor(C.gold).moveTo(0, 662).bezierCurveTo(210, 678, 470, 671, 1024, 664)
    .lineTo(1024, 667).bezierCurveTo(470, 674, 210, 681, 0, 665).closePath().fill();
  doc.fillColor("#04377a").moveTo(0, 666).bezierCurveTo(160, 680, 430, 677, 1024, 667)
    .lineTo(1024, H).lineTo(0, H).closePath().fill();
  doc.fillColor("#062052").moveTo(0, 677).bezierCurveTo(245, 682, 575, 679, 1024, 675)
    .lineTo(1024, H).lineTo(0, H).closePath().fill();
}

function metric(doc, x, y, w, number, name, detail, iconName, color, fill) {
  panel(doc, x, y, w, 84, fill, C.border);
  doc.circle(x + 30, y + 40, 26).fill("#ffffff");
  icon(doc, iconName, x + 30, y + 40, color);
  text(doc, number, x + 61, y + 11, w - 67, 28, color, "Times-Bold");
  text(doc, name, x + 61, y + 43, w - 66, name === "TOTAL TARGET SPOTS" ? 7.7 : 9.6,
    C.ink, "Helvetica-Bold");
  text(doc, detail, x + 61, y + 62, w - 66, name === "TOTAL TARGET SPOTS" ? 7.6 : 8.6, C.muted);
}

function coverageCard(doc, event, index, model) {
  const x = 22 + index * 198, y = 279, w = 190, h = 218;
  const count = model.counts[index], gap = Math.max(0, event.target - count);
  const fg = index === 2 ? C.ink : "#ffffff";
  panel(doc, x, y, w, h, event.pale, C.border, 5);
  panel(doc, x + 1, y + 1, w - 2, 109, event.color, event.color, 4);
  doc.circle(x + 29, y + 31, 22).fill(index === 2 ? C.navy : event.color);
  doc.lineWidth(1).strokeColor(fg).circle(x + 29, y + 31, 23).stroke();
  icon(doc, event.icon, x + 29, y + 31, "#ffffff");
  text(doc, event.short, x + 58, y + 22, w - 63, index === 4 ? 15.5 : 17,
    fg, "Times-Bold");
  doc.save().translate(x + 20, y + 76).scale(.3);
  icon(doc, "calendar", 0, 0, fg);
  doc.restore();
  text(doc, event.date, x + 34, y + 69, w - 41, 10.2, fg);
  doc.lineWidth(1.5).strokeColor(fg).circle(x + 20, y + 96, 4).stroke();
  text(doc, event.venue, x + 34, y + 90, w - 42, 9.8, fg);
  const stats = [[count, "Filled", count >= event.target ? C.green : C.ink],
    [gap, "Open", C.red], [event.target, "Target", C.ink]];
  stats.forEach(([value, label, color], i) => {
    const sx = x + 10 + i * 59;
    text(doc, value, sx, y + 120, 51, 22, color, "Times-Bold", "center");
    text(doc, label, sx, y + 147, 51, 10, color, "Helvetica", "center");
    if (i < 2) rule(doc, sx + 55, y + 120, sx + 55, y + 158, C.border);
  });
  panel(doc, x + 10, y + 169, w - 20, 15, "#dce8ee", "#dce8ee", 4);
  if (count) panel(doc, x + 10, y + 169, (w - 20) * Math.min(1, count / event.target),
    15, event.color, event.color, 4);
  text(doc, `${Math.round(count / event.target * 100)}% covered`, x + 18, y + 193,
    w - 36, 11, event.color, "Helvetica-Bold", "center");
}

function overviewBottom(doc, model) {
  const { events, counts, filled, target, open } = model;
  const gaps = events.map((event, i) => ({ ...event, gap: Math.max(0, event.target - counts[i]) }))
    .sort((a, b) => b.gap - a.gap);
  panel(doc, 22, 508, 515, 106, C.paleRed, "#f0d7db");
  icon(doc, "alert", 51, 536, C.red);
  text(doc, "Needs Attention", 93, 518, 405, 23, "#9b0921", "Times-Bold");
  text(doc, open ? `${gaps[0].short} and ${gaps[1].short} have the largest gaps.` : "All five tournaments meet their coverage targets.",
    93, 553, 420, 12, C.ink);
  text(doc, open ? "Prioritize outreach for those tournaments." : "Thank you to all of our volunteer judges!",
    93, 577, 420, 12, C.ink);
  panel(doc, 545, 508, 459, 106, "#f2f8fd", C.border);
  icon(doc, "bulb", 573, 533, C.gold);
  text(doc, "Key Takeaways", 607, 519, 381, 22, C.ink, "Times-Bold");
  const takeaways = [
    `Overall season coverage is ${Math.round(filled / target * 100)}% (${filled} of ${target} spots filled).`,
    open ? `${gaps[1].short} and ${gaps[0].short} need the most support.` : "All tournaments meet their targets.",
    `A total of ${open} judge spots still need to be filled.`,
  ];
  takeaways.forEach((value, i) => {
    doc.circle(613, 554 + i * 23, 10).fill(C.navy);
    text(doc, i + 1, 603, 547 + i * 23, 20, 12, "#ffffff", "Helvetica-Bold", "center");
    text(doc, value, 632, 548 + i * 23, 360, 11.2, C.ink);
  });
}

function overview(doc, model) {
  const { events, volunteers, selections, target, filled, open, seasonLabel } = model;
  const sameTarget = events.every(event => event.target === events[0].target);
  beginPage(doc);
  header(doc, 77);
  title(doc, 88, "Judge Volunteer Coverage", `${seasonLabel} SEASON · JUDGE INFORMATION`,
    sameTarget ? `FIVE TOURNAMENT DATES · TARGET: ${events[0].target} JUDGES EACH`
      : `FIVE TOURNAMENT DATES · ${target} TOTAL TARGET SPOTS`);
  panel(doc, 659, 88, 344, 77, C.paleGold, "#f1e7cf");
  text(doc, "Season Progress", 672, 98, 182, 12, C.ink, "Helvetica-Bold");
  panel(doc, 672, 118, 227, 14, "#d7dce2", "#d7dce2", 6);
  if (filled) panel(doc, 672, 118, 227 * filled / target, 14, "#00a270", "#00a270", 6);
  text(doc, `${filled} of ${target} target spots filled`, 672, 142, 165, 10.3, C.ink);
  text(doc, `${open} spots open`, 830, 142, 71, 10, C.ink, "Helvetica", "right");
  rule(doc, 912, 98, 912, 151, "#e6dccc");
  text(doc, `${Math.round(filled / target * 100)}%`, 915, 98, 81, 34, C.ink, "Times-Bold", "center");
  text(doc, "Overall Coverage", 914, 141, 84, 9.7, C.ink, "Helvetica", "center");
  const metrics = [
    [volunteers.length, "VOLUNTEERS", "Unique signups", "people", C.navy, C.pale],
    [selections, "DATE SELECTIONS", "Across five dates", "calendar", C.navy, C.pale],
    [target, "TOTAL TARGET SPOTS", sameTarget ? `${events[0].target} judges per tournament` : "Across five dates",
      "target", C.navy, C.pale],
    [filled, "FILLED SPOTS", "Across the season", "people", C.green, C.paleGreen],
    [open, "OPEN SPOTS", "Across the season", "people", C.red, C.paleRed],
    [events.length, "TOURNAMENTS", `${seasonLabel} season`, "trophy", C.navy, C.pale],
  ];
  metrics.forEach(([number, name, detail, symbol, color, fill], i) =>
    metric(doc, 22 + 165 * i, 182, 156, number, name, detail, symbol, color, fill));
  events.forEach((event, i) => coverageCard(doc, event, i, model));
  overviewBottom(doc, model);
  footer(doc, 1, "Judge Volunteer Coverage", model.sampleData, model.pageCount);
}

function rosterHeaderMetric(doc, x, w, number, name, detail, symbol, color = C.navy) {
  panel(doc, x, 94, w, 69, C.pale, C.border);
  doc.circle(x + 28, 129, 23).fill("#e4edf8");
  icon(doc, symbol, x + 28, 129, color);
  text(doc, number, x + 55, 103, w - 60, 25, color, "Times-Bold");
  text(doc, name, x + 55, 133, w - 60, 8.6, C.ink);
  if (detail) text(doc, detail, x + 55, 145, w - 60, 8.2, C.muted);
}

function rosterTable(doc, model) {
  const { events, volunteers, selections, counts } = model;
  const displayedVolunteers = volunteers.slice(0, 25);
  const x = 18, y = 177, widths = [38, 202, 119, 119, 119, 119, 119, 154];
  const pos = [x];
  for (const w of widths) pos.push(pos.at(-1) + w);
  panel(doc, x, y, 989, 405, "#ffffff", C.border, 4);
  const colors = [C.deep, C.deep, ...events.map(event => event.color), "#092955"];
  widths.forEach((w, i) => doc.rect(pos[i], y, w, 44).fill(colors[i]));
  text(doc, "#", pos[0], y + 15, widths[0], 13, "#ffffff", "Helvetica-Bold", "center");
  text(doc, "Parent Volunteer", pos[1] + 12, y + 14, widths[1] - 18, 13, "#ffffff", "Helvetica-Bold");
  events.forEach((event, i) => {
    const fg = i === 2 ? C.ink : "#ffffff";
    text(doc, event.short, pos[i + 2] + 1, y + 5, widths[i + 2] - 2,
      i === 4 ? 11 : 12, fg, "Helvetica-Bold", "center");
    text(doc, event.dateShort, pos[i + 2], y + 25, widths[i + 2],
      11, fg, "Helvetica-Bold", "center");
  });
  text(doc, "Dates Selected", pos[7], y + 6, widths[7], 12.5, "#ffffff", "Helvetica-Bold", "center");
  text(doc, "(Out of 5)", pos[7], y + 26, widths[7], 11, "#ffffff", "Helvetica", "center");
  const rowY = 221, rowH = Math.min(27, 315 / Math.max(1, displayedVolunteers.length));
  const fontSize = Math.min(12.5, rowH * .59);
  displayedVolunteers.forEach((person, i) => {
    const ry = rowY + i * rowH;
    doc.rect(x, ry, 989, rowH).fill(i % 2 ? "#e9f4fc" : "#ffffff");
    for (let c = 1; c < widths.length; c++) rule(doc, pos[c], ry, pos[c], ry + rowH, "#dce9f2", .55);
    text(doc, i + 1, pos[0], ry + 4, widths[0], fontSize, C.ink, "Helvetica", "center");
    text(doc, compactName(doc, person, widths[1] - 22, fontSize, "Helvetica-Bold"),
      pos[1] + 12, ry + 4, widths[1] - 22, fontSize, C.ink, "Helvetica-Bold");
    events.forEach((_, ei) => {
      const cx = pos[ei + 2] + widths[ei + 2] / 2;
      const cy = ry + rowH / 2;
      if (person.dates.includes(ei)) doc.circle(cx, cy, Math.min(5.3, rowH * .24)).fill(events[ei].color);
      else doc.lineWidth(1).strokeColor("#9aacb8").circle(cx, cy, 4.6).stroke();
    });
    text(doc, `${person.dates.length} of 5`, pos[7] + 9, ry + 4, 52, fontSize, C.ink, "Helvetica-Bold");
    panel(doc, pos[7] + 66, ry + rowH / 2 - 4, 78, 8, "#d6e5f2", "#d6e5f2", 3);
    if (person.dates.length) panel(doc, pos[7] + 66, ry + rowH / 2 - 4,
      78 * person.dates.length / events.length, 8, "#0861bf", "#0861bf", 3);
  });
  const ty = 536;
  doc.rect(x, ty, 989, 46).fill("#e2f2fd");
  text(doc, "Total Volunteers by Date", x + 10, ty + 16, 223, 13, C.navy, "Helvetica-Bold");
  counts.forEach((n, i) => {
    doc.rect(pos[i + 2], ty, widths[i + 2], 46).fill(events[i].pale);
    text(doc, n, pos[i + 2], ty + 12, widths[i + 2], 22,
      i === 2 ? C.ink : events[i].color, "Times-Bold", "center");
  });
  text(doc, selections, pos[7], ty + 4, widths[7], 23, C.ink, "Times-Bold", "center");
  text(doc, "(total selections)", pos[7], ty + 30, widths[7], 9.6, C.ink, "Helvetica", "center");
  rule(doc, x, 582, 1007, 582, C.border, 1);
}

function roster(doc, model) {
  const { events, volunteers, selections, seasonLabel } = model;
  beginPage(doc);
  header(doc, 77);
  title(doc, 92, "Volunteer Roster", `${seasonLabel} SEASON · INDIVIDUAL SIGNUPS`,
    `${volunteers.length} PEOPLE · ${selections} SELECTED DATES (OUT OF ${volunteers.length * events.length} TOTAL POSSIBLE)`,
    { subtitleWidth: 450, subtitleSize: 10 });
  rosterHeaderMetric(doc, 585, 135, volunteers.length, "Total Volunteers", "", "people");
  rosterHeaderMetric(doc, 728, 135, selections, "Total Date", "Selections", "calendar");
  rosterHeaderMetric(doc, 871, 136, volunteers.length ? (selections / volunteers.length).toFixed(1) : "0.0",
    "Average Dates", "Per Volunteer", "bars");
  rosterTable(doc, model);
  footer(doc, 2, "Volunteer Roster", model.sampleData, model.pageCount);
}

function renderAppendices(doc, model) {
  const { volunteers, events } = model;
  const footerPage = (page, name) => footer(doc, page, name, model.sampleData, model.pageCount);
  let page = 5;
  const drawAppendixPage = (titleText, subtitle) => {
    beginPage(doc);
    header(doc, 77);
    title(doc, 84, titleText, `${model.seasonLabel} SEASON · APPENDIX`,
      subtitle, { fontSize: 27, titleWidth: 720, subtitleWidth: 850, height: 67 });
    return page++;
  };
  const startY = 177;
  const lineHeight = 13;
  const rowsPerPage = 30;

  for (let offset = 25; offset < volunteers.length; offset += rowsPerPage) {
    const entries = volunteers.slice(offset, offset + rowsPerPage);
    const pageNumber = drawAppendixPage("Volunteer Roster Continuation",
      `ALL REMAINING VOLUNTEERS · ${model.volunteers.length} PEOPLE TOTAL`);
    panel(doc, 22, startY, 980, 423, "#ffffff", C.border, 5);
    text(doc, "No.", 34, startY + 12, 40, 11, C.navy, "Helvetica-Bold");
    text(doc, "Parent Volunteer", 82, startY + 12, 260, 11, C.navy, "Helvetica-Bold");
    text(doc, "Tournament Dates Selected", 365, startY + 12, 615, 11, C.navy, "Helvetica-Bold");
    rule(doc, 32, startY + 31, 992, startY + 31, C.border);
    entries.forEach((person, index) => {
      const y = startY + 37 + index * lineHeight;
      if (index % 2 === 0) doc.rect(29, y - 2, 966, lineHeight).fill("#f1f7fb");
      text(doc, offset + index + 1, 34, y, 40, 9.5, C.muted);
      text(doc, compactName(doc, person, 260, 9.5, "Helvetica-Bold"),
        82, y, 260, 9.5, C.ink, "Helvetica-Bold");
      const dates = person.dates.map(dateIndex => events[dateIndex].short).join(", ") || "No dates selected";
      text(doc, dates, 365, y, 615, 9.2, C.ink);
    });
    footerPage(pageNumber, "Volunteer Roster Continuation");
  }

  const eventRowsPerPage = 21;
  const eventCoreLimit = volunteers.length > 25 ? 18 : 25;
  events.forEach((event, eventIndex) => {
    const signups = volunteers.filter(person => person.dates.includes(eventIndex));
    for (let offset = eventCoreLimit; offset < signups.length; offset += eventRowsPerPage) {
      const entries = signups.slice(offset, offset + eventRowsPerPage);
      const pageNumber = drawAppendixPage(`${event.short} Signup List Continuation`,
        `${event.date.toUpperCase()} · ${event.venue.toUpperCase()} · ${signups.length} VOLUNTEERS TOTAL`);
      panel(doc, 22, startY, 980, 423, "#ffffff", C.border, 5);
      text(doc, "No.", 36, startY + 12, 48, 11, C.navy, "Helvetica-Bold");
      text(doc, "Parent Volunteer", 94, startY + 12, 420, 11, C.navy, "Helvetica-Bold");
      text(doc, "Tournament", 550, startY + 12, 420, 11, C.navy, "Helvetica-Bold");
      rule(doc, 32, startY + 31, 992, startY + 31, C.border);
      entries.forEach((person, index) => {
        const y = startY + 37 + index * 16;
        if (index % 2 === 0) doc.rect(29, y - 2, 966, 16).fill("#f1f7fb");
        text(doc, offset + index + 1, 36, y, 48, 10, C.muted);
        text(doc, compactName(doc, person, 420, 10, "Helvetica-Bold"),
          94, y, 420, 10, C.ink, "Helvetica-Bold");
        text(doc, `${event.short} · ${event.date}`, 550, y, 420, 10, C.ink);
      });
      footerPage(pageNumber, `${event.short} Signup List Continuation`);
    }
  });
}

function findUnreadableNames(doc, model) {
  const unreadable = new WeakSet();
  const displayedVolunteers = model.volunteers.slice(0, 25);
  const rosterRowHeight = Math.min(27, 315 / Math.max(1, displayedVolunteers.length));
  const rosterFontSize = Math.min(12.5, rosterRowHeight * .59);
  displayedVolunteers.forEach(person => {
    if (wouldShrinkBelowSevenPoints(doc, person.name, 180, rosterFontSize, "Helvetica-Bold")) {
      unreadable.add(person);
    }
  });

  model.volunteers.slice(25).forEach(person => {
    if (wouldShrinkBelowSevenPoints(doc, person.name, 238, 9.5, "Helvetica-Bold")) unreadable.add(person);
  });

  const eventCoreLimit = model.volunteers.length > 25 ? 18 : 25;
  model.events.forEach((_, eventIndex) => {
    const signups = model.volunteers.filter(person => person.dates.includes(eventIndex))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    signups.slice(0, eventCoreLimit).forEach(person => {
      const width = eventIndex === 0 ? 132 : 85;
      const size = eventIndex === 4 ? 12.5 : 16;
      if (wouldShrinkBelowSevenPoints(doc, person.name, width, size, "Helvetica")) unreadable.add(person);
    });
    signups.slice(eventCoreLimit).forEach(person => {
      if (wouldShrinkBelowSevenPoints(doc, person.name, 404, 10, "Helvetica-Bold")) unreadable.add(person);
    });
  });
  return unreadable;
}

function nameAppendixLines(doc, people, events) {
  const lines = [];
  people.forEach((person, index) => {
    if (index) lines.push({ text: "", font: "Helvetica", size: 9.5 });
    wrapMeasured(doc, person.name, 956, "Helvetica-Bold", 11)
      .forEach(line => lines.push({ text: line, font: "Helvetica-Bold", size: 11, color: C.ink }));
    const dates = person.dates.length
      ? `Selected dates: ${person.dates.map(dateIndex =>
        `${events[dateIndex].short} — ${events[dateIndex].date}`).join("; ")}`
      : "Selected dates: None";
    wrapMeasured(doc, dates, 956, "Helvetica", 10)
      .forEach(line => lines.push({ text: line, font: "Helvetica", size: 10, color: C.muted }));
  });
  return lines;
}

function renderNameAppendices(doc, model, lines, startPage) {
  const linesPerPage = 31;
  const lineHeight = 13;
  const pageCount = Math.ceil(lines.length / linesPerPage);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    beginPage(doc);
    header(doc, 77);
    title(doc, 84, "Volunteer Name Readability Appendix",
      `${model.seasonLabel} SEASON · FULL PUBLIC NAMES`,
      "COMPLETE NAMES AND THEIR SELECTED TOURNAMENT DATES",
      { fontSize: 25, titleWidth: 720, subtitleWidth: 850, height: 67 });
    panel(doc, 22, 171, 980, 445, "#ffffff", C.border, 5);
    lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage).forEach((line, index) => {
      if (!line.text) return;
      doc.fillColor(line.color || C.ink).font(line.font).fontSize(line.size)
        .text(line.text, 34, 185 + index * lineHeight, { width: 956, lineBreak: false });
    });
    footer(doc, startPage + pageIndex, "Volunteer Name Readability Appendix",
      model.sampleData, model.pageCount);
  }
  return pageCount;
}

function renderCoverageReport(doc, model, options = {}) {
  if (options.artworkResolver) setArtworkResolver(options.artworkResolver);
  if (options.scriptFont) doc.registerFont("GreatVibes", options.scriptFont);
  appendixNames = findUnreadableNames(doc, model);
  const affectedPeople = model.volunteers.filter(person => appendixNames.has(person));
  const fullNameLines = nameAppendixLines(doc, affectedPeople, model.events);
  const nameAppendixPages = Math.ceil(fullNameLines.length / 31);
  model.nameAppendixPages = nameAppendixPages;
  model.pageCount = 4 + model.appendixPages + nameAppendixPages;
  overview(doc, model);
  roster(doc, model);
  renderAnalysisPages(doc, {
    C, W, H, text, panel, rule, icon, header, title, beginPage,
    readableName: (person, width, size, font) => compactName(doc, person, width, size, font),
    footer: (document, page, name) => footer(document, page, name, model.sampleData, model.pageCount),
  }, model);
  renderAppendices(doc, model);
  renderNameAppendices(doc, model, fullNameLines, 5 + model.appendixPages);
}

return { renderCoverageReport, setArtworkResolver };
});