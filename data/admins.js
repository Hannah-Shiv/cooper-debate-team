// ============================================================
// Cooper Debate Team — Admin Roles
//
// Defines who has admin access in the Members Portal.
//
// ROLES:
//   "coach"   — Full control: post + delete any announcement
//   "captain" — Can post announcements + delete their own.
//               Use for trusted high school mentors and key
//               middle school students Coach Konde approves.
//
// HOW TO ADD:
//   { email: "email@example.com", role: "captain" },
//
// HOW TO REMOVE:
//   Delete their line.
//
// SECURITY: Also add or remove the same role in firestore.rules,
// then deploy the rules. The browser list controls the UI;
// Firestore rules enforce write permissions.
// ============================================================

const ADMIN_ROLES = [

  // ── Coach ────────────────────────────────────────────────
  { email: "pgkonde@fcps.edu",         role: "coach" },      // Coach Konde
  { email: "hannahbshiv@gmail.com",   role: "coach" },      // temp coach for testing

  // ── Captains ─────────────────────────────────────────────
  // { email: "hannahbshiv@gmail.com", role: "captain" },   // testing captain view
  // { email: "captain@fcps.edu",      role: "captain" },

];

function getAdminRole(email) {
  if (!email) return "member";
  const normalized = email.toLowerCase();
  const found = ADMIN_ROLES.find(r => r.email.toLowerCase() === normalized);
  return found ? found.role : "member";
}
