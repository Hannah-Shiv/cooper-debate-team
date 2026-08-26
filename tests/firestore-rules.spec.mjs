import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "cooper-debate-team";
const COACH_EMAIL = "pgkonde@fcps.edu";
const COACH_ALTERNATE_EMAIL = "pgkonde@fcpsschools.net";
const MEMBER_EMAIL = "cooperdebateteam@gmail.com";
const STUDENT_EMAIL = "1806950@fcpsschools.net";
const WEBSITE_ADMIN_FCPS_EMAIL = "site-admin@fcps.edu";
const WEBSITE_ADMIN_STUDENT_EMAIL = "site-admin@fcpsschools.net";
const INACTIVE_EMAIL = "inactive@fcpsschools.net";

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
      setDoc(doc(db, "portal_members", COACH_EMAIL), {
        active: true, role: "coach", profileId: "coach-profile", name: "Coach Konde",
      }),
      setDoc(doc(db, "portal_members", MEMBER_EMAIL), {
        active: true, role: "member", profileId: "member-profile", name: "Cooper",
      }),
      setDoc(doc(db, "portal_members", STUDENT_EMAIL), {
        active: true, role: "member", profileId: "student-profile", name: "Student",
      }),
      setDoc(doc(db, "portal_members", WEBSITE_ADMIN_FCPS_EMAIL), {
        active: true, role: "website-admin", profileId: "shared-admin-profile", name: "Site Admin",
      }),
      setDoc(doc(db, "portal_members", WEBSITE_ADMIN_STUDENT_EMAIL), {
        active: true, role: "website-admin", profileId: "shared-admin-profile", name: "Site Admin",
      }),
      setDoc(doc(db, "portal_members", INACTIVE_EMAIL), {
        active: false, role: "member", profileId: "inactive-profile", name: "Inactive Member",
      }),
      setDoc(doc(db, "portal_login_status", "known-email-hash"), {
        active: true,
      }),
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

test("unapproved identities from either FCPS Google domain cannot read protected member content", async () => {
  for (const email of [
    "unapproved-student@fcpsschools.net",
    "unapproved-coach@fcps.edu",
  ]) {
    const db = dbFor(email, "google.com");
    await assertFails(getDoc(doc(db, "announcements", "existing")));
    await assertFails(getDoc(doc(db, "resource-pins", "existing")));
    await assertFails(getDoc(doc(db, "tournaments", "private")));
  }
});

test("approved FCPS coach Google identities share coach permissions", async () => {
  for (const [email, suffix] of [
    [COACH_EMAIL, "edu"],
    [COACH_ALTERNATE_EMAIL, "schools"],
  ]) {
    const db = dbFor(email, "google.com");
    await assertSucceeds(getDoc(doc(db, "announcements", "existing")));
    await assertSucceeds(setDoc(doc(db, "announcements", `google-coach-${suffix}`), {
      title: "Google coach post",
      postedBy: email,
      postedByRole: "coach",
    }));
    await assertSucceeds(setDoc(doc(db, "resource-pins", `google-coach-${suffix}`), {
      pinned: true,
    }));
  }
});

test("directory access records can approve one new FCPS identity", async () => {
  const newEmail = "approved-later@fcps.edu";
  const coachDb = dbFor(COACH_EMAIL, "google.com");
  await assertSucceeds(setDoc(doc(coachDb, "portal_members", newEmail), {
    active: true,
    role: "member",
    profileId: "approved-later-profile",
    name: "Approved Later",
  }));

  const newMemberDb = dbFor(newEmail, "google.com");
  await assertSucceeds(getDoc(doc(newMemberDb, "announcements", "existing")));
});

test("revoking one coach login blocks only that identity", async () => {
  const coachDb = dbFor(COACH_EMAIL, "google.com");
  await assertSucceeds(setDoc(doc(coachDb, "portal_members", COACH_ALTERNATE_EMAIL), {
    active: false,
    role: "coach",
    profileId: "coach-profile",
    name: "Coach Konde",
  }));

  const revokedDb = dbFor(COACH_ALTERNATE_EMAIL, "google.com");
  await assertFails(getDoc(doc(revokedDb, "announcements", "existing")));

  const remainingDb = dbFor(COACH_EMAIL, "google.com");
  await assertSucceeds(getDoc(doc(remainingDb, "announcements", "existing")));
  await assertSucceeds(setDoc(doc(remainingDb, "resource-pins", "remaining-coach"), {
    pinned: true,
  }));
});

