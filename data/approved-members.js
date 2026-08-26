// ============================================================
// Cooper Debate Team — Approved Members List
//
// Add or remove email addresses here to control who can
// access the Members Portal.
//
// HOW TO ADD A STUDENT:
//   "studentemail@fcpsschools.net",
//
// HOW TO REMOVE A STUDENT:
//   Delete their line.
//
// SECURITY: Also add or remove the same normalized email in the
// isApprovedMember() list in firestore.rules, then deploy the rules.
// The browser list controls the UI; Firestore rules enforce access.
// ============================================================

const APPROVED_MEMBERS = [

  // ── Coaches ─────────────────────────────────────────────
  "pgkonde@fcps.edu",
  "Hannahbshiv@gmail.com",
  "CooperDebateTeam@gmail.com",

  // ── Team Members ────────────────────────────────────────
  // Add student emails below, one per line:
  "1806950@fcpsschools.net",
  // "student1@fcpsschools.net",
  // "student2@fcpsschools.net",

];

// ── Display names for each member ────────────────────────────
// Add an entry here whenever you add a new member above.
const MEMBER_INITIALS = {
  "hannahbshiv@gmail.com":      "HS",
  "cooperdebateteam@gmail.com": "CD",
  // "student1@fcpsschools.net": "AB",
};

const MEMBER_NAMES = {
  "hannahbshiv@gmail.com":      "Hannah",
  "cooperdebateteam@gmail.com": "Cooper",
  // "student1@fcpsschools.net": "Alex",
};
