/*
 * Cooper Debate Team — Track Applications → Firestore sync
 *
 * Paste this file into the Apps Script project attached to the Google Form's
 * response spreadsheet. The form-submit trigger sends each new response to
 * the protected Firebase Cloud Function and writes the result into the three
 * tracking columns on the same row.
 *
 * Before using:
 *   1. Add these exact headers to row 1 of the Track Applications sheet:
 *        Firestore sync status
 *        Firestore application ID
 *        Firestore sync error
 *   2. Set the APPLICATION_SHEET_SYNC_SECRET script property to the same
 *      secret configured for the Firebase Cloud Function.
 *   3. Run installTrackApplicationsTrigger once and approve the permissions.
 */

const TRACK_APPLICATIONS_CONFIG = {
  sheetName: "Track Applications",
  headerRow: 1,
  syncEndpoint: "https://us-central1-cooper-debate-team.cloudfunctions.net/syncApplicationFromSheet",
  secretProperty: "APPLICATION_SHEET_SYNC_SECRET",
  statusHeader: "Firestore sync status",
  idHeader: "Firestore application ID",
  errorHeader: "Firestore sync error",
};

const TRACK_APPLICATIONS_DATE_LABELS = [
  "October 24th, 2026",
  "November 14th, 2026",
  "December 5th, 2026",
  "January 30th, 2027",
  "February 20th, 2027",
];

/*
 * These aliases are intentionally broad because Google Forms use the
 * question text as the response-sheet header. If the form uses different
 * wording, add that exact wording to the relevant list.
 */
const TRACK_APPLICATIONS_FIELD_ALIASES = {
  studentFirstName: ["Student first name", "Student's first name", "First name"],
  studentLastName: ["Student last name", "Student's last name", "Last name"],
  studentGrade: ["Student grade", "Grade", "What grade are you in?"],
  studentId: ["FCPS student ID", "FCPS ID", "Student ID", "Student number"],
  studentPersonalEmail: ["Student personal email", "Personal email", "Student email"],
  studentDebateExperience: ["Debate experience", "Previous debate experience"],
  studentPartner: ["Debate partner", "Partner", "Who is your debate partner?"],
  parentFirstName: ["Parent first name", "Parent/guardian first name", "Guardian first name"],
  parentLastName: ["Parent last name", "Parent/guardian last name", "Guardian last name"],
  parentEmail: ["Parent email", "Parent/guardian email", "Guardian email"],
  parentPhone: ["Parent phone", "Parent/guardian phone", "Guardian phone", "Phone number"],
  parentRelationship: ["Parent relationship", "Relationship to student", "Parent/guardian relationship"],
  qstSession: ["QST session", "QST attendance", "Did you attend the QST?"],
  september22Attendance: ["September 22 attendance", "September 22"],
  september23Attendance: ["September 23 attendance", "September 23"],
  tournamentDates: ["Tournament dates", "Which tournaments can you attend?", "Tournament availability"],
  tabroomAccount: ["Tabroom account", "Do you have a Tabroom account?"],
  contractAgreement: ["Contract agreement", "Do you agree to the team contract?"],
  contractReturn: ["Contract return", "Will you return the contract?"],
  whyJoin: ["Why do you want to join?", "Why join", "Why do you want to join the team?"],
  experienceDetail: ["Experience detail", "Tell us about your experience"],
  scheduleConflicts: ["Schedule conflicts", "Do you have any schedule conflicts?"],
  anythingElse: ["Anything else", "Anything else you would like us to know"],
  questionsForCoach: ["Questions for the coach", "Questions for Coach", "Questions"],
  parentSignature: ["Parent signature", "Parent/guardian signature", "Parent signature or typed name"],
  parentAgreement: ["Parent agreement", "Parent/guardian agreement", "I agree as a parent or guardian"],
  tuesdayMeetings: ["Tuesday meetings", "I can attend Tuesday meetings"],
  saturdayTournaments: ["Saturday tournaments", "I can attend Saturday tournaments"],
  partnerCommitment: ["Partner commitment", "I will communicate with my partner"],
  researchPreparation: ["Research and preparation", "Research & preparation", "I will complete research and preparation"],
  teamFee: ["Team fee", "Team fees", "I understand the team fee"],
  judgeVolunteer: ["Judge volunteer", "Judge courtesy", "I will help with judging"],
  transportation: ["Transportation", "I have transportation to tournaments"],
  googleMeets: ["Google Meets", "Google Meet", "I can attend Google Meets"],
  etiquette: ["Debate etiquette", "I agree to debate etiquette"],
};

