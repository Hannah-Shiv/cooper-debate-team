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
  sheetName: "Form Responses 1",
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

/* The response-sheet headers use the Google Form's full question text. */
const TRACK_APPLICATIONS_FIELD_ALIASES = {
  respondentEmail: ["Email Address"],
  studentFullName: ["First and Last Name"],
  studentGrade: ["Grade"],
  studentSchoolEmail: ["SCHOOL Email"],
  studentDebateExperience: ["EXPERIENCE: Do you have any experience debating?"],
  whyJoin: ["WHY DEBATE?"],
  requiredEssay: ["REQUIRED ESSAY:"],
  studentPartner: ["Do you have a DEBATE PARTNER for Sept 22/23?"],
  qstSession: ["There will be/was an INFORMATION SESSION on September 10th during QST."],
  september22Attendance: ["I can attend the DEBATE TRYOUTS from 2:30 - 4:30 pm on Tuesday, September 22nd, 2026."],
  september23Attendance: ["I can attend DEBATE TRYOUTS from 2:30 - 4:30 pm on Wednesday, September 23rd, 2026"],
  partnerCommitment: ["COMMUNICATION:"],
  researchPreparation: ["PUBLIC FORUM DEBATE:"],
  tuesdayMeetings: ["COMMIT TO TUESDAY PRACTICES:"],
  tournamentDates: ["ATTEND DEBATE TOURNAMENTS on SATURDAYS:"],
  etiquette: ["RESPECT:"],
  contractAgreement: ["I have reviewed the DEBATE TEAM CONTRACT"],
  contractReturn: ["I will print, complete, and turn in the Debate Team Contract by October 2nd."],
  anythingElse: ["Anything else you'd like to add?"],
  questionsForCoach: ["Please note any comments or concerns here."],
  scheduleConflicts: ["OTHER ACTIVITIES:"],
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
  const responseRange = sheet.getRange(rowNumber, 1, 1, lastColumn);
  const values = responseValuesWithLinks_(responseRange);
  const rawTimestamp = responseRange.getCell(1, 1).getValue();
  const submittedAt = rawTimestamp instanceof Date && !isNaN(rawTimestamp.getTime())
    ? rawTimestamp.toISOString()
    : values[0] || "";
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
          submittedAt,
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
  const studentName = splitName_(field("studentFullName"));
  const responseEmail = field("respondentEmail");
  const schoolEmail = field("studentSchoolEmail");
  const tournamentDates = tournamentDates_(field("tournamentDates"));

  return {
    season: "2026-2027",
    student: {
      firstName: studentName.firstName,
      lastName: studentName.lastName,
      grade: normalizeGrade_(field("studentGrade")),
      studentId: studentIdFromSchoolEmail_(schoolEmail),
      schoolEmail,
      responseEmail,
      personalEmail: /@fcpsschools\.net$/i.test(responseEmail) ? "" : responseEmail,
      debateExperience: field("studentDebateExperience"),
      partner: field("studentPartner"),
    },
    parent: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      relationship: "",
    },
    commitments: {
      tuesdayMeetings: isConfirmed_(field("tuesdayMeetings")),
      saturdayTournaments: tournamentDates.length >= 3,
      partnerCommitment: isConfirmed_(field("partnerCommitment")),
      researchPreparation: isConfirmed_(field("researchPreparation")),
      teamFee: false,
      judgeVolunteer: false,
      transportation: false,
      googleMeets: false,
      etiquette: isConfirmed_(field("etiquette")),
    },
    eventDetails: {
      qstSession: field("qstSession"),
      september22Attendance: field("september22Attendance"),
      september23Attendance: field("september23Attendance"),
      tournamentDates,
      tabroomAccount: "",
      contractAgreement: field("contractAgreement"),
      contractReturn: field("contractReturn"),
    },
    answers: {
      whyJoin: field("whyJoin"),
      experienceDetail: field("studentDebateExperience"),
      requiredEssay: field("requiredEssay"),
      scheduleConflicts: field("scheduleConflicts"),
      anythingElse: field("anythingElse"),
      questionsForCoach: field("questionsForCoach"),
    },
    parentAgreement: false,
    parentSignature: "",
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
    const normalizedAlias = normalizeHeader_(aliases[index]);
    const exactValue = row[normalizedAlias];
    if (exactValue) return exactValue;
    const matchingHeader = Object.keys(row).find(header => header.indexOf(normalizedAlias) === 0);
    const value = matchingHeader ? row[matchingHeader] : "";
    if (value) return value;
  }
  return "";
}

function responseValuesWithLinks_(range) {
  const values = range.getDisplayValues()[0];
  const richValues = range.getRichTextValues()[0];
  return values.map((value, index) => {
    const richValue = richValues[index];
    if (!richValue) return value;
    const links = [];
    const directLink = richValue.getLinkUrl();
    if (directLink) links.push(directLink);
    richValue.getRuns().forEach(run => {
      const link = run.getLinkUrl();
      if (link && links.indexOf(link) < 0) links.push(link);
    });
    return links.length ? links.join("\n") : value;
  });
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
  if (
    !normalized ||
    /^(no|cannot|i cannot|unable|i am unable|i do not|not available)\b/.test(normalized)
  ) {
    return false;
  }
  return true;
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

function normalizeGrade_(value) {
  const normalized = normalizeHeader_(value);
  if (/\b7(th)?\b/.test(normalized)) return "7th Grade";
  if (/\b8(th)?\b/.test(normalized)) return "8th Grade";
  return String(value || "").trim();
}

function studentIdFromSchoolEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.endsWith("@fcpsschools.net") ? email.split("@")[0] : "";
}