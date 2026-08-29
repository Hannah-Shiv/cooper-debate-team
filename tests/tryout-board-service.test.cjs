const test = require("node:test");
const assert = require("node:assert/strict");
const {
  displayName,
  firstValidMutualPreference,
  identityKey,
  incomingRequestViews,
  normalizePreferenceIds,
  remainingPreferenceIds,
  validFcpsId,
} = require("../functions/tryout-board");

test("FCPS IDs must contain exactly seven digits", () => {
  assert.equal(validFcpsId("1234567"), true);
  assert.equal(validFcpsId("123456"), false);
  assert.equal(validFcpsId("12345678"), false);
  assert.equal(validFcpsId("123A567"), false);
  assert.equal(validFcpsId(" 1234567 "), true);
});

test("public labels never expose a full last name", () => {
  assert.equal(displayName("Jordan Student"), "Jordan S.");
  assert.equal(displayName("  Jordan   van Student  "), "Jordan S.");
  assert.equal(displayName("Jordan"), "Jordan");
});

test("identity keys are stable for the same FCPS ID and distinct across IDs", () => {
  const first = identityKey("1234567");
  assert.equal(first, identityKey("1234567"));
  assert.notEqual(first, identityKey("7654321"));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("1234567"), false);
});

test("legacy single partner requests become one-item preference lists", () => {
  assert.deepEqual(normalizePreferenceIds({ partnerId: "avery" }), ["avery"]);
  assert.deepEqual(normalizePreferenceIds({ partnerIds: ["avery", "blake", "avery", "casey", "devon", "ellis"] }), [
    "avery", "blake", "casey", "devon",
  ]);
});

test("the first valid mutual partner wins by submitted preference order", () => {
  const records = new Map([
    ["avery", { partnerIds: ["self"], pairedWith: null }],
    ["blake", { partnerIds: ["other"], pairedWith: null }],
    ["casey", { partnerIds: ["self"], pairedWith: null }],
    ["devon", { partnerIds: ["self"], pairedWith: "ellis" }],
  ]);
  const self = { partnerIds: ["blake", "avery", "casey", "devon"] };
  assert.equal(firstValidMutualPreference("self", self, records), "avery");
});

test("many unpaired students may include the same target in their preferences", () => {
  const records = new Map([
    ["target", { partnerIds: [], pairedWith: null }],
    ["first", { partnerIds: ["target"], pairedWith: null }],
    ["second", { partnerIds: ["target", "other"], pairedWith: null }],
  ]);
  assert.equal(normalizePreferenceIds(records.get("first")).includes("target"), true);
  assert.equal(normalizePreferenceIds(records.get("second")).includes("target"), true);
});

test("a locked target is removed without discarding lower-ranked choices", () => {
  const record = { partnerIds: ["avery", "blake", "casey", "devon"] };
  assert.deepEqual(remainingPreferenceIds(record, ["avery", "casey"]), ["blake", "devon"]);
});

test("incoming requests are private, session-matched, and privacy-safe", () => {
  const records = new Map([
    ["hannah", { name: "Hannah Shiv", grade: "8", session: "sep23", partnerIds: ["self"], pairedWith: null }],
    ["other-session", { name: "Other Student", grade: "7", session: "sep22", partnerIds: ["self"], pairedWith: null }],
    ["paired", { name: "Paired Student", grade: "8", session: "sep23", partnerIds: ["self"], pairedWith: "someone" }],
  ]);
  assert.deepEqual(incomingRequestViews("self", { session: "sep23" }, records), [{
    id: "hannah",
    displayName: "Hannah S.",
    grade: "8",
    session: "sep23",
  }]);
});