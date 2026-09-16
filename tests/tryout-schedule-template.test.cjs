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
  assert.doesNotMatch(form, /\srequired(?:\s|>)/);
  assert.doesNotMatch(form, /<label[^>]*>[^<]*\*/);
  assert.match(client, /pairAIds: ids\.slice\(0, 2\)\.filter\(Boolean\)/);
  assert.match(client, /pairBIds: ids\.slice\(2\)\.filter\(Boolean\)/);
  assert.match(client, /draft \? "Draft"/);
  assert.match(server, /if \(date && \(date < template\.startDate \|\| date > template\.endDate\)\)/);
  assert.match(server, /if \(startTime && endTime && timeMinutes\(startTime\) >= timeMinutes\(endTime\)\)/);
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