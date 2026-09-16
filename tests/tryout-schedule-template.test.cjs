const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("members-events.html", "utf8");
const client = fs.readFileSync("js/tryout-manager.js", "utf8");
const server = fs.readFileSync("functions/index.js", "utf8");
const volunteerClient = fs.readFileSync("js/volunteer-admin.js", "utf8");

test("tryout form preserves separate Pair A and Pair B records", () => {
  for (const id of ["tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(client, /pairAEntries/);
  assert.match(client, /pairBEntries/);
  assert.match(server, /pairANames: selectedPairA\.map/);
  assert.match(server, /pairBNames: selectedPairB\.map/);
});

test("debates save as drafts only after at least one debater is selected", () => {
  const form = html.slice(html.indexOf('<form id="tryout-form"'), html.indexOf("</form>", html.indexOf('<form id="tryout-form"')));
  const debateFields = ["tryout-date", "tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two", "tryout-judge", "tryout-start", "tryout-end", "tryout-location", "tryout-notes"];
  debateFields.forEach(id => {
    const field = form.match(new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`))?.[0] || "";
    assert.ok(field);
    assert.doesNotMatch(field, /\srequired(?:\s|>)/);
  });
  assert.match(client, /pairAIds: pairAEntries\.map/);
  assert.match(client, /pairBIds: pairBEntries\.map/);
  assert.match(client, /draft \? "Draft"/);
  assert.match(server, /if \(date && \(date < template\.startDate \|\| date > template\.endDate\)\)/);
  assert.match(server, /if \(startTime && endTime && timeMinutes\(startTime\) >= timeMinutes\(endTime\)\)/);
  assert.match(server, /if \(!\[\.\.\.incomingPairA, \.\.\.incomingPairB\]\.length\)/);
  assert.match(server, /Add at least one debater before saving this debate/);
});

test("coaches can save applicants and judges who are not in suggestions", () => {
  assert.match(html, /placeholder="Choose or type name · grade"/);
  assert.match(html, /placeholder="Choose or type any judge"/);
  assert.match(client, /function parseDebaterValue|const parseDebaterValue/);
  assert.match(client, /return \{ id: "", name: parts\[0\]\.trim\(\), grade:/);
  assert.doesNotMatch(client, /Choose typed debaters from the name suggestions/);
  assert.match(server, /const cleanTryoutEntries/);
  assert.match(server, /if \(!entry\.id\) return \{ id: "", name: entry\.name, grade: entry\.grade \}/);
  assert.match(server, /pairAEntries: selectedPairA/);
  assert.match(server, /pairBEntries: selectedPairB/);
  assert.match(client, /const typedDebaterValues = Object\.fromEntries/);
  assert.match(client, /editingId \? typedDebaterValues : \{\}/);
  assert.match(client, /const suggestionLabels = new Set\(debaters\.map\(debaterLabel\)\)/);
  assert.match(client, /assignments\.forEach\(item =>/);
});

test("Coach is a supported judge type", () => {
  assert.match(html, /<option value="coach">Coach<\/option>/);
  assert.match(server, /\["member", "coach", "high-school-student", "teacher", "parent", "other"\]/);
  assert.match(server, /coach: "Coach"/);
});

test("tryout settings and debate entries autosave without save buttons", () => {
  assert.match(html, /id="tryout-settings-status"[^>]*>Tournament saved</);
  assert.match(html, /id="tryout-record-status"[^>]*>Debate saved</);
  assert.doesNotMatch(html, /id="tryout-range-save"/);
  assert.doesNotMatch(html, /id="tryout-save"/);
  assert.match(client, /TEMPLATE_FIELDS\.forEach\(id => \$\(id\)\.addEventListener\("input", \(\) => scheduleTemplateSave\(\)\)\)/);
  assert.match(client, /ASSIGNMENT_FIELDS\.forEach\(id => \$\(id\)\.addEventListener\("input"/);
  assert.match(client, /scheduleAssignmentSave\(\)/);
  assert.match(client, /"Saved just now"/);
});

test("data entry uses a compact two-row grid above the full-width schedule", () => {
  const entryStart = html.indexOf('<form id="tryout-form"');
  const scheduleStart = html.indexOf('<section class="tryout-card tryout-schedule-card">');
  assert.ok(entryStart >= 0 && scheduleStart > entryStart);
  assert.match(html, /\.tryout-data-grid\{display:grid;gap:14px;grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(html, /\.tryout-data-grid>\.span-2\{grid-column:span 2\}/);
  assert.match(html, /\.tryout-data-grid>\.span-3\{grid-column:span 3\}/);
  assert.match(html, /class="tryout-pair-group pair-a"/);
  assert.match(html, /class="tryout-pair-group pair-b"/);
  assert.match(html, /\.tryout-pair-group\{[^}]*grid-column:span 3/);
  assert.match(html, /\.tryout-schedule-card\{margin-top:18px\}/);
  assert.match(html, /\.tryout-data-entry\{[^}]*margin-top:10px/);
});

test("tryout heading, data entry, and schedule grid use blue, dark-teal, and dark-blue palettes", () => {
  assert.match(html, /\.tryout-overview\{background:[^}]*linear-gradient\(120deg,#174990/);
  assert.match(html, /\.tryout-data-entry\{background:#0a343a\}/);
  assert.match(html, /\.tryout-data-entry h2\{color:#a7f3e6\}/);
  assert.match(html, /#tryout-manager \.tryout-data-entry \.tm-field input,[^}]*\{background:#08272d\}/);
  assert.match(html, /\.tryout-schedule-card\{background:[^}]*linear-gradient\(145deg,#0d2850,#071a36\)/);
  assert.match(html, /\.tryout-schedule-card h2\{color:#bfdbfe\}/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table tbody tr\{background:rgba\(18,52,96,.72\)\}/);
  assert.match(html, /\.tryout-overview h2,\.tryout-data-entry h2,\.tryout-schedule-card h2\{color:#ffe45c\}/);
});

test("tournament date range stays internal and the pane uses the shorter Room label", () => {
  assert.match(html, /id="tryout-range-start" type="hidden"/);
  assert.match(html, /id="tryout-range-end" type="hidden"/);
  assert.doesNotMatch(html, /for="tryout-range-start"/);
  assert.doesNotMatch(html, /for="tryout-range-end"/);
  assert.match(html, /for="tryout-location">Room<\/label>/);
  assert.doesNotMatch(html, /Room \/ location/);
});

test("tryout manager typography remains enlarged and the schedule receives an additional ten percent", () => {
  assert.match(html, /#tryout-manager \.tm-field label\{font-size:\.63rem\}/);
  assert.match(html, /#tryout-manager \.tm-field input,[^}]*font-size:\.83rem/);
  assert.match(html, /#tryout-manager \.tryout-table td\{font-size:\.78rem\}/);
  assert.match(html, /#tryout-manager \.tryout-overview h2\{font-size:1\.98rem\}/);
});

test("debater fields search by name without exposing their source", () => {
  assert.match(html, /id="tryout-a-one" list="tryout-debater-options"/);
  assert.match(html, /id="tryout-debater-options"/);
  assert.match(client, /const debaterLabel = person =>/);
  assert.match(client, /debaters\.find\(person => debaterLabel\(person\)\.toLowerCase\(\) === typed\.toLowerCase\(\)\)/);
  const optionsRenderer = client.slice(client.indexOf('$("tryout-debater-options").innerHTML'), client.indexOf("DEBATER_FIELDS.forEach"));
  assert.doesNotMatch(optionsRenderer, /sourceLabel/);
});

test("website admins have a visible way to open and leave the tryout schedule", () => {
  assert.match(html, /data-manager-mode="tryout">Tryout Schedule</);
  assert.match(html, /data-manager-mode="volunteers">← Back to All Tournaments</);
  assert.match(client, /\$\("volunteer-manager"\)\.hidden = tryout/);
  assert.doesNotMatch(fs.readFileSync("js/volunteer-admin.js", "utf8"), /appendChild\(tryoutManager\)/);
});

test("the main tournament grid includes a simplified tryout template row", () => {
  assert.match(client, /manage\(\{ action: "list" \}\)\.then/);
  assert.match(client, /tryout-template-loaded/);
  assert.match(volunteerClient, /Tournament Name<\/th><th>Date<\/th><th>Type/);
  assert.match(volunteerClient, /Internal Tryouts/);
  assert.match(volunteerClient, /item\?\.isTryoutTemplate/);
  assert.match(volunteerClient, /data-edit-tryout aria-label="Edit tryout tournament"/);
  assert.match(volunteerClient, /class="tm-type-cell"/);
  assert.match(volunteerClient, /row\.querySelector\("\[data-edit-tryout\]"\)/);
  assert.match(volunteerClient, /\.filter\(event => event\.eventType !== "tryout"\)/);
  assert.doesNotMatch(html, /id="event-grid-status"/);
  const gridMarkup = volunteerClient.slice(volunteerClient.indexOf('tm-data-table tm-tournament-index'), volunteerClient.indexOf('root.querySelectorAll("[data-event]")'));
  assert.doesNotMatch(gridMarkup, /Volunteers|Partners|tm-table-toggle|tm-grid-status/);
});

test("tryout header uses two summary metrics and a button-style return control", () => {
  assert.doesNotMatch(html, /id="tryout-day-count"/);
  assert.match(html, /class="tryout-back" type="button"/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) repeat\(2,minmax\(125px,.22fr\)\)/);
  assert.match(html, /<span>Finalized<\/span><strong id="tryout-finalized-count">0<\/strong>/);
  assert.match(html, /<span>Drafts<\/span><strong id="tryout-draft-count">0<\/strong>/);
  assert.doesNotMatch(html, /<span>Debaters<\/span>/);
  assert.match(client, /const draftCount = assignments\.filter\(isDraft\)\.length/);
  assert.match(client, /\$\("tryout-finalized-count"\)\.textContent = assignments\.length - draftCount/);
  assert.match(client, /\$\("tryout-draft-count"\)\.textContent = draftCount/);
});

test("schedule rows fit without horizontal scrolling and use accessible row actions", () => {
  assert.match(client, /<th><span>#<\/span><\/th><th><span>Pair A<\/span>/);
  assert.match(client, /class="tryout-row-number">\$\{index \+ 1\}/);
  assert.match(client, /class="tryout-student-stack"/);
  assert.match(client, /class="tryout-student-name"/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table th span\{[^}]*background:#03152d/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table th span\{[^}]*display:inline-flex/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table th span\{[^}]*min-height:24px/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table th span\{[^}]*padding:5px 9px/);
  assert.match(html, /\.tryout-schedule-card \.tryout-table th span\{[^}]*color|\.tryout-schedule-card \.tryout-table th\{[^}]*color:#ffe45c/);
  assert.match(client, /aria-label="Edit row \$\{index \+ 1\}"/);
  assert.match(client, /aria-label="Delete row \$\{index \+ 1\}"/);
  assert.match(client, /class="tryout-action-divider"/);
  assert.match(html, /\.tryout-row-actions svg\{[^}]*height:15px/);
  assert.match(html, /\.tryout-table-wrap\{[^}]*max-width:100%;overflow-x:hidden\}/);
});

test("visible debate grid can be saved through a color landscape PDF layout", () => {
  assert.match(html, /id="tryout-save-pdf"[^>]*>[\s\S]*Save landscape PDF/);
  assert.match(html, /js\/vendor\/pdfkit\.standalone\.js/);
  assert.match(client, /function saveSchedulePdf\(\)/);
  assert.match(client, /const visible = visibleAssignments\(\)/);
  assert.match(client, /new window\.PDFDocument\(\{/);
  assert.match(client, /layout: "landscape"/);
  assert.match(client, /window\.showSaveFilePicker/);
  assert.match(client, /application\/pdf/);
  assert.match(client, /doc\.page\.height - 36/);
  assert.doesNotMatch(client.slice(client.indexOf("async function saveSchedulePdf"), client.indexOf('document.addEventListener("DOMContentLoaded"')), /printWindow|window\.print/);
  assert.match(client, /\$\("tryout-save-pdf"\)\.addEventListener\("click", saveSchedulePdf\)/);
});

test("schedule grid supports search, record-completeness filtering, sorting, and result counts", () => {
  assert.match(html, /id="tryout-schedule-search"/);
  assert.match(html, /data-tryout-sort="date"/);
  assert.match(html, /data-tryout-sort="time"/);
  assert.match(html, /data-tryout-sort="judge"/);
  assert.doesNotMatch(html, /data-tryout-sort="pair"/);
  assert.match(html, /data-tryout-filter="all"/);
  assert.match(html, /data-tryout-filter="draft"/);
  assert.match(html, /data-tryout-filter="finalized"/);
  assert.doesNotMatch(html, /id="tryout-schedule-filter"/);
  assert.match(html, /id="tryout-schedule-count"/);
  assert.match(client, /function visibleAssignments\(\)/);
  assert.match(client, /searchable\.includes\(query\)/);
  assert.match(client, /scheduleSortDirection \*= -1/);
});

test("schedule separates date and time, shows grades, and derives Draft or Finalized from completeness", () => {
  assert.match(client, /<th><span>#<\/span><\/th><th><span>Pair A<\/span><\/th><th><span>Pair B<\/span><\/th><th><span>Date<\/span><\/th><th><span>Time<\/span>/);
  assert.match(client, /data-label="Date"/);
  assert.match(client, /data-label="Time"/);
  assert.match(client, /class="tryout-grade"/);
  assert.match(client, /const pairBCount = pairNames\(item, "b"\)\.length/);
  assert.match(client, /pairBCount !== 2/);
  assert.doesNotMatch(html, /Pair B · Optional/);
  assert.match(client, /\$\{draft \? "Draft" : "Finalized"\}/);
  assert.match(html, /\.tryout-table \.tryout-grade\{background:#0b2d5c/);
  assert.match(html, /\.tryout-table \.tryout-grade\{[^}]*border-radius:50%/);
  assert.match(html, /\.tryout-table \.tryout-grade\{[^}]*color:#ffe45c/);
  assert.match(html, /\.tryout-table \.tryout-grade\{[^}]*height:24px/);
});

test("entire tryout schedule grid typography is increased by ten percent", () => {
  assert.match(html, /#tryout-manager \.tryout-table th\{font-size:\.64rem\}/);
  assert.match(html, /#tryout-manager \.tryout-table td\{font-size:\.78rem\}/);
  assert.match(html, /#tryout-manager \.tryout-table td::before\{font-size:\.64rem\}/);
  assert.match(html, /#tryout-manager \.tryout-table td small\{font-size:\.68rem\}/);
});

test("deleting a tryout row uses an in-page confirmation modal", () => {
  assert.match(html, /id="tryout-delete-modal"/);
  assert.match(html, /id="tryout-delete-summary"/);
  assert.match(html, /id="tryout-delete-confirm"/);
  assert.match(client, /openDeleteModal\(button\.dataset\.tryoutDelete, button\)/);
  assert.match(client, /\$\("tryout-delete-confirm"\)\.addEventListener\("click", deleteAssignment\)/);
  assert.doesNotMatch(client, /\bconfirm\(/);
});

test("date and time fields use visible native pickers across the full input", () => {
  assert.match(html, /input\[type="date"\].*background:#071a36/);
  assert.match(html, /input\[type="time"\].*color-scheme:dark/);
  assert.match(client, /input\.showPicker\(\)/);
  assert.match(client, /#tryout-manager input\[type="date"\], #tryout-manager input\[type="time"\]/);
});

test("tryout times show AM or PM and room identifies the school location", () => {
  assert.match(html, /id="tryout-start-period"[^>]*>AM \/ PM<\/span>/);
  assert.match(html, /id="tryout-end-period"[^>]*>AM \/ PM<\/span>/);
  assert.match(html, /\.tryout-time-box\{[^}]*min-height:102px/);
  assert.match(client, /hour >= 12 \? "PM" : "AM"/);
  assert.match(html, /input\[type="time"\]::-webkit-datetime-edit-ampm-field\{display:none\}/);
  assert.match(html, /class="tryout-room-stack"/);
  assert.match(html, /class="tryout-location-display"[^>]*><b>Location<\/b>Cooper Middle School/);
  assert.match(html, /\.tryout-room-stack\{[^}]*height:102px/);
});

test("blank debates do not autosave and member judges omit directory source text", () => {
  assert.match(client, /!DEBATER_FIELDS\.some\(id => \$\(id\)\.value\.trim\(\)\)/);
  assert.match(client, /Add a debater to begin saving\./);
  assert.match(client, /item\.judgeType !== "member"/);
  assert.doesNotMatch(client, /person\.sourceLabel \|\| "Members Directory"/);
  assert.match(html, /<option value="member">Member<\/option>/);
});

test("tryout template uses a reusable date range", () => {
  assert.match(html, /id="tryout-tournament-name"/);
  assert.match(html, /id="tryout-range-start"/);
  assert.match(html, /id="tryout-range-end"/);
  assert.match(client, /action: "saveTemplate"/);
  assert.match(client, /templateRevision \+= 1/);
  assert.match(client, /requestedAtRevision !== templateRevision/);
  assert.match(server, /tryout_tournaments/);
  assert.match(server, /date < startDate \|\| date > endDate/);
  assert.match(server, /template = \{ \.\.\.currentTemplate, title, startDate, endDate \}/);
  assert.doesNotMatch(html, /Reusable tryout tournament template/);
  assert.match(html, /Manually create debate schedule/);
});

test("debater and judge pools expose only schedule-safe projections", () => {
  assert.match(server, /db\.collection\("applications"\)\.get\(\)/);
  assert.match(server, /db\.collection\("members"\)\.get\(\)/);
  assert.match(server, /sourceLabel: sources\.length > 1 \? "Member & Applicant"/);
  assert.doesNotMatch(server.slice(server.indexOf("async function buildTryoutPeoplePools"), server.indexOf("// Coaches, Captains")), /schoolEmail|personalEmail|parent|phone|notes/);
  assert.match(html, /High-school student/);
  assert.match(html, /Teacher/);
  assert.match(html, /Parent/);
});

test("manual schedule does not run automatic assignment conflict checks", () => {
  const handler = server.slice(server.indexOf("exports.manageTryoutSchedule"), server.indexOf("exports.manageTryoutSchedule") + 20000);
  assert.doesNotMatch(handler, /already scheduled|already judging|already in use/);
  assert.match(html, /Saved drafts and completed debates appear here/i);
});

test("legacy one-pair records remain readable", () => {
  assert.match(server, /pairAIds: Array\.isArray\(data\.pairAIds\) \? data\.pairAIds\.slice\(0, 2\) : hydratedLegacyIds/);
  assert.match(server, /pairBIds: Array\.isArray\(data\.pairBIds\) \? data\.pairBIds\.slice\(0, 2\) : \[\]/);
  assert.match(client, /item\.pairAIds \|\| item\.studentIds \|\| \[\]/);
});

test("captains can edit debates but only full admins can delete or change the range", () => {
  assert.match(server, /Only Coaches and Website Admins can change the tryout tournament settings/);
  assert.match(server, /Only Coaches and Website Admins can delete tryout debates/);
  assert.match(client, /canDelete = event\.detail\?\.role !== "captain"/);
  assert.match(server, /belongsToTemplate\(existingSnap\.data\(\), template\)/);
  assert.match(server, /Move or delete debates outside the new date range before shortening it/);
  assert.match(server, /db\.runTransaction\(async transaction/);
  assert.match(server, /matches\.length === 1 \? matches\[0\] : ""/);
});