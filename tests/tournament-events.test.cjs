const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPublicVolunteerEvent,
  newYorkCalendarDate,
  sanitizeEventType,
} = require("../functions/tournament-events");
const fs = require("node:fs");
const path = require("node:path");

test("event types are constrained to the supported values", () => {
  assert.equal(sanitizeEventType(" INTERNAL "), "internal");
  assert.equal(sanitizeEventType("tryout"), "tryout");
  assert.equal(sanitizeEventType("unexpected"), "external");
  assert.equal(sanitizeEventType(null), "external");
});

test("public volunteer events preserve legacy enabled records and reject closed events", () => {
  const today = "2025-02-10";
  const base = { published: true, date: today };
  assert.equal(isPublicVolunteerEvent(base, today), true);
  assert.equal(isPublicVolunteerEvent({ ...base, volunteerSignupsEnabled: false }, today), false);
  assert.equal(isPublicVolunteerEvent({ ...base, cancelled: true }, today), false);
  assert.equal(isPublicVolunteerEvent({ ...base, date: "2025-02-09" }, today), false);
  assert.equal(isPublicVolunteerEvent({ ...base, date: "not-a-date" }, today), false);
});

test("New York calendar date is used at midnight boundaries", () => {
  const instant = new Date("2025-02-10T04:30:00.000Z");
  assert.equal(newYorkCalendarDate(instant), "2025-02-09");
});

test("captains can enter tournaments but cannot delete them", () => {
  const browserSource = fs.readFileSync(path.join(__dirname, "../js/volunteer-admin.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");

  assert.ok(browserSource.includes('const canManagePrivateSignups = ["coach", "website-admin"].includes(currentUserRole);'));
  assert.ok(browserSource.includes('${canManagePrivateSignups ? `'));
  assert.ok(browserSource.includes('data-selected-delete'));
  assert.ok(browserSource.includes('if (role === "captain") $("tm-selected-signups")?.setAttribute("hidden", "");'));
  assert.ok(serverSource.includes('if (!hasFullAccess && !["saveEvent", "ensureTryoutEvents"].includes(action))'));
});