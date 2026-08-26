import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "cooper-debate-team";
const COACH_EMAIL = "pgkonde@fcps.edu";
const MEMBER_EMAIL = "cooperdebateteam@gmail.com";

let testEnv;

function authContext(email, provider) {
  return testEnv.authenticatedContext(email, {
    email,
    email_verified: true,
    firebase: { sign_in_provider: provider },
  });
}

function dbFor(email, provider = "password") {
  return authContext(email, provider).firestore();
}

before(async () => {
  const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(portText),
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "announcements", "existing"), {
        title: "Existing announcement",
        postedBy: COACH_EMAIL,
        postedByRole: "coach",
      }),
      setDoc(doc(db, "resource-pins", "existing"), { pinned: true }),
      setDoc(doc(db, "tournaments", "private"), { isPublic: false }),
      setDoc(doc(db, "tournaments", "public"), { isPublic: true }),
    ]);
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test("approved email-link members can read protected member content", async () => {
  const db = dbFor(MEMBER_EMAIL);
  await assertSucceeds(getDoc(doc(db, "announcements", "existing")));
  await assertSucceeds(getDoc(doc(db, "resource-pins", "existing")));
  await assertSucceeds(getDoc(doc(db, "tournaments", "private")));
});

test("unapproved FCPS Google users cannot read protected member content", async () => {
  const db = dbFor("unapproved-student@fcpsschools.net", "google.com");
  await assertFails(getDoc(doc(db, "announcements", "existing")));
  await assertFails(getDoc(doc(db, "resource-pins", "existing")));
  await assertFails(getDoc(doc(db, "tournaments", "private")));
});

test("non-FCPS Google users are denied even when their email is approved", async () => {
  const db = dbFor(MEMBER_EMAIL, "google.com");
  await assertFails(getDoc(doc(db, "announcements", "existing")));
  await assertFails(getDoc(doc(db, "resource-pins", "existing")));
  await assertFails(getDoc(doc(db, "tournaments", "private")));
});

test("unauthenticated users cannot read protected member content", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "announcements", "existing")));
  await assertFails(getDoc(doc(db, "resource-pins", "existing")));
  await assertFails(getDoc(doc(db, "tournaments", "private")));
});

test("coaches can manage privileged member content", async () => {
  const db = dbFor(COACH_EMAIL);
  await assertSucceeds(setDoc(doc(db, "announcements", "coach-post"), {
    title: "Coach post",
    postedBy: COACH_EMAIL,
    postedByRole: "coach",
  }));
  await assertSucceeds(setDoc(doc(db, "resource-pins", "coach-pin"), {
    pinned: true,
  }));
  await assertSucceeds(setDoc(doc(db, "tournaments", "coach-public"), {
    isPublic: true,
  }));
  await assertSucceeds(deleteDoc(doc(db, "announcements", "existing")));
});

test("ordinary approved members cannot perform coach or captain writes", async () => {
  const db = dbFor(MEMBER_EMAIL);
  await assertFails(setDoc(doc(db, "announcements", "member-post"), {
    title: "Unauthorized post",
    postedBy: MEMBER_EMAIL,
    postedByRole: "member",
  }));
  await assertFails(setDoc(doc(db, "resource-pins", "member-pin"), {
    pinned: true,
  }));
  await assertFails(deleteDoc(doc(db, "announcements", "existing")));
});

test("approved members retain private tournament editing but not public control", async () => {
  const db = dbFor(MEMBER_EMAIL);
  await assertSucceeds(setDoc(doc(db, "tournaments", "member-private"), {
    isPublic: false,
  }));
  await assertFails(setDoc(doc(db, "tournaments", "member-public"), {
    isPublic: true,
  }));
  await assertFails(setDoc(doc(db, "tournaments", "public"), {
    isPublic: false,
  }));
});

test("approved members can manage only their own notification-token record", async () => {
  const db = dbFor(MEMBER_EMAIL);
  await assertSucceeds(setDoc(doc(db, "fcm-tokens", MEMBER_EMAIL), {
    token: "own-token",
  }));
  await assertFails(setDoc(doc(db, "fcm-tokens", COACH_EMAIL), {
    token: "other-token",
  }));
});