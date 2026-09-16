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
  assert.match(client, /pairAIds: ids\.slice\(0, 2\)\.filter\(Boolean\)/);
  assert.match(client, /pairBIds: ids\.slice\(2\)\.filter\(Boolean\)/);
  assert.match(server, /pairANames: selectedPairA\.map/);
  assert.match(server, /pairBNames: selectedPairB\.map/);
});

test("debates can be saved as drafts with every field optional", () => {
  const form = html.slice(html.indexOf('<form id="tryout-form"'), html.indexOf("</form>", html.indexOf('<form id="tryout-form"')));
  const debateFields = ["tryout-date", "tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two", "tryout-judge", "tryout-start", "tryout-end", "tryout-location", "tryout-notes"];
  debateFields.forEach(id => {
    const field = form.match(new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`))?.[0] || "";
    assert.ok(field);
    assert.doesNotMatch(field, /\srequired(?:\s|>)/);
  });
  assert.match(client, /pairAIds: ids\.slice\(0, 2\)\.filter\(Boolean\)/);
  assert.match(client, /pairBIds: ids\.slice\(2\)\.filter\(Boolean\)/);
  assert.match(client, /draft \? "Draft"/);
  assert.match(server, /if \(date && \(date < template\.startDate \|\| date > template\.endDate\)\)/);
  assert.match(server, /if \(startTime && endTime && timeMinutes\(startTime\) >= timeMinutes\(endTime\)\)/);
});

test("tryout settings and debate entries autosave without save buttons", () => {
  assert.match(html, /id="tryout-settings-status"[^>]*>Tournament saved</);
  assert.match(html, /id="tryout-record-status"[^>]*>Debate saved</);
  assert.doesNotMatch(html, /id="tryout-range-save"/);
  assert.doesNotMatch(html, /id="tryout-save"/);
  assert.match(client, /TEMPLATE_FIELDS\.forEach\(id => \$\(id\)\.addEventListener\("input", \(\) => scheduleTemplateSave\(\)\)\)/);
  assert.match(client, /ASSIGNMENT_FIELDS\.forEach\(id => \$\(id\)\.addEventListener\("input", \(\) => scheduleAssignmentSave\(\)\)\)/);
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
});

test("tournament date range stays internal and the pane uses the shorter Room label", () => {
  assert.match(html, /id="tryout-range-start" type="hidden"/);
  assert.match(html, /id="tryout-range-end" type="hidden"/);
  assert.doesNotMatch(html, /for="tryout-range-start"/);
  assert.doesNotMatch(html, /for="tryout-range-end"/);
  assert.match(html, /for="tryout-location">Room<\/label>/);
  assert.doesNotMatch(html, /Room \/ location/);
});

test("tryout manager typography is increased by fifteen percent", () => {
  assert.match(html, /#tryout-manager \.tm-field label\{font-size:\.63rem\}/);
  assert.match(html, /#tryout-manager \.tm-field input,[^}]*font-size:\.83rem/);
  assert.match(html, /#tryout-manager \.tryout-table td\{font-size:\.71rem\}/);
  assert.match(html, /#tryout-manager \.tryout-overview h2\{font-size:1\.98rem\}/);
});

test("debater fields search by name without exposing their source", () => {
  assert.match(html, /id="tryout-a-one" list="tryout-debater-options"/);
  assert.match(html, /id="tryout-debater-options"/);
  assert.match(client, /const debaterLabel = person =>/);
  assert.match(client, /debaters\.filter\(person => debaterLabel\(person\)\.toLowerCase\(\) === value\)/);
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
});

test("schedule rows fit without horizontal scrolling and use accessible row actions", () => {
  assert.match(client, /<th>#<\/th><th>Pair A/);
  assert.match(client, /class="tryout-row-number">\$\{index \+ 1\}/);
  assert.match(client, /class="tryout-student-stack"/);
  assert.match(client, /class="tryout-student-name"/);
  assert.match(client, /aria-label="Edit row \$\{index \+ 1\}"/);
  assert.match(client, /aria-label="Delete row \$\{index \+ 1\}"/);
  assert.match(html, /\.tryout-table-wrap\{max-width:100%;overflow-x:hidden\}/);
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
  assert.match(html, /input\[type="date"\].*background:#c9dced/);
  assert.match(html, /input\[type="time"\].*color-scheme:light/);
  assert.match(client, /input\.showPicker\(\)/);
  assert.match(client, /#tryout-manager input\[type="date"\], #tryout-manager input\[type="time"\]/);
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