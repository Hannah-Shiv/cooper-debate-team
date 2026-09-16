const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("members-events.html", "utf8");
const client = fs.readFileSync("js/tryout-manager.js", "utf8");
const server = fs.readFileSync("functions/index.js", "utf8");

test("tryout form schedules Pair A against Pair B", () => {
  for (const id of ["tryout-a-one", "tryout-a-two", "tryout-b-one", "tryout-b-two"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(client, /pairAIds: ids\.slice\(0, 2\)/);
  assert.match(client, /pairBIds: ids\.slice\(2\)/);
  assert.match(server, /studentIds\.length !== 4 \|\| new Set\(studentIds\)\.size !== 4/);
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

test("tryout header uses two summary metrics and a button-style return control", () => {
  assert.doesNotMatch(html, /id="tryout-day-count"/);
  assert.match(html, /class="tryout-back" type="button"/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) repeat\(2,minmax\(125px,.22fr\)\)/);
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
  assert.match(html, /manually entered table is the official tryout schedule/i);
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