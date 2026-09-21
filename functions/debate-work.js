const crypto = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const TOPIC_ID = "2026-data-centers";
const SIDES = new Set(["PRO", "CON"]);
const STAGES = ["constructive", "crossfire", "rebuttal", "summary", "finalFocus"];
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 700000;
const GENERIC_AUTH_ERROR = "Use an eligible FCPS Google account to enter the Debate Prep Studio.";
const ACTIONS = new Set([
  "authenticate", "listStudentWorks", "getStudentWork", "saveStudentWork",
  "submitStudentWork", "listCoachWorks", "getCoachWork", "saveCoachFeedback",
]);
const HTML_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li"]);

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizeHtml(value, maxLength) {
  let html = text(value, maxLength);
  html = html.replace(/<(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?([a-z][\w:-]*)\b[^>]*>/gi,
    (tag, name) => {
      const lower = name.toLowerCase();
      if (!HTML_TAGS.has(lower)) return "";
      return lower === "br" ? "<br>" : (tag.startsWith("</") ? `</${lower}>` : `<${lower}>`);
    });
}

function fcpsId(value) {
  const normalized = text(value, 32);
  return /^\d{7}$/.test(normalized) ? normalized : "";
}

function identityKey(id) {
  return crypto.createHash("sha256").update(`${TOPIC_ID}:${id}`).digest("hex");
}

function safeSide(value) {
  const side = text(value, 8).toUpperCase();
  return SIDES.has(side) ? side : "";
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function signSession(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(token, secret, now = Date.now()) {
  try {
    const [encoded, signature] = String(token || "").split(".");
    if (!encoded || !signature || !constantTimeEqual(
      crypto.createHmac("sha256", secret).update(encoded).digest("base64url"), signature
    )) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.kind !== "student" || !payload.sub || !payload.cv || Number(payload.exp) <= now) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function emptyStages() {
  return Object.fromEntries(STAGES.map(stage => [stage, {
    content: "", notes: "", sources: [], completed: false,
  }]));
}

function normalizeStage(value) {
  const source = value && typeof value === "object" ? value : {};
  const sources = Array.isArray(source.sources)
    ? source.sources.filter(item => typeof item === "string").map(item => text(item, 500)).filter(Boolean).slice(0, 20)
    : [];
  return {
    content: sanitizeHtml(source.content, 30000),
    notes: sanitizeHtml(source.notes, 10000),
    sources,
    completed: source.completed === true,
  };
}

function normalizeStages(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(STAGES.map(stage => [stage, normalizeStage(source[stage])]));
}

function normalizedWork(work) {
  const source = work && typeof work === "object" ? work : {};
  const allowedWorkKeys = new Set(["topicId", "side", "title", "resolution", "stages"]);
  if (Object.keys(source).some(key => !allowedWorkKeys.has(key))) throw new Error("Debate work has an unsupported field.");
  if (!source.stages || typeof source.stages !== "object" || Array.isArray(source.stages)) {
    throw new Error("Debate work must include all five stages.");
  }
  const allowedStageKeys = new Set(["content", "notes", "sources", "completed"]);
  if (Object.keys(source.stages).some(key => !STAGES.includes(key)) ||
      STAGES.some(stage => !Object.prototype.hasOwnProperty.call(source.stages, stage))) {
    throw new Error("Debate work must include exactly the five supported stages.");
  }
  for (const stage of STAGES) {
    const value = source.stages[stage];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowedStageKeys.has(key))) {
      throw new Error("Debate work contains an unsupported stage field.");
    }
  }
  const side = safeSide(source.side);
  if (!side || (source.topicId && text(source.topicId, 80) !== TOPIC_ID)) {
    throw new Error("Choose a valid debate side.");
  }
  return {
    topicId: TOPIC_ID,
    side,
    title: text(source.title, 200),
    resolution: text(source.resolution, 1000),
    stages: normalizeStages(source.stages),
  };
}

function publicWork(id, data) {
  const feedback = data.feedback && typeof data.feedback === "object" ? data.feedback : {};
  return {
    id,
    topicId: TOPIC_ID,
    side: data.side,
    title: text(data.title, 200),
    resolution: text(data.resolution, 1000),
    stages: normalizeStages(data.stages),
    status: data.status === "submitted" ? "submitted" : "draft",
    revision: Number(data.revision) || 0,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    submittedAt: data.submittedAt || null,
    feedback: {
      note: text(feedback.note, 12000),
      nextStep: text(feedback.nextStep, 12000),
      status: ["pending", "reviewed", "needs-revision"].includes(feedback.status)
        ? feedback.status : "pending",
      updatedAt: feedback.updatedAt || null,
    },
  };
}

function clientAddress(req) {
  const forwarded = text(req.headers["x-forwarded-for"], 512);
  return (forwarded ? forwarded.split(",").at(-1) : req.ip || "").trim() || "unknown";
}

function bearer(req) {
  const header = text(req.headers.authorization, 4096);
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function createDebateWorkHandler({
  db,
  verifyPortalToken,
  hasFullAdminAccess,
  resolveStudentId,
  resolveStudentAccess,
  listEligibleStudents = async () => [],
  sessionSecret,
  clientAddress: getClientAddress = clientAddress,
}) {
  const studentIdentities = db.collection("debate_student_identities");
  const works = db.collection("debate_works");
  const limits = db.collection("debate_work_action_limits");

  async function rateLimit(req, action) {
    const fingerprint = crypto.createHash("sha256")
      .update(`${getClientAddress(req)}:${action}`).digest("hex");
    const ref = limits.doc(fingerprint);
    const now = Date.now();
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const data = snap.exists ? snap.data() : {};
      const windowStartedAtMs = Number(data.windowStartedAtMs) || now;
      const inWindow = now - windowStartedAtMs < RATE_WINDOW_MS;
      const count = inWindow ? Number(data.count) || 0 : 0;
      const max = action === "authenticate" ? 10 : 300;
      if (count >= max) throw new Error("Too many requests. Please wait a few minutes and try again.");
      transaction.set(ref, {
        count: count + 1,
        windowStartedAtMs: inWindow ? windowStartedAtMs : now,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  async function studentFromToken(token) {
    const payload = verifySession(token, sessionSecret());
    if (!payload) throw new Error(GENERIC_AUTH_ERROR);
    const snap = await studentIdentities.doc(payload.sub).get();
    if (!snap.exists || snap.data().active !== true ||
        Number(snap.data().authVersion) !== Number(payload.cv)) {
      throw new Error(GENERIC_AUTH_ERROR);
    }
    return { key: payload.sub, data: snap.data() };
  }

  async function requireCoach(req) {
    const token = bearer(req);
    if (!token) throw new Error("Coach authentication is required.");
    let decoded;
    try {
      decoded = await verifyPortalToken(token);
    } catch (_) {
      throw new Error("Coach authentication is required.");
    }
    const email = text(decoded && decoded.email, 160).toLowerCase();
    if (!email || !(await hasFullAdminAccess(email))) throw new Error("Coach authorization is required.");
    return { uid: decoded.uid, email };
  }

  function workRef(studentKey, side) {
    return works.doc(`${studentKey}_${side.toLowerCase()}`);
  }

  async function authenticate(body) {
    const idToken = text(body.idToken, 10000);
    if (!idToken) throw new Error(GENERIC_AUTH_ERROR);
    let decoded;
    try {
      decoded = await verifyPortalToken(idToken);
    } catch (_) {
      throw new Error(GENERIC_AUTH_ERROR);
    }
    const email = text(decoded?.email, 320).toLowerCase();
    const id = fcpsId(typeof resolveStudentId === "function"
      ? await resolveStudentId({ decoded, email })
      : email.split("@")[0]);
    const isGoogle = decoded?.firebase?.sign_in_provider === "google.com";
    if (!decoded?.uid || decoded.email_verified !== true || !isGoogle || !id || typeof resolveStudentAccess !== "function") {
      throw new Error(GENERIC_AUTH_ERROR);
    }
    const eligibility = await resolveStudentAccess({ decoded, email, fcpsId: id });
    if (!eligibility || eligibility.active !== true) throw new Error(GENERIC_AUTH_ERROR);
    const key = identityKey(id);
    const ref = studentIdentities.doc(key);
    let data;
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const current = snap.exists ? snap.data() : {};
      data = {
        fcpsId: id,
        displayName: text(eligibility.displayName, 160) || text(decoded.name, 160) || id,
        email,
        firebaseUid: decoded.uid,
        authVersion: Number(current.authVersion) || 1,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: current.createdAt || FieldValue.serverTimestamp(),
      };
      transaction.set(ref, data, { merge: true });
    });
    return {
      sessionToken: signSession({
        kind: "student", sub: key, cv: Number(data.authVersion) || 1,
        exp: Date.now() + SESSION_TTL_MS,
      }, sessionSecret()),
      student: {
        id: key,
        displayName: text(data.displayName, 160),
        topicId: TOPIC_ID,
      },
      studentId: key,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
  }

  async function listStudentWorks(body) {
    const student = await studentFromToken(body.sessionToken);
    const snap = await works.where("studentKey", "==", student.key).get();
    return { works: snap.docs.map(doc => publicWork(doc.id, doc.data())) };
  }

  async function getStudentWork(body) {
    const student = await studentFromToken(body.sessionToken);
    const side = safeSide(body.side);
    if (!side) throw new Error("Choose a valid debate side.");
    const snap = await workRef(student.key, side).get();
    return { work: snap.exists ? publicWork(snap.id, snap.data()) : null };
  }

  async function saveStudentWork(body, submit = false) {
    const student = await studentFromToken(body.sessionToken);
    const work = normalizedWork(body.work);
    const ref = workRef(student.key, work.side);
    let output;
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const current = existing.exists ? existing.data() : null;
      if (!Object.prototype.hasOwnProperty.call(body, "expectedRevision")) {
        throw new Error("A revision is required when saving debate work.");
      }
      const expected = Number(body.expectedRevision);
      if (!Number.isInteger(expected) || expected < 0 || expected !== (current ? Number(current.revision) : 0)) {
        throw new Error("This debate work changed on another device. Refresh before saving.");
      }
      const revisionsRequested = current?.feedback?.status === "needs-revision";
      if (current && current.status === "submitted" && !revisionsRequested) {
        throw new Error("Submitted debate work cannot be edited.");
      }
      const reopening = current?.status === "submitted" && !submit;
      const nextFeedback = submit && revisionsRequested
        ? { ...current.feedback, status: "pending", updatedAt: Timestamp.now() }
        : (current?.feedback || null);
      const record = {
        ...work, studentKey: student.key, fcpsId: student.data.fcpsId,
        displayName: text(student.data.displayName, 160),
        status: submit ? "submitted" : (reopening ? "draft" : "draft"),
        revision: expected + 1, updatedAt: Timestamp.now(), createdAt: current?.createdAt || Timestamp.now(),
        submittedAt: submit ? Timestamp.now() : (reopening ? null : (current?.submittedAt || null)),
        feedback: nextFeedback,
      };
      transaction.set(ref, record);
      output = publicWork(ref.id, record);
    });
    return { work: output };
  }

  async function listCoachWorks(req) {
    await requireCoach(req);
    const [studentSnap, workSnap, eligibleStudents] = await Promise.all([
      studentIdentities.get(),
      works.where("topicId", "==", TOPIC_ID).get(),
      listEligibleStudents(),
    ]);
    const workByStudent = new Map();
    workSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!workByStudent.has(data.studentKey)) workByStudent.set(data.studentKey, {});
      workByStudent.get(data.studentKey)[safeSide(data.side)] = {
        id: doc.id,
        topicId: TOPIC_ID,
        side: safeSide(data.side),
        title: text(data.title, 200),
        status: data.status === "submitted" ? "submitted" : "draft",
        revision: Number(data.revision) || 0,
        updatedAt: data.updatedAt || null,
        submittedAt: data.submittedAt || null,
        feedback: publicWork(doc.id, data).feedback,
      };
    });
    const studentRecords = new Map();
    (Array.isArray(eligibleStudents) ? eligibleStudents : []).forEach(student => {
      const id = fcpsId(student.fcpsId);
      if (id) studentRecords.set(identityKey(id), {
        fcpsId: id,
        displayName: text(student.displayName, 160) || id,
        active: student.active !== false,
      });
    });
    studentSnap.docs.forEach(doc => {
      const existing = studentRecords.get(doc.id) || {};
      studentRecords.set(doc.id, { ...existing, ...doc.data() });
    });
    workByStudent.forEach((_, key) => {
      if (!studentRecords.has(key)) studentRecords.set(key, {});
    });
    const students = [...studentRecords.entries()].map(([studentKey, data]) => {
      const studentWorks = workByStudent.get(studentKey) || {};
      return {
        id: studentKey,
        topicId: TOPIC_ID,
        fcpsId: text(data.fcpsId, 32),
        displayName: text(data.displayName, 160),
        active: data.active === true,
        works: {
          PRO: studentWorks.PRO || null,
          CON: studentWorks.CON || null,
        },
      };
    });
    return {
      students,
      // Preserve the original flat summary for existing coach consumers while
      // making the grouped student view authoritative for access management.
      works: students.flatMap(student => Object.values(student.works).filter(Boolean).map(work => ({
        ...work,
        studentId: student.id,
        fcpsId: student.fcpsId,
        displayName: student.displayName,
      }))),
    };
  }

  async function getCoachWork(req, body) {
    await requireCoach(req);
    const id = text(body.workId, 160);
    const snap = await works.doc(id).get();
    if (!snap.exists) throw new Error("Debate work was not found.");
    return { work: publicWork(snap.id, snap.data()), student: {
      fcpsId: text(snap.data().fcpsId, 32), displayName: text(snap.data().displayName, 160),
    } };
  }

  async function saveCoachFeedback(req, body) {
    await requireCoach(req);
    const ref = works.doc(text(body.workId, 160));
    const note = text(body.feedback?.note, 12000);
    const nextStep = text(body.feedback?.nextStep, 12000);
    const status = ["pending", "reviewed", "needs-revision"].includes(body.feedback?.status)
      ? body.feedback.status : "pending";
    let output;
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error("Debate work was not found.");
      const data = snap.data();
      if (Number(body.expectedRevision) !== Number(data.revision)) {
        throw new Error("This debate work changed on another device. Refresh before saving.");
      }
      const next = { ...data, revision: Number(data.revision) + 1, updatedAt: Timestamp.now(),
        feedback: { note, nextStep, status, updatedAt: Timestamp.now() } };
      transaction.set(ref, next);
      output = publicWork(ref.id, next);
    });
    return { work: output };
  }

  return async (req, res) => {
    if (req.method !== "POST") { res.set("Allow", "POST"); res.status(405).json({ error: "Method not allowed." }); return; }
    if (Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES) { res.status(413).json({ error: "Request is too large." }); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = text(body.action, 40);
    if (!ACTIONS.has(action)) {
      res.status(400).json({ error: "Unsupported debate work action." });
      return;
    }
    try {
      await rateLimit(req, action);
      let result;
      if (action === "authenticate") result = await authenticate(body);
      else if (action === "listStudentWorks") result = await listStudentWorks(body);
      else if (action === "getStudentWork") result = await getStudentWork(body);
      else if (action === "saveStudentWork") result = await saveStudentWork(body);
      else if (action === "submitStudentWork") result = await saveStudentWork(body, true);
      else if (action === "listCoachWorks") result = await listCoachWorks(req);
      else if (action === "getCoachWork") result = await getCoachWork(req, body);
      else if (action === "saveCoachFeedback") result = await saveCoachFeedback(req, body);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      const message = error && error.message ? error.message : "The debate workspace is temporarily unavailable.";
      console.error("debateWork request failed:", { action, message });
      const authFailure = [GENERIC_AUTH_ERROR, "Coach authentication is required.", "Coach authorization is required."].includes(message);
      res.status(authFailure ? 401 : 400).json({ error: message });
    }
  };
}

module.exports = {
  TOPIC_ID, STAGES, createDebateWorkHandler,
  signSession, verifySession, normalizeStages, identityKey,
  sanitizeHtml,
};