test("the approved FCPS student Google identity can read protected member content", async () => {
  const db = dbFor(STUDENT_EMAIL, "google.com");
  await assertSucceeds(getDoc(doc(db, "announcements", "existing")));
  await assertSucceeds(getDoc(doc(db, "resource-pins", "existing")));
  await assertSucceeds(getDoc(doc(db, "tournaments", "private")));
});

test("the legacy FCPS student fallback has website-admin permissions", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), "portal_members", STUDENT_EMAIL));
  });

  const db = dbFor(STUDENT_EMAIL, "google.com");
  await assertSucceeds(setDoc(doc(db, "announcements", "legacy-website-admin-post"), {
    title: "Legacy Website Admin post",
    postedBy: STUDENT_EMAIL,
    postedByRole: "website-admin",
  }));
  await assertSucceeds(setDoc(doc(db, "members", "legacy-managed-member"), {
    firstName: "Legacy",
    lastName: "Managed",
  }));
  await assertSucceeds(setDoc(doc(db, "portal_login_status", "legacy-admin-email-hash"), {
    active: true,
  }));
});

test("an approved fcps.edu Google identity can read protected member content", async () => {
  const db = dbFor(COACH_EMAIL, "google.com");
  await assertSucceeds(getDoc(doc(db, "announcements", "existing")));
  await assertSucceeds(getDoc(doc(db, "resource-pins", "existing")));
  await assertSucceeds(getDoc(doc(db, "tournaments", "private")));
});

test("unapproved users from either FCPS Google domain are denied", async () => {
  for (const email of ["unknown@fcps.edu", "unknown@fcpsschools.net"]) {
    const db = dbFor(email, "google.com");
    await assertFails(getDoc(doc(db, "announcements", "existing")));
  }
});

test("inactive directory members can read their status but not portal content", async () => {
  const db = dbFor(INACTIVE_EMAIL, "google.com");
  const access = await assertSucceeds(getDoc(doc(db, "portal_members", INACTIVE_EMAIL)));
  assert.equal(access.data().active, false);
  await assertFails(getDoc(doc(db, "announcements", "existing")));
  await assertFails(getDoc(doc(db, "tournaments", "private")));
});

test("both FCPS identities linked to one profile receive the same website-admin role", async () => {
  for (const email of [WEBSITE_ADMIN_FCPS_EMAIL, WEBSITE_ADMIN_STUDENT_EMAIL]) {
    const db = dbFor(email, "google.com");
    const access = await assertSucceeds(getDoc(doc(db, "portal_members", email)));
    assert.equal(access.data().profileId, "shared-admin-profile");
    assert.equal(access.data().role, "website-admin");
    await assertSucceeds(getDoc(doc(db, "announcements", "existing")));
  }
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

test("pre-auth login status allows exact reads but not collection enumeration", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const status = await assertSucceeds(getDoc(doc(db, "portal_login_status", "known-email-hash")));
  assert.equal(status.data().active, true);
  await assertFails(getDocs(collection(db, "portal_login_status")));
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

test("website admins have the same full permissions as coaches", async () => {
  const db = dbFor(WEBSITE_ADMIN_FCPS_EMAIL, "google.com");
  await assertSucceeds(setDoc(doc(db, "announcements", "website-admin-post"), {
    title: "Website admin post",
    postedBy: WEBSITE_ADMIN_FCPS_EMAIL,
    postedByRole: "website-admin",
  }));
  await assertSucceeds(setDoc(doc(db, "resource-pins", "website-admin-pin"), {
    pinned: true,
  }));
  await assertSucceeds(setDoc(doc(db, "tournaments", "website-admin-public"), {
    isPublic: true,
  }));
  await assertSucceeds(setDoc(doc(db, "members", "managed-member"), {
    firstName: "Managed",
    lastName: "Member",
  }));
  await assertSucceeds(setDoc(doc(db, "portal_login_status", "new-email-hash"), {
    active: true,
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
  await assertFails(setDoc(doc(db, "portal_login_status", "forbidden-email-hash"), {
    active: true,
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