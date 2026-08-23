const crypto = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const SENDER = "Cooper Debate Team <admin@cooperdebateteam.com>";
const STALE_SEND_MS = 10 * 60 * 1000;

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function row(label, value) {
  return value ? [label, value] : null;
}

function applicationRows(application) {
  const student = application.student || {};
  const parent = application.parent || {};
  const commitments = application.commitments || {};
  const answers = application.answers || {};

  return [
    row("Student name", `${student.firstName || ""} ${student.lastName || ""}`.trim()),
    row("Grade", student.grade),
    row("Student ID", student.studentId),
    row("Student school email", student.schoolEmail),
    row("Student personal email", student.personalEmail),
    row("Prior debate experience", student.debateExperience),
    row("Parent / guardian", `${parent.firstName || ""} ${parent.lastName || ""}`.trim()),
    row("Relationship to student", parent.relationship),
    row("Parent email", parent.email),
    row("Parent phone", parent.phone),
    row("Tuesday team meetings", commitments.tuesdayMeetings ? "Agreed" : ""),
    row("At least 3 of 5 Saturday tournaments", commitments.saturdayTournaments ? "Agreed" : ""),
    row("Partner commitment", commitments.partnerCommitment ? "Agreed" : ""),
    row("Independent research and preparation", commitments.researchPreparation ? "Agreed" : ""),
    row("Parent aware of team fee", commitments.teamFee ? "Agreed" : ""),
    row("Parent judge volunteer commitment", commitments.judgeVolunteer ? "Agreed" : ""),
    row("Parent transportation commitment", commitments.transportation ? "Agreed" : ""),
    row("Parent Google Meet commitment", commitments.googleMeets ? "Agreed" : ""),
    row("Why the student wants to join", answers.whyJoin),
    row("Debate or public speaking experience", answers.experienceDetail),
    row("Schedule conflicts", answers.scheduleConflicts),
    row("Additional notes", answers.anythingElse),
    row("Parent agreement", application.parentAgreement ? "Agreed" : ""),
    row("Parent typed signature", application.parentSignature),
  ].filter(Boolean);
}

