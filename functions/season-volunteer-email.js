"use strict";

const { VENUES, EXPECTATIONS } = require("./season-volunteer-letter");

const NAVY = "#062451";
const TEAL = "#08647c";
const GOLD = "#f6c928";
const IMAGE_BASE = "https://cooperdebateteam.com/images/volunteer-letter/";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clean(value, limit = 160) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function mapUrl(event) {
  if (event.online) return "";
  const address = event.address.replaceAll("\n", ", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function icon(file, size = 24) {
  return `<img src="${IMAGE_BASE}${file}" alt="" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;object-fit:contain;border:0;">`;
}

function heading(label, file) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${NAVY};border-collapse:collapse;">` +
    `<tr><td width="42" style="padding:8px 0 8px 12px;vertical-align:middle;">${icon(file, 25)}</td>` +
    `<td style="padding:9px 10px 9px 0;color:#ffffff;font:bold 12px Arial,sans-serif;letter-spacing:.5px;vertical-align:middle;">${escapeHtml(label)}</td></tr></table>`;
}

function panel(label, file, content, background = "#f4f9fc") {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #d6e5ed;background:${background};">` +
    `<tr><td>${heading(label, file)}</td></tr>` +
    `<tr><td style="padding:11px 12px;color:#17314d;font:12px/1.45 Arial,sans-serif;">${content}</td></tr></table>`;
}

function columns(left, right) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;table-layout:fixed;">` +
    `<tr><td class="email-col" width="50%" style="padding:0 5px 0 0;vertical-align:top;">${left}</td>` +
    `<td class="email-col" width="50%" style="padding:0 0 0 5px;vertical-align:top;">${right}</td></tr></table>`;
}

