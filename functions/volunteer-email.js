const crypto = require("node:crypto");
const PDFDocument = require("pdfkit");
const { FieldValue } = require("firebase-admin/firestore");

const SENDER = "Cooper Debate Team <admin@cooperdebateteam.com>";
const TIME_ZONE = "America/New_York";
const TOURNAMENT_PAGE_URL = "https://cooperdebateteam.com/tournaments.html";
const STALE_SEND_MS = 10 * 60 * 1000;

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

function eventSummary(event, signup) {
  const rows = [
    ["Tournament", cleanText(event.title, 160)],
    ["Date", displayDate(event.date)],
    ["Tournament hours", timeRange(event.startTime, event.endTime)],
    ["Your availability", timeRange(signup.availabilityStart, signup.availabilityEnd)],
    ["Your role", roleForSignup(event, signup)],
    ["Location", cleanText(event.location, 200)],
    ["Address", cleanText(event.address, 240)],
    ["Meals", cleanText(event.mealInfo, 180)],
    ["Topic / resolution", cleanText(event.resolution, 900)],
    ["Coach contact", coachContact(event)],
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
    "<div style=\"background:#0e3b2e;padding:20px 24px;color:#fff;border-radius:8px 8px 0 0;\">",
    "<strong style=\"font-size:18px;\">Cooper Debate Team</strong>",
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
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "LETTER",
      margins: { top: 42, right: 46, bottom: 44, left: 46 },
      info: {
        Title: `${cleanText(event.title, 160) || "Tournament"} volunteer itinerary`,
        Author: "Cooper Debate Team",
        Subject: "Volunteer judge itinerary",
      },
    });
    const chunks = [];
    document.on("data", chunk => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => {
      resolve({
        filename: "cooper-debate-volunteer-itinerary.pdf",
        content: Buffer.concat(chunks).toString("base64"),
      });
    });

    const pageWidth = document.page.width;
    const contentWidth = pageWidth - 92;
    const eventName = cleanText(event.title, 160) || "Cooper Debate Tournament";
    const volunteerName = cleanText(signup.parentName, 120) ||
      [cleanText(signup.parentFirstName, 60), cleanText(signup.parentLastName, 60)].filter(Boolean).join(" ") ||
      "Volunteer";
    const rows = [
      ["Volunteer", volunteerName],
      ["Debater", cleanText(signup.studentName, 120) || "Not provided"],
      ["Volunteer role", roleForSignup(event, signup)],
      ["Your availability", timeRange(signup.availabilityStart, signup.availabilityEnd)],
      ["Date", displayDate(event.date)],
      ["Tournament hours", timeRange(event.startTime, event.endTime)],
      ["Debate format", cleanText(event.debateFormat, 120)],
      ["Location", [cleanText(event.location, 200), cleanText(event.address, 240)].filter(Boolean).join(" · ")],
      ["Hosted by", cleanText(event.host, 160)],
      ["Meals", cleanText(event.mealInfo, 180)],
    ].filter(([, value]) => value);

    const ensureSpace = height => {
      if (document.y + height <= document.page.height - 44) return;
      document.addPage();
    };
    const section = (title, text) => {
      if (!text) return;
      ensureSpace(90);
      document.moveDown(0.65);
      document.font("Helvetica-Bold").fontSize(9).fillColor("#0f7256").text(title.toUpperCase(), { characterSpacing: 0.8 });
      document.moveDown(0.25);
      document.font("Helvetica").fontSize(10).fillColor("#243b3a").text(text, { lineGap: 3 });
    };

    document.rect(0, 0, pageWidth, 132).fill("#073c33");
    document.rect(0, 128, pageWidth, 4).fill("#e8bc4f");
    document.fillColor("#e8bc4f").font("Helvetica-Bold").fontSize(10)
      .text("COOPER DEBATE TEAM", 46, 35, { characterSpacing: 1.2 });
    document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(23)
      .text("Volunteer Judge Itinerary", 46, 57, { width: contentWidth });
    document.fillColor("#cde6dd").font("Helvetica").fontSize(12)
      .text(eventName, 46, 91, { width: contentWidth });

    document.y = 154;
    const cardGap = 9;
    const cardWidth = (contentWidth - cardGap) / 2;
    const gridTop = document.y;
    rows.forEach(([label, value], index) => {
      const column = index % 2;
      const top = gridTop + Math.floor(index / 2) * 55;
      const left = 46 + column * (cardWidth + cardGap);
      document.roundedRect(left, top, cardWidth, 48, 5)
        .fill(Math.floor(index / 2) % 2 === 0 ? "#edf6f2" : "#e3f0eb");
      document.fillColor("#197258").font("Helvetica-Bold").fontSize(7.5)
        .text(label.toUpperCase(), left + 12, top + 8, { width: cardWidth - 24, characterSpacing: 0.4 });
      document.fillColor("#173531").font("Helvetica").fontSize(9.2)
        .text(value, left + 12, top + 22, { width: cardWidth - 24, height: 22, lineGap: 1 });
    });
    document.y = gridTop + Math.ceil(rows.length / 2) * 55;

    section("Resolution / topic", cleanText(event.resolution, 900));
    section("Important information", cleanText(event.judgeInstructions, 900) || cleanText(event.details, 700));
    section("What to expect", cleanText(event.expectations, 1200));
    section("Coach contact", coachContact(event));

    ensureSpace(58);
    document.moveDown(1);
    document.roundedRect(46, document.y, contentWidth, 45, 5).fill("#0d4e42");
    document.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
      .text("Please check the tournament page before leaving for the event.", 60, document.y + 15, { width: contentWidth - 28 });
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
  const rows = eventSummary(event, signup);
  const pageUrl = publicEventLink(event);
  const instructions = cleanText(event.judgeInstructions, 900);
  const expectations = cleanText(event.expectations, 1200);
  const eventRowsHtml = `<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0 20px;">${rowsAsHtml(rows)}</table>`;
  const eventRowsText = rowsAsText(rows);
  const pageHtml = `<p style="margin:20px 0;"><a href="${escapeHtml(pageUrl)}" style="display:inline-block;background:#0e3b2e;color:#fff;text-decoration:none;border-radius:5px;padding:11px 16px;font-weight:700;">View tournament details</a></p>`;
  const calendar = calendarAttachment(
    event,
    signup.id,
    kind === "signup-cancelled" || kind === "event-cancelled"
  );

  if (kind === "confirmation") {
    const itinerary = await itineraryAttachment(event, signup);
    const text = [
      `Hi ${name},`,
      "",
      `Thank you for volunteering with Cooper Debate. Your signup for ${eventName} is confirmed.`,
      "",
      eventRowsText,
      instructions ? `\nJudge instructions:\n${instructions}` : "",
      expectations ? `\nArrival and event expectations:\n${expectations}` : "",
      `\nTournament details: ${pageUrl}`,
      "A calendar file and printable PDF itinerary are attached. If you need to change your availability or contact information, please contact the coach listed above.",
    ].filter(Boolean).join("\n");
    const html = emailShell(
      "Your volunteer signup is confirmed",
      `Hi ${name}, thank you for volunteering with Cooper Debate. Your signup is confirmed.`,
      `${eventRowsHtml}${instructions ? `<h2 style="font-size:17px;">Judge instructions</h2><p style="line-height:1.55;">${escapeHtml(instructions).replaceAll("\n", "<br>")}</p>` : ""}` +
      `${expectations ? `<h2 style="font-size:17px;">Arrival and event expectations</h2><p style="line-height:1.55;">${escapeHtml(expectations).replaceAll("\n", "<br>")}</p>` : ""}` +
      `${pageHtml}`,
      "A calendar file and printable PDF itinerary are attached. To change your availability or contact information, please contact the coach listed above."
    );
    return { subject: `Confirmed: ${eventName} volunteer signup`, text, html, attachments: [calendar, itinerary].filter(Boolean) };
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
        if (data.status === "sent") return false;
        const startedAt = data.startedAt && data.startedAt.toMillis ? data.startedAt.toMillis() : 0;
        if (data.status === "sending" && startedAt && Date.now() - startedAt < STALE_SEND_MS) return false;
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
      return true;
    });
  }

  async function deliver({ key, kind, signup, event, changes }) {
    if (!signup || !validEmail(signup.email)) {
      console.error("Volunteer email skipped because the signup has no valid email address.", { kind, signupId: signup && signup.id });
      return { skipped: true };
    }
    const reserved = await reserveNotification({ key, kind, signup, event });
    if (!reserved) return { skipped: true };

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
      return { sent: true };
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

  async function sendSignupConfirmation(signup, event) {
    return deliver({
      key: notificationKey(signup.id, "confirmation"),
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