function rowsAsText(rows) {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function rowsAsHtml(rows) {
  return rows.map(([label, value]) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#52606e;font-weight:700;vertical-align:top;width:35%;">${escapeHtml(label)}</td>` +
    `<td style="padding:7px 0;color:#1d2733;line-height:1.5;vertical-align:top;">${escapeHtml(value).replaceAll("\n", "<br>")}</td></tr>`
  ).join("");
}

function emailShell(title, intro, tableHtml, footer) {
  return [
    "<!doctype html><html><body style=\"margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1d2733;\">",
    "<div style=\"max-width:680px;margin:0 auto;padding:28px 16px;\">",
    "<div style=\"background:#0b2545;padding:20px 24px;color:#fff;border-radius:8px 8px 0 0;\">",
    "<strong style=\"font-size:18px;\">Cooper Debate Team</strong>",
    "</div><div style=\"background:#fff;padding:28px 24px;border-radius:0 0 8px 8px;\">",
    `<h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
    `<p style="line-height:1.55;margin:0 0 20px;">${escapeHtml(intro)}</p>`,
    `<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0 20px;">${tableHtml}</table>`,
    `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#667085;">${escapeHtml(footer)}</p>`,
    "</div></div></body></html>",
  ].join("");
}

function messageFor(application, recipientType) {
  const studentName = `${application.student.firstName} ${application.student.lastName}`.trim();
  const parentName = `${application.parent.firstName} ${application.parent.lastName}`.trim();
  const rows = applicationRows(application);
  const isCoach = recipientType === "coach";
  const title = isCoach
    ? `New application from ${studentName}`
    : "Your Cooper Debate Team application copy";
  const intro = isCoach
    ? `A new 2026–2027 Cooper Debate Team application was submitted by ${studentName}.`
    : `Thank you for applying to the Cooper Debate Team. This is a complete copy of ${studentName}'s 2026–2027 application.`;
  const footer = isCoach
    ? "This message was sent by the Cooper Debate Team application system."
    : `Coach Konde will review the application and follow up with ${parentName || "your family"} after the application deadline.`;

  return {
    subject: isCoach
      ? `New Cooper Debate Team application — ${studentName}`
      : `Copy: Cooper Debate Team application — ${studentName}`,
    text: `${title}\n\n${intro}\n\n${rowsAsText(rows)}\n\n${footer}`,
    html: emailShell(title, intro, rowsAsHtml(rows), footer),
  };
}

function notificationKey(applicationId, recipientType, recipients) {
  return crypto.createHash("sha256")
    .update(`${applicationId}:${recipientType}:${recipients.join(",")}`)
    .digest("hex");
}

function safeError(error) {
  return cleanText(error && error.message, 300) || "Email delivery could not be completed.";
}

function timestampMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function createApplicationEmailService({ db, resendSecret, coachEmails }) {
  async function reserveNotification(applicationId, recipientType, recipients) {
    const key = notificationKey(applicationId, recipientType, recipients);
    const reference = db.collection("application_email_notifications").doc(key);
    return db.runTransaction(async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists) {
        const data = existing.data();
        if (data.status === "accepted") {
          return { key, reference, alreadyAccepted: true, inProgress: false };
        }
        if (
          data.status === "sending" &&
          timestampMillis(data.startedAt) &&
          Date.now() - timestampMillis(data.startedAt) < STALE_SEND_MS
        ) {
          return { key, reference, alreadyAccepted: false, inProgress: true };
        }
      }
      transaction.set(reference, {
        applicationId,
        recipientType,
        recipients,
        status: "sending",
        attemptCount: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { key, reference, alreadyAccepted: false, inProgress: false };
    });
  }

  async function send(applicationId, application, recipientType, recipients) {
    const cleanRecipients = [...new Set(recipients
      .map(email => cleanText(email, 160).toLowerCase())
      .filter(Boolean))];
    if (!cleanRecipients.length) throw new Error("No valid email recipients were provided.");

    const reserved = await reserveNotification(applicationId, recipientType, cleanRecipients);
    if (reserved.alreadyAccepted) return { accepted: true, retry: false };
    if (reserved.inProgress) return { accepted: false, inProgress: true };

    try {
      const apiKey = resendSecret.value();
      if (!apiKey) throw new Error("The application email service is not configured.");
      const message = messageFor(application, recipientType);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reserved.key,
        },
        body: JSON.stringify({
          from: SENDER,
          to: cleanRecipients,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      const body = await response.text();
      let result = {};
      try {
        result = body ? JSON.parse(body) : {};
      } catch (_) {
        result = {};
      }
      if (!response.ok) {
        throw new Error(`Resend returned ${response.status}: ${cleanText(result.message || body, 200)}`);
      }
      await reserved.reference.set({
        status: "accepted",
        providerId: cleanText(result.id, 160),
        acceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { accepted: true, retry: true };
    } catch (error) {
      await reserved.reference.set({
        status: "failed",
        error: safeError(error),
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw error;
    }
  }

  async function sendApplicationCopies(applicationId, application) {
    const destinations = [
      { type: "coach", recipients: coachEmails },
      { type: "student", recipients: [application.student.personalEmail] },
      { type: "parent", recipients: [application.parent.email] },
    ];
    const results = await Promise.allSettled(destinations.map(destination =>
      send(applicationId, application, destination.type, destination.recipients)
    ));
    const failed = results.find(result => result.status === "rejected");
    if (failed) {
      throw failed.reason;
    }
    if (results.some(result => result.value && result.value.inProgress)) {
      throw new Error("Email delivery is already being processed. Please try again in a moment.");
    }
  }

  return { sendApplicationCopies };
}

module.exports = { createApplicationEmailService };