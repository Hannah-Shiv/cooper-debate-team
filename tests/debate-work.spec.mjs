import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TOPIC_ID,
  STAGES,
  signSession,
  verifySession,
  identityKey,
  normalizeStages,
  createDebateWorkHandler,
  sanitizeHtml,
} from "../functions/debate-work.js";

class FakeSnapshot {
  constructor(id, value) {
    this.id = id;
    this._value = value;
    this.exists = value !== undefined;
  }
  data() { return this._value; }
}

class FakeCollection {
  constructor() { this.records = new Map(); }
  doc(id) {
    return {
      id,
      get: async () => new FakeSnapshot(id, this.records.get(id)),
      set: async (value, options = {}) => this.records.set(id, options.merge ? { ...(this.records.get(id) || {}), ...value } : value),
    };
  }
  where(field, operator, expected) {
    return {
      get: async () => ({
        docs: [...this.records.entries()]
          .filter(([, value]) => operator !== "==" || value[field] === expected)
          .map(([id, value]) => new FakeSnapshot(id, value)),
      }),
    };
  }
  async get() {
    return { docs: [...this.records.entries()].map(([id, value]) => new FakeSnapshot(id, value)) };
  }
}

function fakeDb() {
  const collections = new Map();
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, new FakeCollection());
      return collections.get(name);
    },
    async runTransaction(callback) {
      const transaction = {
        get: ref => ref.get(),
        set: (ref, value, options) => ref.set(value, options),
      };
      return callback(transaction);
    },
  };
}

