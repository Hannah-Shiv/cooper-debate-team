const crypto = require("node:crypto");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { FieldValue } = require("firebase-admin/firestore");

const SENDER = "Cooper Debate Team <admin@cooperdebateteam.com>";
const TIME_ZONE = "America/New_York";
const TOURNAMENT_PAGE_URL = "https://cooperdebateteam.com/tournaments.html";
const STALE_SEND_MS = 10 * 60 * 1000;
const APPROVED_MEAL_ITEMS = Object.freeze([
  "A complimentary lunch will be provided for all judges.",
  "Light refreshments (coffee, water, snacks) will be available throughout the day.",
  "Please let us know about any dietary restrictions in advance if possible.",
]);
const APPROVED_MEAL_INFO = APPROVED_MEAL_ITEMS.join(" ");
const APPROVED_RESOLUTION = "The United States federal government should substantially restrict the development and/or use of hyperscale data centers in the United States.";
const APPROVED_EXPECTATIONS = Object.freeze([
  "You will be assigned to multiple rounds throughout the day.",
  "Each round is about a 60-minute session, followed by a short feedback period.",
  "You will evaluate constructive speeches, crossfire, and rebuttals using a provided ballot.",
  "Coaches and student volunteers will be available to answer questions and provide support.",
  "You may be paired with another judge for certain rounds.",
]);
const APPROVED_ARRIVAL = Object.freeze([
  "Please arrive early, 8:00 AM for check-in.",
  "Enter through the main entrance from the parking lot.",
  "Check in at the Judge Registration table in the lobby.",
  "Parking is available in the main school parking lot.",
  "Look for signage and student volunteers if you need assistance.",
]);
const APPROVED_IMPORTANT_INFORMATION = Object.freeze([
  "Tournament schedule and judge pairings will be provided at check-in.",
  "This is a middle school tournament. Rounds may include novice debaters.",
  "Be prepared for a day of thoughtful discussion, engaged students, and great debates!",
  "If you have questions during the event, please ask a coach or tournament volunteer.",
]);
const APPROVED_CONTACT = Object.freeze([
  "If you have questions before the tournament, please contact:",
  "Coach Pamela Konde · pgkonde@fcps.edu",
  "On tournament day, look for a coach or any student volunteer — we're here to help!",
]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeIcs(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function displayDate(date) {
  if (!validDate(date)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function confirmationPdfFilename(event) {
  const tournamentName = (cleanText(event.title, 160) || "Tournament")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const match = String(event.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `Judge_Volunteer_For_${tournamentName}_On_Date_To_Be_Announced.pdf`;
  const [, year, monthValue, dayValue] = match;
  const day = Number(dayValue);
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? "th"
    : ({ 1:"st", 2:"nd", 3:"rd" }[day % 10] || "th");
  const month = new Intl.DateTimeFormat("en-US", { month:"long", timeZone:"UTC" })
    .format(new Date(Date.UTC(Number(year), Number(monthValue) - 1, day)));
  return `Judge_Volunteer_For_${tournamentName}_On_${month}_${day}${suffix}_${year}.pdf`;
}

function displayTime(time) {
  if (!validTime(time)) return "";
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
}

function timeRange(startTime, endTime) {
  const start = displayTime(startTime);
  const end = displayTime(endTime);
  return start && end ? `${start}–${end}` : start || end || "";
}

function publicEventLink(event) {
  try {
    const url = new URL(event.invitationUrl || "");
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch (_) {
    // Fall through to the public tournament page.
  }
  return TOURNAMENT_PAGE_URL;
}

function datePlusDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function todayInEasternTime() {
  const pieces = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    pieces.filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function roleForSignup(event, signup) {
  const roles = Array.isArray(event.roles) ? event.roles : [];
  const matchingRole = roles.find(role => cleanText(role.id, 80) === signup.roleId);
  return cleanText(matchingRole && matchingRole.label, 100) ||
    cleanText(signup.roleLabel, 100) || "Volunteer judge";
}

function coachContact(event) {
  const parts = [
    cleanText(event.coachName, 120),
    cleanText(event.coachEmail, 160),
    cleanText(event.coachPhone, 40),
  ].filter(Boolean);
  return parts.join(" · ");
}

function eventSummary(event, signup, useApprovedOnePager = false) {
  const rows = [
    ["Tournament", cleanText(event.title, 160)],
    ["Date", displayDate(event.date)],
    ["Tournament hours", timeRange(event.startTime, event.endTime)],
    ["Your availability", timeRange(signup.availabilityStart, signup.availabilityEnd)],
    ["Your role", roleForSignup(event, signup)],
    ["Location", cleanText(event.location, 200)],
    ["Address", cleanText(event.address, 240)],
    ["Meals", APPROVED_MEAL_INFO],
    ["Topic / resolution", useApprovedOnePager ? APPROVED_RESOLUTION : cleanText(event.resolution, 900)],
    ["Coach contact", useApprovedOnePager ? APPROVED_CONTACT[1] : coachContact(event)],
  ].filter(([, value]) => value);
  return rows;
}

function rowsAsText(rows) {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function rowsAsHtml(rows) {
  return rows.map(([label, value]) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#54606f;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;color:#1d2733;vertical-align:top;">${escapeHtml(value).replaceAll("\n", "<br>")}</td></tr>`
  ).join("");
}

function emailShell(title, intro, contentHtml, footerText) {
  return [
    "<!doctype html><html><body style=\"margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1d2733;\">",
    "<div style=\"max-width:620px;margin:0 auto;padding:28px 16px;\">",
    "<div style=\"background:#062451;padding:14px 20px;color:#fff;border-radius:8px 8px 0 0;\">",
    "<table role=\"presentation\" style=\"border-collapse:collapse;width:100%;\"><tr>",
    "<td style=\"vertical-align:middle;\"><strong style=\"font-size:18px;\">Cooper Debate Team</strong></td>",
    "<td style=\"vertical-align:middle;text-align:right;width:54px;\"><img src=\"https://cooperdebateteam.com/images/index-footer-jaguar.png\" width=\"46\" height=\"46\" alt=\"Cooper Debate Team\" style=\"display:block;margin-left:auto;width:46px;height:46px;object-fit:contain;\"></td>",
    "</tr></table>",
    "</div><div style=\"background:#fff;padding:28px 24px;border-radius:0 0 8px 8px;\">",
    `<h1 style="font-size:24px;line-height:1.25;margin:0 0 18px;">${escapeHtml(title)}</h1>`,
    `<p style="line-height:1.55;margin:0 0 20px;">${escapeHtml(intro).replaceAll("\n", "<br>")}</p>`,
    contentHtml,
    `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#667085;">${escapeHtml(footerText)}</p>`,
    "</div></div></body></html>",
  ].join("");
}

function calendarAttachment(event, signupId, cancelled = false) {
  if (!validDate(event.date)) return null;

  const compactDate = event.date.replaceAll("-", "");
  const startTime = validTime(event.startTime) ? event.startTime.replace(":", "") + "00" : "";
  const endTime = validTime(event.endTime) ? event.endTime.replace(":", "") + "00" : "";
  const eventLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "PUBLISH"}`,
    "PRODID:-//Cooper Debate Team//Volunteer Signup//EN",
    "BEGIN:VEVENT",
    `UID:${signupId}@cooperdebateteam.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `SEQUENCE:${Math.max(0, Math.floor(Number(event.calendarSequence) || 0))}`,
    `SUMMARY:${escapeIcs(`${cancelled ? "Cancelled: " : ""}Volunteer judge — ${cleanText(event.title, 160)}`)}`,
  ];

  if (startTime && endTime) {
    eventLines.push(`DTSTART;TZID=${TIME_ZONE}:${compactDate}T${startTime}`);
    eventLines.push(`DTEND;TZID=${TIME_ZONE}:${compactDate}T${endTime}`);
  } else {
    eventLines.push(`DTSTART;VALUE=DATE:${compactDate}`);
    eventLines.push(`DTEND;VALUE=DATE:${datePlusDays(event.date, 1).replaceAll("-", "")}`);
  }

  const location = [cleanText(event.location, 200), cleanText(event.address, 240)]
    .filter(Boolean)
    .join(", ");
  if (location) eventLines.push(`LOCATION:${escapeIcs(location)}`);
  eventLines.push(`URL:${publicEventLink(event)}`);
  eventLines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
  eventLines.push(`DESCRIPTION:${escapeIcs("Cooper Debate Team volunteer signup. Check the tournament page for the latest details.")}`);
  eventLines.push("END:VEVENT", "END:VCALENDAR", "");

  return {
    filename: cancelled ? "cooper-debate-volunteer-cancelled.ics" : "cooper-debate-volunteer.ics",
    content: Buffer.from(eventLines.join("\r\n"), "utf8").toString("base64"),
  };
}

function itineraryAttachment(event, signup) {
  const suppliedPdf = cleanText(signup.confirmationPdfBase64, 900000);
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(suppliedPdf)) {
    const bytes = Buffer.from(suppliedPdf, "base64");
    if (bytes.length <= 700000 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
      return Promise.resolve({
        filename: confirmationPdfFilename(event),
        content: suppliedPdf,
      });
    }
  }
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "LETTER",
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      info: {
        Title: `${cleanText(event.title, 160) || "Tournament"} judge confirmation`,
        Author: "Cooper Debate Team",
        Subject: "Volunteer judge confirmation letter",
      },
    });
    const chunks = [];
    document.on("data", chunk => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => {
      resolve({
        filename: confirmationPdfFilename(event),
        content: Buffer.concat(chunks).toString("base64"),
      });
    });

    const pageWidth = document.page.width;
    const navy = "#062451";
    const gold = "#f6c928";
    const ink = "#102b59";
    const pale = "#eaf4fc";
    const line = "#c6dced";
    const asset = name => path.join(__dirname, "assets", "volunteer-letter", name);
    document.registerFont("GreatVibes", asset("GreatVibes-Regular.ttf"));
    const eventName = cleanText(event.title, 160) || "Cooper Debate Tournament";
    const volunteerName = cleanText(signup.parentName, 120) ||
      [cleanText(signup.parentFirstName, 60), cleanText(signup.parentLastName, 60)].filter(Boolean).join(" ") ||
      "Volunteer";
    const icons = {
      signup: asset("signup-details.png"),
      resolution: asset("tournament-resolution.png"),
      expectations: asset("what-to-expect.png"),
      arrival: asset("arrival-parking.png"),
      meals: asset("meals-refreshments.png"),
      information: asset("important-information.png"),
      contact: asset("contact-support.png"),
      privacy: asset("privacy.png"),
    };
    const sectionBar = (x, y, width, title, icon, accent = gold) => {
      document.rect(x, y, width, 24).fill(navy);
      document.rect(x, y, 5, 24).fill(accent);
      document.image(icon, x + 9, y + 3, { fit: [18, 18], align: "center", valign: "center" });
      document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(title.length > 20 ? 7.2 : title.length > 16 ? 8.2 : 10)
        .text(title.toUpperCase(), x + 33, y + 7, { width: width - 39, height: 12, lineBreak: false, characterSpacing: 0 });
    };
    const starBullet = (x, y) => {
      document.circle(x, y, 5.2).fill(navy);
      const points = [];
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? 2.8 : 1.25;
        points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
      }
      document.polygon(...points).fill(gold);
    };
    const bullets = (items, x, y, width, fontSize = 7.2, gap = 15, height = 10) => {
      items.slice(0, 6).forEach((item, index) => {
        const top = y + index * gap;
        starBullet(x + 4, top + 5);
        document.fillColor(ink).font("Helvetica").fontSize(fontSize)
          .text(item, x + 14, top, { width: width - 14, height, ellipsis: true, lineGap: 1 });
      });
    };

    document.rect(0, 0, pageWidth, 92).fill(navy);
    document.rect(0, 90, pageWidth, 2).fill(gold);
    document.image(asset("cooper-debate-badge.png"), 13, 7, { fit: [76, 76], align: "center", valign: "center" });
    document.fillColor("#fffdf1").font("GreatVibes").fontSize(31)
      .text("Cooper Debate Team", 110, 12, { width: 392, align: "center", lineBreak: false });
    document.fillColor(gold).font("Helvetica-Bold").fontSize(9)
      .text("SPEAK  ·  REASON  ·  LEAD", 110, 49, { width: 392, align: "center", characterSpacing: 2 });
    document.fillColor("#d9e6f5").font("Helvetica").fontSize(8)
      .text("COOPER MIDDLE SCHOOL  ·  MCLEAN, VIRGINIA", 110, 68, { width: 392, align: "center", characterSpacing: 1.2 });

    document.fillColor("#a87900").font("Helvetica-Bold").fontSize(8)
      .text("TOURNAMENT JUDGE CONFIRMATION", 22, 102);
    document.fillColor(navy).font("Times-Bold").fontSize(24)
      .text("Thank you for representing", 22, 114, { width: 368, height: 26, lineBreak: false });
    document.text("Cooper.", 22, 139, { width: 368, height: 26, lineBreak: false });
    document.fillColor(ink).font("Helvetica").fontSize(9)
      .text("Thank you for volunteering to judge at the upcoming tournament! You are representing the Cooper Debate Team at this event. To support a fair and unbiased tournament, you will not judge Cooper teams and may be assigned to rounds involving other schools.", 22, 171, { width: 365, height: 44, lineGap: 2 });
    document.text("This document confirms your signup details and includes important tournament information. Please review everything carefully.", 22, 220, { width: 365, height: 24, lineGap: 2 });

    document.roundedRect(402, 106, 188, 127, 8).fill("#dceefa");
    document.rect(411, 115, 3, 109).fill(gold);
    document.fillColor(navy).font("Helvetica-Bold").fontSize(7).text("TOURNAMENT INFORMATION", 425, 116);
    document.font("Times-Bold").fontSize(13).text(eventName, 425, 131, { width: 151, height: 31, ellipsis: true });
    document.fillColor(ink).font("Helvetica").fontSize(8.5).text(displayDate(event.date) || "Date to be announced", 425, 166, { width: 151 });
    const location = [cleanText(event.location, 200), cleanText(event.address, 240)].filter(Boolean).join("\n") || "Location to be announced";
    document.fontSize(8).text(location, 425, 188, { width: 151, height: 29, ellipsis: true });
    document.font("Helvetica-Bold").fontSize(7.5).text(`Hosted by: ${cleanText(event.host, 160) || "Cooper Debate Team"}`, 425, 218, { width: 151, height: 12, ellipsis: true });

    const left = 22;
    const right = 304;
    const colW = 276;
    sectionBar(left, 254, colW, "Your Signup Details", icons.signup);
    document.roundedRect(left, 278, colW, 224, 5).fillAndStroke(pale, line);
    const rows = [
      ["Role", roleForSignup(event, signup)],
      ["Volunteer Name", volunteerName],
      ["Your Debater", cleanText(signup.studentName, 120) || "Not provided"],
      ["Email", cleanText(signup.email, 160) || "Not provided"],
      ["Phone", cleanText(signup.phone, 40) || "Not provided"],
      ["Availability", timeRange(signup.availabilityStart, signup.availabilityEnd) || "To be announced"],
      ["Location", location.replace("\n", " · ")],
      ["Notes", cleanText(signup.notes, 600) || "No notes provided."],
    ];
    let rowY = 282;
    rows.forEach(([label, value], index) => {
      const height = index >= 6 ? (index === 7 ? 61 : 39) : 20;
      if (index % 2 === 0) document.rect(left, rowY, colW, height).fill("#d9eafa");
      document.fillColor(ink).font("Helvetica-Bold").fontSize(7.5).text(label, left + 9, rowY + 6, { width: 78 });
      document.font("Helvetica").fontSize(7.5).text(value, left + 91, rowY + 5, { width: colW - 101, height: height - 7, ellipsis: true, lineGap: 1 });
      rowY += height;
    });

    sectionBar(right, 254, colW, "Tournament Resolution", icons.resolution);
    document.roundedRect(right, 278, colW, 74, 5).fillAndStroke("#f5f9fc", line);
    document.fillColor(ink).font("Helvetica").fontSize(8)
      .text(`Resolved: ${APPROVED_RESOLUTION}`, right + 10, 290, { width: colW - 20, height: 52, ellipsis: true, lineGap: 2 });
    sectionBar(right, 362, colW, "What to Expect", icons.expectations);
    document.roundedRect(right, 386, colW, 116, 5).fillAndStroke("#f5f9fc", line);
    bullets(APPROVED_EXPECTATIONS, right + 10, 395, colW - 20, 7.2, 20, 17);

    const boxY = 512;
    const boxGap = 8;
    const boxW = (pageWidth - 44 - boxGap * 3) / 4;
    const boxData = [
      ["Arrival & Parking", icons.arrival, APPROVED_ARRIVAL, "#eef5fb", "#c9deed"],
      ["Refreshments", icons.meals, APPROVED_MEAL_ITEMS, "#fff8df", "#eadca7"],
      ["Information", icons.information, APPROVED_IMPORTANT_INFORMATION, "#f3effa", "#d9cdec"],
      ["Contact Support", icons.contact, APPROVED_CONTACT, "#fff2e5", "#ebcfb1"],
    ];
    boxData.forEach(([title, icon, items, fill, border], index) => {
      const x = 22 + index * (boxW + boxGap);
      sectionBar(x, boxY, boxW, title, icon);
      document.roundedRect(x, boxY + 24, boxW, 151, 5).fillAndStroke(fill, border);
      bullets(items, x + 8, boxY + 35, boxW - 16, 6.5, 29, 25);
    });

    document.roundedRect(22, 697, 278, 69, 6).fillAndStroke("#e9f5f0", "#c8e1d6");
    sectionBar(22, 697, 278, "Privacy", icons.privacy);
    document.fillColor(ink).font("Helvetica").fontSize(7.5)
      .text("Your contact information and notes are shared only with the Cooper Debate coaching staff and are used solely for tournament-related communication.", 34, 730, { width: 252, height: 29, lineGap: 2 });
    document.roundedRect(308, 697, 282, 69, 6).fillAndStroke("#fff0b9", "#f0d36b");
    document.fillColor(navy).font("Times-Bold").fontSize(13)
      .text("Thank you again for representing\nthe Cooper Debate Team!", 322, 706, { width: 254, lineGap: 1 });
    document.font("Times-BoldItalic").fontSize(8.5)
      .text("We look forward to seeing you at the tournament!", 322, 741, { width: 254 });
    document.font("Times-Bold").fontSize(8.5)
      .text("— Cooper Debate Team", 322, 753, { width: 254, align: "right" });
    document.end();
  });
}