function buildSeasonAvailabilityEmail(submission, selections, {
  updatedExisting = false, volunteerSignupUrl, tournamentPageUrl,
} = {}) {
  if (!volunteerSignupUrl || !tournamentPageUrl) {
    throw new Error("Season email links must be configured.");
  }
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 5) {
    throw new Error("Season email requires one to five selected tournaments.");
  }
  const events = selections.map(item => {
    const venue = VENUES[item.name];
    if (!venue || venue.date !== item.date) throw new Error("Unknown selected tournament.");
    return { ...venue, name: item.name };
  }).sort((a, b) => a.rank - b.rank);
  if (new Set(events.map(event => event.rank)).size !== events.length) {
    throw new Error("Duplicate selected tournament.");
  }

  const fullName = clean(submission.parentName, 120) ||
    [clean(submission.parentFirstName, 60), clean(submission.parentLastName, 60)]
      .filter(Boolean).join(" ") || "Volunteer";
  const firstName = clean(submission.parentFirstName, 60) || fullName.split(/\s+/)[0];
  const detailRows = [
    ["Volunteer Name", fullName],
    ["Your Debater", clean(submission.studentName, 120) || "Not provided"],
    ["Role", "Judge"],
    ["Email", clean(submission.email, 160) || "Not provided"],
    ["Phone", clean(submission.phone, 40) || "Not provided"],
    ["Tabroom Account", clean(submission.tabroomUsernameOrEmail, 160) || "Not provided"],
    ["Availability", "8:00 AM – 5:30 PM (Full Day)"],
    ["Website Signup", `2026–27 season (${events.length} selected)`],
  ];
  const detailTable = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font:10px/1.35 Arial,sans-serif;">` +
    detailRows.map(([label, value], index) =>
      `<tr style="background:${index % 2 ? "#f2f8fb" : "#e5f2f8"};">` +
        `<td style="width:39%;padding:8px 7px;color:${NAVY};font-weight:bold;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 7px;color:#17314d;word-break:break-word;vertical-align:top;">${escapeHtml(value)}</td></tr>`
    ).join("") + "</table>";

  const tournamentRows = events.map((event, index) => {
    const location = event.address.replaceAll("\n", ", ");
    const locationHtml = event.online
      ? escapeHtml(location)
      : `<a href="${escapeHtml(mapUrl(event))}" style="color:#095e83;text-decoration:underline;">${escapeHtml(location)}</a>`;
    return `<tr style="background:${index % 2 ? "#ffffff" : "#eaf5f9"};">` +
      `<td style="padding:7px 2px;text-align:center;vertical-align:middle;border-top:1px solid #d8e7ed;">` +
        `<span style="display:inline-block;border-radius:50%;padding:4px 7px;background:${TEAL};color:white;font-weight:bold;">${index + 1}</span></td>` +
      `<td style="padding:7px 3px;text-align:center;vertical-align:middle;border-top:1px solid #d8e7ed;">${escapeHtml(event.short)}</td>` +
      `<td style="padding:7px 3px;text-align:center;font-weight:bold;vertical-align:middle;border-top:1px solid #d8e7ed;">${escapeHtml(event.name)}</td>` +
      `<td style="padding:7px 3px;text-align:center;vertical-align:middle;border-top:1px solid #d8e7ed;">${locationHtml}</td>` +
      `<td style="padding:7px 3px;text-align:center;vertical-align:middle;border-top:1px solid #d8e7ed;">Full Day<br>8:00 AM – 5:30 PM</td></tr>`;
  }).join("");
  const tournamentTable = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;table-layout:fixed;font:9px/1.35 Arial,sans-serif;color:#17314d;">` +
    `<tr style="background:#daedf6;color:${NAVY};font-weight:bold;">` +
      `<th width="9%" style="padding:7px 2px;text-align:center;">No.</th>` +
      `<th width="18%" style="padding:7px 2px;text-align:center;">Date</th>` +
      `<th width="25%" style="padding:7px 2px;text-align:center;">Tournament</th>` +
      `<th width="29%" style="padding:7px 2px;text-align:center;">Location</th>` +
      `<th width="19%" style="padding:7px 2px;text-align:center;">Availability</th></tr>` +
    tournamentRows + "</table>";

  const expectationIcons = [
    "signup-details.png", "important-information.png", "tournament-resolution.png",
    "contact-support.png", "what-to-expect.png",
  ];
  const expectationCells = EXPECTATIONS.map((item, index) =>
    `<td class="expect-cell" width="20%" style="padding:12px 7px;text-align:center;vertical-align:top;border-right:${index === 4 ? "0" : "1px solid #c5dfe8"};font:10px/1.35 Arial,sans-serif;color:#17314d;">` +
      `<img src="${IMAGE_BASE}${expectationIcons[index]}" alt="" width="29" height="29" style="display:block;width:29px;height:29px;object-fit:contain;border:0;margin:0 auto 8px;">` +
      `${escapeHtml(item)}</td>`
  ).join("");

  const intro = updatedExisting
    ? "Your selected tournament dates were updated. The list below shows your current full-day availability."
    : `We saved your full-day availability for ${events.length} ${events.length === 1 ? "tournament" : "tournaments"}.`;
  const hasInPerson = events.some(event => !event.online);
  const hasVirtual = events.some(event => event.online);
  const dayGuide = [
    hasInPerson ? "For in-person dates, arrive early for 8:00 AM check-in; parking and lunch details will follow." : "",
    hasVirtual ? "For the virtual date, a connection link will be shared closer to the event." : "",
  ].filter(Boolean).join(" ");
  const updateNotice = updatedExisting
    ? `<p style="margin:10px 0 0;padding:9px 11px;background:#fff1e7;border-left:3px solid #b9502d;color:#7f3524;font:bold 11px/1.45 Arial,sans-serif;">` +
      `If you did not make this change, contact Coach Pamela Konde at ` +
      `<a href="mailto:pgkonde@fcps.edu" style="color:#7f3524;">pgkonde@fcps.edu</a>.</p>`
    : "";
  const signupLink = escapeHtml(volunteerSignupUrl);
  const tournamentLink = escapeHtml(tournamentPageUrl);
  const email = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>@media screen and (max-width:620px){.email-col{display:block!important;width:100%!important;padding:0 0 10px!important;box-sizing:border-box!important}.email-pad{padding:12px!important}.email-title{font-size:23px!important}.email-summary{margin-top:12px!important}.expect-cell{display:block!important;width:100%!important;box-sizing:border-box!important;border-right:0!important;border-bottom:1px solid #c5dfe8!important}.email-button{display:block!important;margin:0 0 8px!important;text-align:center!important}}</style>` +
    `</head><body style="margin:0;padding:0;background:#edf3f7;color:#17314d;font-family:Arial,sans-serif;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#edf3f7;"><tr><td align="center" style="padding:14px 8px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="700" style="width:100%;max-width:700px;border-collapse:collapse;background:#ffffff;border:1px solid #d8e4ec;">` +
    `<tr><td style="background:${NAVY};border-bottom:3px solid ${GOLD};padding:15px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr>` +
    `<td width="70" style="vertical-align:middle;text-align:center;"><img src="${IMAGE_BASE}cooper-debate-badge.png" width="62" height="65" alt="Cooper Debate Team badge" style="display:block;width:62px;height:65px;object-fit:contain;border:0;"></td>` +
    `<td style="vertical-align:middle;text-align:center;"><img src="https://cooperdebateteam.com/images/email-cooper-debate-wordmark.png" width="295" height="42" alt="Cooper Debate Team" style="display:block;width:100%;max-width:295px;height:auto;margin:0 auto;border:0;">` +
    `<div style="padding-top:5px;color:${GOLD};font:bold 10px Arial,sans-serif;letter-spacing:2.5px;">SPEAK &nbsp;·&nbsp; REASON &nbsp;·&nbsp; LEAD</div>` +
    `<div style="padding-top:6px;color:#e3edf5;font:9px Arial,sans-serif;letter-spacing:1.8px;">COOPER MIDDLE SCHOOL · MCLEAN, VIRGINIA</div></td>` +
    `<td width="70" style="vertical-align:middle;text-align:center;"><img src="https://cooperdebateteam.com/images/index-footer-jaguar.png" width="60" height="62" alt="" style="display:block;width:60px;height:62px;object-fit:contain;border:0;margin-left:auto;"></td>` +
    `</tr></table></td></tr>` +
    `<tr><td class="email-pad" style="padding:16px 13px 20px;">` +
    columns(
      `<div style="font:bold 10px Arial,sans-serif;letter-spacing:1.8px;color:${NAVY};">2026–27 SEASON</div>` +
      `<h1 class="email-title" style="margin:4px 0 5px;color:${NAVY};font:bold 27px/1.08 Georgia,serif;">Season Judge Availability ${updatedExisting ? "Updated" : "Received"}</h1>` +
      `<div style="font:bold 17px/1.2 Georgia,serif;color:${TEAL};">${updatedExisting ? "Your selection has changed." : "Your full-day availability is saved."}</div>`,
      `<div class="email-summary" style="border:1px solid #eadb9c;background:#fff9e7;padding:12px 13px;">` +
      `<strong style="display:block;color:${NAVY};font:bold 14px Arial,sans-serif;">${events.length} ${events.length === 1 ? "TOURNAMENT" : "TOURNAMENTS"} SELECTED</strong>` +
      `<div style="margin-top:7px;border-top:1px solid #d8c994;padding-top:7px;font:11px/1.4 Arial,sans-serif;">Full-day commitment on each date:</div>` +
      `<div style="margin-top:7px;padding:8px;background:#ffedb3;text-align:center;font:bold 14px Arial,sans-serif;color:${NAVY};">8:00 AM – 5:30 PM</div></div>`
    ) +
    `<p style="margin:12px 0 4px;font:12px/1.5 Arial,sans-serif;">Hi ${escapeHtml(firstName)}, ${escapeHtml(intro)} ` +
    `Cooper Debate coaches will coordinate Tabroom registration. This is not yet a confirmed judging assignment.</p>${updateNotice}` +
    `<div style="height:12px;line-height:12px;">&nbsp;</div>` +
    columns(
      panel("YOUR SIGNUP DETAILS", "signup-details.png", detailTable, "#f6fbfd"),
      panel(`YOUR 2026–27 TOURNAMENTS`, "tournament-resolution.png", tournamentTable, "#f6fbfd")
    ) +
    `<div style="height:10px;line-height:10px;">&nbsp;</div>` +
    panel("WHAT TO EXPECT", "what-to-expect.png",
      `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;table-layout:fixed;"><tr>${expectationCells}</tr></table>`, "#f8fcfe") +
    `<div style="height:10px;line-height:10px;">&nbsp;</div>` +
    columns(
      panel("TABROOM REGISTRATION", "signup-details.png",
        `Cooper Debate coaches will connect your Tabroom account and handle registration for each selected tournament. ` +
        `You do not need a separate website signup for each date.`, "#e9f5fb"),
      panel("TOURNAMENT-DAY INFORMATION", "important-information.png",
        dayGuide, "#fff8e5")
    ) +
    `<div style="height:10px;line-height:10px;">&nbsp;</div>` +
    columns(
      panel("CONTACT & SUPPORT", "contact-support.png",
        `If you have questions about your availability or need to correct your contact details, please contact:<br>` +
        `<strong>Coach Pamela Konde at <a href="mailto:pgkonde@fcps.edu" style="color:#095e83;">pgkonde@fcps.edu</a></strong><br>` +
        `On tournament day, contact a coach or student volunteer for help.`, "#fffaf0"),
      panel("ATTACHMENT & NEXT STEPS", "tournament-resolution.png",
        `Your two-page season judge letter is attached as a PDF. It lists your current tournament selections and day-of guidance.`, "#f3f9fc")
    ) +
    `<p style="margin:15px 0 0;color:#4b6372;font:10px/1.5 Arial,sans-serif;">This email includes the contact details you submitted. ` +
    `Your private notes are not included. If you update your tournament choices, the next email and PDF will show your full current selection.</p>` +
    `<div style="margin:19px 0 0;text-align:center;">` +
    `<a class="email-button" href="${signupLink}" style="display:inline-block;margin:0 4px 8px;padding:13px 18px;background:#a94332;border-radius:7px;color:#ffffff;text-decoration:none;font:bold 12px/18px Arial,sans-serif;vertical-align:middle;">` +
    `<img src="https://cooperdebateteam.com/images/volunteer-signup-people-white.png" width="18" height="18" alt="" style="display:inline-block;width:18px;height:18px;margin-right:9px;border:0;vertical-align:middle;">` +
    `<span style="color:#ffffff;vertical-align:middle;">VOLUNTEER SIGNUP</span></a>` +
    `<a class="email-button" href="${tournamentLink}" style="display:inline-block;margin:0 4px 8px;padding:13px 18px;background:${NAVY};border-radius:7px;color:#ffffff;text-decoration:none;font:bold 12px/18px Arial,sans-serif;vertical-align:middle;">View tournament details</a>` +
    `</div>` +
    `</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Hi ${firstName}, ${intro}`,
    "Cooper Debate coaches will coordinate Tabroom registration. This is not yet a confirmed judging assignment.",
    ...(updatedExisting ? ["If you did not make this change, contact Coach Pamela Konde at pgkonde@fcps.edu."] : []),
    "", "YOUR SIGNUP DETAILS",
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    "", "YOUR 2026–27 TOURNAMENTS",
    ...events.map((event, index) => `${index + 1}. ${event.name} — ${event.date} — ${event.address.replaceAll("\n", ", ")}${event.online ? "" : ` (Map: ${mapUrl(event)})`} — Full Day, 8:00 AM – 5:30 PM`),
    "", "WHAT TO EXPECT", ...EXPECTATIONS.map(item => `• ${item}`),
    "", "TABROOM REGISTRATION",
    "Cooper Debate coaches will connect your Tabroom account and handle registration for each selected tournament. You do not need a separate website signup for each date.",
    "", "TOURNAMENT-DAY INFORMATION",
    dayGuide,
    "", "CONTACT & SUPPORT",
    "Coach Pamela Konde at pgkonde@fcps.edu",
    "", "ATTACHMENT & NEXT STEPS",
    "Your two-page season judge letter is attached as a PDF. It lists your current tournament selections and day-of guidance.",
    "This email includes the contact details you submitted. Your private notes are not included.",
    "", `VOLUNTEER SIGNUP: ${volunteerSignupUrl}`, `View tournament details: ${tournamentPageUrl}`,
  ].join("\n");
  return { html: email, text };
}

module.exports = { buildSeasonAvailabilityEmail };