async function request(handler, body, authorization = "") {
  const response = {
    statusCode: 200,
    body: null,
    set() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await handler({
    method: "POST",
    body,
    headers: { authorization, "content-length": String(JSON.stringify(body).length) },
    ip: "test-client",
  }, response);
  return response;
}

test("editor HTML is reduced to the formatting allowlist with no attributes", () => {
  const safe = sanitizeHtml(
    '<p class="danger" onclick="alert(1)">Claim <strong>bold</strong> <em>em</em></p>' +
    '<script>alert("xss")</script><img src=x onerror=alert(1)><ul><li>Point</li></ul><br data-x="1">',
    30000
  );
  assert.equal(safe, "<p>Claim <strong>bold</strong> <em>em</em></p><ul><li>Point</li></ul><br>");
  assert.doesNotMatch(safe, /on\w+\s*=|<script|<img|class=/i);
});

test("student sessions are signed, expiring, and tamper resistant", () => {
  const secret = "test-session-secret";
  const token = signSession({ kind: "student", sub: identityKey("1234567"), cv: 2, exp: 5000 }, secret);
  assert.deepEqual(verifySession(token, secret, 4000).sub, identityKey("1234567"));
  assert.equal(verifySession(token, "different-secret", 4000), null);
  assert.equal(verifySession(token, secret, 5001), null);
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(verifySession(tampered, secret, 4000), null);
});

test("stage normalization always returns the five bounded stages", () => {
  const stages = normalizeStages({
    constructive: { content: "  case ", completed: true, extra: "discarded" },
    rebuttal: { sources: ["  https://example.com  ", 4] },
  });
  assert.deepEqual(Object.keys(stages), STAGES);
  assert.equal(stages.constructive.content, "case");
  assert.equal(stages.constructive.completed, true);
  assert.deepEqual(stages.rebuttal.sources, ["https://example.com"]);
  assert.equal(stages.crossfire.content, "");
  assert.equal(TOPIC_ID, "2026-data-centers");
});

test("handler authenticates eligible verified Google students and groups eligible records without work", async () => {
  const db = fakeDb();
  db.collection("debate_works").records.set(`${identityKey("1234567")}_pro`, {
    studentKey: identityKey("1234567"), fcpsId: "1234567", displayName: "Active Student",
    topicId: TOPIC_ID, side: "PRO", title: "Draft", stages: normalizeStages({}),
    status: "draft", revision: 1,
  });
  const handler = createDebateWorkHandler({
    db,
    verifyPortalToken: async token => token === "student-token"
      ? { uid: "student-uid", email: "1234567@fcpsschools.net", email_verified: true, name: "Active Student", firebase: { sign_in_provider: "google.com" } }
      : token === "website-admin-token"
        ? { uid: "website-admin-uid", email: "hannahbshiv@gmail.com", email_verified: true, name: "Hannah Shiv", firebase: { sign_in_provider: "google.com" } }
      : token === "ineligible-token"
        ? { uid: "other-uid", email: "7654321@fcpsschools.net", email_verified: true, firebase: { sign_in_provider: "google.com" } }
        : { uid: "coach", email: token },
    hasFullAdminAccess: async email => email === "coach@example.com",
    resolveStudentId: async ({ email }) => email === "hannahbshiv@gmail.com" ? "1806950" : email.split("@")[0],
    resolveStudentAccess: async ({ email, fcpsId }) => fcpsId === "1234567"
      ? { active: true, displayName: "Active Student" }
      : email === "hannahbshiv@gmail.com" && fcpsId === "1806950"
        ? { active: true, displayName: "Hannah Shiv" }
        : null,
    listEligibleStudents: async () => [
      { fcpsId: "1234567", displayName: "Active Student", active: true },
      { fcpsId: "7654321", displayName: "Eligible Student", active: true },
    ],
    sessionSecret: () => "test-session-secret",
    clientAddress: () => "contract-test",
  });
  const auth = await request(handler, { action: "authenticate", idToken: "student-token" });
  assert.equal(auth.statusCode, 200);
  assert.equal(auth.body.studentId, identityKey("1234567"));
  const ineligible = await request(handler, { action: "authenticate", idToken: "ineligible-token" });
  assert.equal(ineligible.statusCode, 401);
  const websiteAdmin = await request(handler, { action: "authenticate", idToken: "website-admin-token" });
  assert.equal(websiteAdmin.statusCode, 200);
  assert.equal(websiteAdmin.body.studentId, identityKey("1806950"));
  assert.equal(db.collection("debate_student_identities").records.get(identityKey("1234567")).firebaseUid, "student-uid");
  const coach = await request(handler, { action: "listCoachWorks" }, "Bearer coach@example.com");
  assert.equal(coach.statusCode, 200);
  assert.equal(coach.body.students.length, 3);
  assert.equal(coach.body.students.find(student => student.fcpsId === "7654321").works.PRO, null);
  assert.equal(coach.body.students.find(student => student.fcpsId === "1234567").works.PRO.status, "draft");

  const stages = Object.fromEntries(STAGES.map(stage => [stage, { content: "", notes: "", sources: [], completed: false }]));
  const saveBody = side => ({
    action: side === "submit" ? "submitStudentWork" : "saveStudentWork",
    sessionToken: auth.body.sessionToken,
    expectedRevision: side === "first" ? 1 : 2,
    work: { side: "PRO", topicId: TOPIC_ID, stages },
  });
  const firstSave = await request(handler, saveBody("first"));
  assert.equal(firstSave.statusCode, 200);
  const submitted = await request(handler, saveBody("submit"));
  assert.equal(submitted.statusCode, 200);
  const blockedSave = await request(handler, { ...saveBody("first"), expectedRevision: 3 });
  assert.equal(blockedSave.statusCode, 400);
  const blockedSubmit = await request(handler, { ...saveBody("submit"), expectedRevision: 3 });
  assert.equal(blockedSubmit.statusCode, 400);
  db.collection("debate_works").records.get(`${identityKey("1234567")}_pro`).feedback = {
    note: "Add impact comparison.", nextStep: "Revise weighing.", status: "needs-revision",
  };
  const reopened = await request(handler, { ...saveBody("first"), expectedRevision: 3 });
  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.body.work.status, "draft");
  assert.equal(reopened.body.work.feedback.note, "Add impact comparison.");
  assert.equal(reopened.body.work.feedback.nextStep, "Revise weighing.");
  assert.equal(reopened.body.work.feedback.status, "needs-revision");
  const resubmitted = await request(handler, { ...saveBody("submit"), expectedRevision: 4 });
  assert.equal(resubmitted.statusCode, 200);
  assert.equal(resubmitted.body.work.status, "submitted");
  assert.equal(resubmitted.body.work.feedback.status, "pending");
  const blockedAfterResubmit = await request(handler, { ...saveBody("first"), expectedRevision: 5 });
  assert.equal(blockedAfterResubmit.statusCode, 400);
  const blockedResubmitAgain = await request(handler, { ...saveBody("submit"), expectedRevision: 5 });
  assert.equal(blockedResubmitAgain.statusCode, 400);
});