function onTrackApplicationsFormSubmit(event) {
  if (!event || !event.range) throw new Error("This function must run from a spreadsheet form-submit trigger.");
  const sheet = event.range.getSheet();
  if (sheet.getName() !== TRACK_APPLICATIONS_CONFIG.sheetName) {
    throw new Error("The form response did not arrive on the Track Applications sheet.");
  }
  syncTrackApplicationsRow_(sheet, event.range.getRow());
}

function installTrackApplicationsTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "onTrackApplicationsFormSubmit") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onTrackApplicationsFormSubmit")
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();
}

function syncPendingTrackApplications() {
  const sheet = getTrackApplicationsSheet_();
  const columns = getTrackingColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < TRACK_APPLICATIONS_CONFIG.headerRow + 1) return;

  const statuses = sheet
    .getRange(TRACK_APPLICATIONS_CONFIG.headerRow + 1, columns.status + 1, lastRow - TRACK_APPLICATIONS_CONFIG.headerRow, 1)
    .getDisplayValues();
  statuses.forEach((row, index) => {
    if (row[0].trim().toLowerCase() !== "synced") {
      syncTrackApplicationsRow_(sheet, index + TRACK_APPLICATIONS_CONFIG.headerRow + 1);
    }
  });
}

function syncTrackApplicationsRow_(sheet, rowNumber) {
  const columns = getTrackingColumns_(sheet);
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(TRACK_APPLICATIONS_CONFIG.headerRow, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];
  const secret = PropertiesService.getScriptProperties().getProperty(TRACK_APPLICATIONS_CONFIG.secretProperty);
  if (!secret) throw new Error("Set the APPLICATION_SHEET_SYNC_SECRET script property before syncing.");

  writeTrackingResult_(sheet, rowNumber, columns, { status: "Syncing…", id: "", error: "" });

  try {
    const response = UrlFetchApp.fetch(TRACK_APPLICATIONS_CONFIG.syncEndpoint, {
      method: "post",
      contentType: "application/json",
      headers: { "X-Application-Sheet-Secret": secret },
      payload: JSON.stringify({
        application: buildApplication_(headers, values),
        source: {
          spreadsheetId: SpreadsheetApp.getActive().getId(),
          sheetName: sheet.getName(),
          rowNumber,
          submittedAt: values[0] || "",
        },
      }),
      muteHttpExceptions: true,
    });
    const responseText = response.getContentText() || "{}";
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      result = {};
    }
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || result.ok !== true) {
      throw new Error(result.error || "Firebase returned an unexpected response.");
    }
    writeTrackingResult_(sheet, rowNumber, columns, {
      status: "Synced",
      id: result.applicationId || "",
      error: "",
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : error).slice(0, 500);
    writeTrackingResult_(sheet, rowNumber, columns, { status: "Error", id: "", error: message });
    throw error;
  }
}

