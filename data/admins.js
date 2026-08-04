// ============================================================
// Cooper Debate Team — Admin Roles
//
// Defines who has admin access in the Members Portal.
//
// ROLES:
//   "coach"  — Can post announcements + delete any announcement
//   "mentor" — Can post announcements + delete their own
//
// HOW TO ADD AN ADMIN:
//   { email: "email@example.com", role: "coach" },
//
// HOW TO REMOVE AN ADMIN:
//   Delete their line.
//
// Save and push to GitHub — changes are live instantly.
// ============================================================

const ADMIN_ROLES = [

  // ── Coach ────────────────────────────────────────────────
  { email: "hannahbshiv@gmail.com", role: "coach" },   // testing — swap for pgkonde@fcps.edu when ready
  // { email: "pgkonde@fcps.edu",   role: "coach" },   // Coach Konde (uncomment when ready)

  // ── Mentors ──────────────────────────────────────────────
  // { email: "mentor1@gmail.com", role: "mentor" },
  // { email: "mentor2@gmail.com", role: "mentor" },

];

function getAdminRole(email) {
  if (!email) return "member";
  const normalized = email.toLowerCase();
  const found = ADMIN_ROLES.find(r => r.email.toLowerCase() === normalized);
  return found ? found.role : "member";
}
