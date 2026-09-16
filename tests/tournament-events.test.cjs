const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPublicVolunteerEvent,
  newYorkCalendarDate,
  sanitizeEventType,
} = require("../functions/tournament-events");

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