function notificationKey(signupId, kind, version = "") {
  return crypto.createHash("sha256")
    .update(`${signupId}:${kind}:${version}`)
    .digest("hex");
}

function notificationVersion(event) {
  return crypto.createHash("sha256").update(JSON.stringify({
    title: cleanText(event.title, 160),
    date: cleanText(event.date, 32),
    startTime: cleanText(event.startTime, 5),
    endTime: cleanText(event.endTime, 5),
    location: cleanText(event.location, 200),
    address: cleanText(event.address, 240),
    mealInfo: cleanText(event.mealInfo, 180),
    resolution: cleanText(event.resolution, 900),
    judgeInstructions: cleanText(event.judgeInstructions, 900),
    expectations: cleanText(event.expectations, 1200),
    coachName: cleanText(event.coachName, 120),
    coachEmail: cleanText(event.coachEmail, 160),
    coachPhone: cleanText(event.coachPhone, 40),
    invitationUrl: cleanText(event.invitationUrl, 500),
    details: cleanText(event.details, 700),
    published: event.published === true,
    calendarSequence: Math.max(0, Math.floor(Number(event.calendarSequence) || 0)),
    roles: (Array.isArray(event.roles) ? event.roles : []).map(role => ({
      id: cleanText(role.id, 80),
      label: cleanText(role.label, 100),
      description: cleanText(role.description, 280),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  })).digest("hex");
}

function changedEventFields(before, after) {
  const fields = [
    ["title", "tournament name"],
    ["date", "date"],
    ["startTime", "tournament hours"],
    ["endTime", "tournament hours"],
    ["location", "location"],
    ["address", "address"],
    ["mealInfo", "meal information"],
    ["resolution", "topic / resolution"],
    ["judgeInstructions", "judge instructions"],
    ["expectations", "arrival or event expectations"],
    ["coachName", "coach contact"],
    ["coachEmail", "coach contact"],
    ["coachPhone", "coach contact"],
    ["invitationUrl", "tournament page"],
    ["details", "tournament details"],
  ];
  const changes = new Set();
  for (const [field, label] of fields) {
    if (cleanText(before[field], 1200) !== cleanText(after[field], 1200)) changes.add(label);
  }
  if (before.published === true && after.published !== true) changes.add("tournament availability");

  const beforeRoles = notificationVersion({ roles: before.roles });
  const afterRoles = notificationVersion({ roles: after.roles });
  if (beforeRoles !== afterRoles) changes.add("volunteer role information");
  return [...changes];
}

async function buildMessage(kind, event, signup, changes = []) {
  const name = cleanText(signup.parentFirstName, 60) || cleanText(signup.parentName, 120) || "Volunteer";
  const eventName = cleanText(event.title, 160) || "Cooper Debate tournament";
  const useApprovedOnePager = kind === "confirmation";
  const rows = eventSummary(event, signup, useApprovedOnePager);
  const pageUrl = publicEventLink(event);
  const instructions = useApprovedOnePager
    ? APPROVED_IMPORTANT_INFORMATION.join("\n")
    : cleanText(event.judgeInstructions, 900);
  const expectations = useApprovedOnePager
    ? APPROVED_EXPECTATIONS.join("\n")
    : cleanText(event.expectations, 1200);
  const eventRowsHtml = `<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0 20px;">${rowsAsHtml(rows)}</table>`;
  const eventRowsText = rowsAsText(rows);
  const pageHtml = `<p style="margin:20px 0;"><a href="${escapeHtml(pageUrl)}" style="display:inline-block;background:#062451;color:#fff;text-decoration:none;border-radius:5px;padding:11px 16px;font-weight:700;">View tournament details</a></p>`;
  const approvedSections = [
    ["Arrival & parking", APPROVED_ARRIVAL],
    ["Meals & refreshments", APPROVED_MEAL_ITEMS],
    ["What to expect", APPROVED_EXPECTATIONS],
    ["Important information", APPROVED_IMPORTANT_INFORMATION],
    ["Contact & support", APPROVED_CONTACT],
  ];
  const approvedSectionsText = approvedSections
    .map(([title, items]) => `${title}:\n${items.map(item => `- ${item}`).join("\n")}`)
    .join("\n\n");
  const approvedSectionsHtml = approvedSections
    .map(([title, items]) =>
      `<h2 style="font-size:17px;">${escapeHtml(title)}</h2>` +
      `<ul style="line-height:1.55;">${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    ).join("");
  const calendar = calendarAttachment(
    event,
    signup.id,
    kind === "signup-cancelled" || kind === "event-cancelled"
  );

  if (kind === "confirmation") {
    const itinerary = await itineraryAttachment(event, signup);
    const text = [
      `Hi ${name}, thank you for volunteering for the Cooper Debate Team.`,
      "",
      eventRowsText,
       `\n${approvedSectionsText}`,
      `\nTournament details: ${pageUrl}`,
      "A calendar file and printable PDF itinerary are attached. If you need to change your availability or contact information, please contact the coach listed above.",
    ].filter(Boolean).join("\n");
    const html = emailShell(
      "Your volunteer signup is confirmed",
      `Hi ${name}, thank you for volunteering for the Cooper Debate Team.`,
      `${eventRowsHtml}${approvedSectionsHtml}` +
      `${pageHtml}`,
      "A calendar file and printable PDF itinerary are attached. To change your availability or contact information, please contact the coach listed above."
    );
    return { subject: `Confirmed: ${eventName} Volunteer Signup`, text, html, attachments: [calendar, itinerary].filter(Boolean) };
  }

  if (kind === "three-day-reminder") {
    const text = [
      `Hi ${name},`,
      "",
      `${eventName} is three days away. Please review your volunteer details and the current tournament information.`,
      "",
      eventRowsText,
      instructions ? `\nJudge instructions:\n${instructions}` : "",
      expectations ? `\nArrival and event expectations:\n${expectations}` : "",
      `\nTournament details: ${pageUrl}`,
    ].filter(Boolean).join("\n");
    const html = emailShell(
      "Three-day volunteer reminder",
      `Hi ${name}, ${eventName} is three days away. Please review the current logistics below.`,
      `${eventRowsHtml}${instructions ? `<h2 style="font-size:17px;">Judge instructions</h2><p style="line-height:1.55;">${escapeHtml(instructions).replaceAll("\n", "<br>")}</p>` : ""}` +
      `${expectations ? `<h2 style="font-size:17px;">Arrival and event expectations</h2><p style="line-height:1.55;">${escapeHtml(expectations).replaceAll("\n", "<br>")}</p>` : ""}` +
      pageHtml,
      "Please use the tournament page as the source of truth for any last-minute logistics."
    );
    return { subject: `Three-day reminder: ${eventName}`, text, html, attachments: [] };
  }

  if (kind === "one-day-reminder") {
    const text = [
      `Hi ${name},`,
      "",
      `A quick reminder that ${eventName} is tomorrow.`,
      "",
      eventRowsText,
      `\nCurrent tournament details: ${pageUrl}`,
    ].filter(Boolean).join("\n");
    const html = emailShell(
      "Volunteer reminder for tomorrow",
      `Hi ${name}, a quick reminder that ${eventName} is tomorrow.`,
      `${eventRowsHtml}${pageHtml}`,
      "Please check the tournament page before leaving for the event."
    );
    return { subject: `Tomorrow: ${eventName}`, text, html, attachments: [] };
  }

  if (kind === "signup-cancelled" || kind === "event-cancelled") {
    const cancellationText = kind === "event-cancelled"
      ? `${eventName} has been cancelled.`
      : `Your volunteer signup for ${eventName} has been cancelled by the coaching team.`;
    const text = [
      `Hi ${name},`,
      "",
      cancellationText,
      "If you believe this is an error or have questions, please contact the coach listed below.",
      "",
      eventRowsText,
      `\nTournament details: ${pageUrl}`,
    ].join("\n");
    const html = emailShell(
      kind === "event-cancelled" ? "Tournament cancelled" : "Your volunteer signup has been cancelled",
      `Hi ${name}, ${cancellationText}`,
      `${eventRowsHtml}${pageHtml}`,
      "If you believe this is an error or have questions, please contact the coach listed above."
    );
    return { subject: `Cancelled: ${eventName}`, text, html, attachments: calendar ? [calendar] : [] };
  }

  const unavailable = event.published !== true;
  const updateText = unavailable
    ? `${eventName} is no longer published as a volunteer opportunity. Please contact the coach before making plans.`
    : `${eventName} has updated tournament information: ${changes.join(", ") || "tournament details"}.`;
  const text = [
    `Hi ${name},`,
    "",
    updateText,
    "",
    eventRowsText,
    instructions ? `\nJudge instructions:\n${instructions}` : "",
    expectations ? `\nArrival and event expectations:\n${expectations}` : "",
    `\nCurrent tournament details: ${pageUrl}`,
    "An updated calendar file is attached.",
  ].filter(Boolean).join("\n");
  const html = emailShell(
    unavailable ? "Volunteer opportunity update" : "Tournament details updated",
    `Hi ${name}, ${updateText}`,
    `${eventRowsHtml}${instructions ? `<h2 style="font-size:17px;">Judge instructions</h2><p style="line-height:1.55;">${escapeHtml(instructions).replaceAll("\n", "<br>")}</p>` : ""}` +
    `${expectations ? `<h2 style="font-size:17px;">Arrival and event expectations</h2><p style="line-height:1.55;">${escapeHtml(expectations).replaceAll("\n", "<br>")}</p>` : ""}` +
    pageHtml,
    "An updated calendar file is attached. Please use the tournament page for the latest information."
  );
  return { subject: `Update: ${eventName}`, text, html, attachments: calendar ? [calendar] : [] };
}

function safeError(error) {
  return cleanText(error && error.message, 300) || "Email delivery could not be completed.";
}

async function runWithConcurrency(items, maximum, worker) {
  let cursor = 0;
  const errors = [];
  const workers = Array.from({ length: Math.min(maximum, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try {
        await worker(item);
      } catch (error) {
        errors.push(error);
      }
    }
  });
  await Promise.all(workers);
  if (errors.length) throw errors[0];
}

function createVolunteerEmailService({ db, resendSecret }) {
  async function reserveNotification({ key, kind, signup, event }) {
    const reference = db.collection("volunteer_email_notifications").doc(key);
    return db.runTransaction(async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists) {
        const data = existing.data();
        if (data.status === "sent") return "sent";
        const startedAt = data.startedAt && data.startedAt.toMillis ? data.startedAt.toMillis() : 0;
        if (data.status === "sending" && startedAt && Date.now() - startedAt < STALE_SEND_MS) return "sending";
      }
      transaction.set(reference, {
        kind,
        status: "sending",
        signupId: signup.id,
        eventId: cleanText(signup.eventId, 160),
        eventDate: cleanText(event.date, 32),
        attemptCount: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return "reserved";
    });
  }

  async function deliver({ key, kind, signup, event, changes }) {
    if (!signup || !validEmail(signup.email)) {
      console.error("Volunteer email skipped because the signup has no valid email address.", { kind, signupId: signup && signup.id });
      return { skipped: true };
    }
    const reservation = await reserveNotification({ key, kind, signup, event });
    if (reservation === "sent") return { accepted: true, alreadyAccepted: true };
    if (reservation === "sending") return { accepted: false, pending: true };

    const notificationRef = db.collection("volunteer_email_notifications").doc(key);
    try {
      const apiKey = resendSecret.value();
      if (!apiKey) throw new Error("The Resend email secret is not available.");
      const message = await buildMessage(kind, event, signup, changes);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          from: SENDER,
          to: [signup.email],
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments,
        }),
      });
      const body = await response.text();
      let result = {};
      try {
        result = body ? JSON.parse(body) : {};
      } catch (_) {
        result = {};
      }
      if (!response.ok) throw new Error(`Resend returned ${response.status}: ${cleanText(result.message || body, 200)}`);

      await notificationRef.set({
        status: "sent",
        providerId: cleanText(result.id, 160),
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        accepted: true,
        providerId: cleanText(result.id, 160),
      };
    } catch (error) {
      await notificationRef.set({
        status: "failed",
        error: safeError(error),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw error;
    }
  }

  async function sendSignupConfirmation(signup, event, deliveryVersion = "") {
    return deliver({
      key: notificationKey(signup.id, "confirmation", cleanText(deliveryVersion, 120)),
      kind: "confirmation",
      signup,
      event,
    });
  }

  async function sendSignupCancellation(signup, event) {
    return deliver({
      key: notificationKey(signup.id, "signup-cancelled"),
      kind: "signup-cancelled",
      signup,
      event,
    });
  }

  async function sendEventCancellation(signup, event) {
    const version = notificationVersion(event);
    return deliver({
      key: notificationKey(signup.id, "event-cancelled", version),
      kind: "event-cancelled",
      signup,
      event,
    });
  }

  async function sendEventUpdate(signup, event, changes) {
    const version = notificationVersion(event);
    return deliver({
      key: notificationKey(signup.id, "event-update", version),
      kind: "event-update",
      signup,
      event,
      changes,
    });
  }

  async function sendEventUpdates(signups, event, changes) {
    await runWithConcurrency(signups, 4, signup => sendEventUpdate(signup, event, changes));
  }

  async function sendEventCancellations(signups, event) {
    await runWithConcurrency(signups, 4, signup => sendEventCancellation(signup, event));
  }

  async function sendDueReminders() {
    const today = todayInEasternTime();
    const schedules = [
      { kind: "three-day-reminder", date: datePlusDays(today, 3) },
      { kind: "one-day-reminder", date: datePlusDays(today, 1) },
    ];
    const dates = schedules.map(item => item.date);
    const eventsSnap = await db.collection("volunteer_events").where("date", "in", dates).get();

    const jobs = [];
    for (const eventDoc of eventsSnap.docs) {
      const event = { id: eventDoc.id, ...eventDoc.data() };
      if (event.published !== true) continue;
      const schedule = schedules.find(item => item.date === event.date);
      if (!schedule) continue;
      const signups = await db.collection("volunteer_signups").where("eventId", "==", eventDoc.id).get();
      for (const signupDoc of signups.docs) {
        jobs.push({
          signup: { id: signupDoc.id, ...signupDoc.data() },
          event,
          schedule,
        });
      }
    }
    await runWithConcurrency(jobs, 4, async ({ signup, event, schedule }) => {
      await deliver({
          key: notificationKey(signup.id, schedule.kind, event.date),
          kind: schedule.kind,
          signup,
          event,
      });
    });
  }

  return {
    changedEventFields,
    sendSignupConfirmation,
    sendSignupCancellation,
    sendEventUpdate,
    sendEventUpdates,
    sendEventCancellations,
    sendDueReminders,
  };
}

module.exports = {
  createVolunteerEmailService,
  createVolunteerItineraryAttachment: itineraryAttachment,
};