function buildApplication_(headers, values) {
  const row = {};
  headers.forEach((header, index) => {
    row[normalizeHeader_(header)] = values[index] || "";
  });
  const field = key => firstValue_(row, TRACK_APPLICATIONS_FIELD_ALIASES[key]);
  const studentName = field("studentFirstName") || field("studentLastName")
    ? null
    : splitName_(firstValue_(row, ["Student name", "Student's name", "Full name"]));

  return {
    season: "2026-2027",
    student: {
      firstName: field("studentFirstName") || (studentName && studentName.firstName) || "",
      lastName: field("studentLastName") || (studentName && studentName.lastName) || "",
      grade: field("studentGrade"),
      studentId: field("studentId"),
      personalEmail: field("studentPersonalEmail"),
      debateExperience: field("studentDebateExperience"),
      partner: field("studentPartner"),
    },
    parent: {
      firstName: field("parentFirstName"),
      lastName: field("parentLastName"),
      email: field("parentEmail"),
      phone: field("parentPhone"),
      relationship: field("parentRelationship"),
    },
    commitments: {
      tuesdayMeetings: isConfirmed_(field("tuesdayMeetings")),
      saturdayTournaments: isConfirmed_(field("saturdayTournaments")),
      partnerCommitment: isConfirmed_(field("partnerCommitment")),
      researchPreparation: isConfirmed_(field("researchPreparation")),
      teamFee: isConfirmed_(field("teamFee")),
      judgeVolunteer: isConfirmed_(field("judgeVolunteer")),
      transportation: isConfirmed_(field("transportation")),
      googleMeets: isConfirmed_(field("googleMeets")),
      etiquette: isConfirmed_(field("etiquette")),
    },
    eventDetails: {
      qstSession: field("qstSession"),
      september22Attendance: field("september22Attendance"),
      september23Attendance: field("september23Attendance"),
      tournamentDates: tournamentDates_(field("tournamentDates")),
      tabroomAccount: field("tabroomAccount"),
      contractAgreement: field("contractAgreement"),
      contractReturn: field("contractReturn"),
    },
    answers: {
      whyJoin: field("whyJoin"),
      experienceDetail: field("experienceDetail"),
      scheduleConflicts: field("scheduleConflicts"),
      anythingElse: field("anythingElse"),
      questionsForCoach: field("questionsForCoach"),
    },
    parentAgreement: isConfirmed_(field("parentAgreement")),
    parentSignature: field("parentSignature"),
  };
}

function getTrackApplicationsSheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TRACK_APPLICATIONS_CONFIG.sheetName);
  if (!sheet) throw new Error("Could not find the Track Applications sheet.");
  return sheet;
}

function getTrackingColumns_(sheet) {
  const headers = sheet.getRange(TRACK_APPLICATIONS_CONFIG.headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const normalized = headers.map(normalizeHeader_);
  const find = header => normalized.indexOf(normalizeHeader_(header));
  const status = find(TRACK_APPLICATIONS_CONFIG.statusHeader);
  const id = find(TRACK_APPLICATIONS_CONFIG.idHeader);
  const error = find(TRACK_APPLICATIONS_CONFIG.errorHeader);
  if ([status, id, error].some(index => index < 0)) {
    throw new Error("Add all three Firestore tracking headers to row 1 before syncing.");
  }
  return { status, id, error };
}

function writeTrackingResult_(sheet, rowNumber, columns, result) {
  sheet.getRange(rowNumber, columns.status + 1).setValue(result.status || "");
  sheet.getRange(rowNumber, columns.id + 1).setValue(result.id || "");
  sheet.getRange(rowNumber, columns.error + 1).setValue(result.error || "");
}

function firstValue_(row, aliases) {
  for (let index = 0; index < aliases.length; index += 1) {
    const value = row[normalizeHeader_(aliases[index])];
    if (value) return value;
  }
  return "";
}

function normalizeHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isConfirmed_(value) {
  const normalized = normalizeHeader_(value);
  return ["yes", "true", "checked", "confirmed", "agree", "i agree", "accepted", "will do"].includes(normalized) ||
    normalized.indexOf("i agree") === 0 ||
    normalized.indexOf("yes ") === 0;
}

function tournamentDates_(value) {
  const text = String(value || "");
  return TRACK_APPLICATIONS_DATE_LABELS.filter(date =>
    text.indexOf(date) >= 0 || text.indexOf(date.replace(", 2026", "").replace(", 2027", "")) >= 0
  );
}

function splitName_(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" "),
  };
}