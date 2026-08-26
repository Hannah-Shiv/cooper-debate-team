// ============================================================
// Cooper Debate Team — Approved Members List
//
// Legacy fallback list for accounts that have not yet been synchronized from
// the Members Directory. New access changes should be made in the Directory.
//
// SECURITY: Directory-managed portal_members records are authoritative once
// present. Firestore rules enforce active status and role permissions.
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
