// ------------------------------------------------------------
// Cooper Debate Team — Approved Members List
//
// Legacy fallback list for accounts that have not yet been synchronized from
// the Members Directory. New access changes should be made in the Directory.
//
// HOW TO ADD A LOGIN:
//   Add the exact Google Workspace address, one per line. If one person
//   has both FCPS Workspace identities, add both addresses here.
//
// HOW TO REMOVE A LOGIN:
//   Delete their line.
//
// SECURITY: Directory-managed per-email portal_members records are
// authoritative once present, except protected legacy full-admin identities
// retain their configured role. Keep migration approvals synchronized with the
// legacy fallback lists in firestore.rules.
// ------------------------------------------------------------
const APPROVED_MEMBERS = [

  // ── Coaches ─────────────────────────────────────────────
  "pgkonde@fcps.edu",
  "pgkonde@fcpsschools.net",
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
  "pgkonde@fcps.edu":          "PK",
  "pgkonde@fcpsschools.net":   "PK",
  "hannahbshiv@gmail.com":      "HS",
  "cooperdebateteam@gmail.com": "CD",
  // "student1@fcpsschools.net": "AB",
};

const MEMBER_NAMES = {
  "pgkonde@fcps.edu":          "Coach Konde",
  "pgkonde@fcpsschools.net":   "Coach Konde",
  "hannahbshiv@gmail.com":      "Hannah",
  "cooperdebateteam@gmail.com": "Cooper",
  // "student1@fcpsschools.net": "Alex",
};

const APPROVED_FCPS_GOOGLE_DOMAINS = ["fcpsschools.net", "fcps.edu"];

async function getPortalMemberAccess(user, firestore) {
  const email = String(user && user.email || "").trim().toLowerCase();
  if (!email) return { approved: false, role: "member", displayName: "" };

  const tokenResult = await user.getIdTokenResult();
  if (tokenResult && tokenResult.signInProvider === "google.com") {
    const allowedDomain = APPROVED_FCPS_GOOGLE_DOMAINS.some(domain =>
      email.endsWith("@" + domain)
    );
    if (!allowedDomain) {
      return { approved: false, role: "member", displayName: "" };
    }
  }

  if (firestore) {
    const accessDoc = await firestore.collection("portal_members").doc(email).get();
    if (accessDoc.exists) {
      const data = accessDoc.data() || {};
      return {
        approved: data.active === true,
        role: typeof resolvePortalRole === "function"
          ? resolvePortalRole(data.role, email)
          : (["coach", "captain", "member", "website-admin"].includes(data.role) ? data.role : "member"),
        displayName: String(data.name || user.displayName || "").trim(),
      };
    }
  }

  return {
    approved: APPROVED_MEMBERS.some(member => member.toLowerCase() === email),
    role: typeof getAdminRole === "function" ? getAdminRole(email) : "member",
    displayName: MEMBER_NAMES[email] || String(user.displayName || "").trim(),
  };
}
