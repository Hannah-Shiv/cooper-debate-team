const test = require("node:test");
const assert = require("node:assert/strict");
const {
  displayName,
  identityKey,
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