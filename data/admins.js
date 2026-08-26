// ============================================================
// Cooper Debate Team — Admin Roles
//
// Defines the legacy role fallback for the Members Portal.
// Current membership, active status, and roles are managed from the
// Members Directory and mirrored to Firestore portal_members records.
//
// ROLES:
//   "member"        — Standard member access
//   "captain"       — Can manage shared member content
//   "coach"         — Full website management access
//   "website-admin" — Same full access as coach
//
// HOW TO ADD:
//   { email: "email@example.com", loginEmails: ["other@example.com"], role: "captain" },
//
// HOW TO REMOVE:
//   Delete their line.
//
// SECURITY: This list only preserves access for legacy accounts that have
// not yet been synchronized from the Members Directory. Firestore rules
// remain the security boundary.
// ============================================================

const ADMIN_ROLES = [

  // ── Coach ────────────────────────────────────────────────
  { email: "pgkonde@fcps.edu",         loginEmails: ["pgkonde@fcpsschools.net"], role: "coach" }, // Coach Konde
  { email: "hannahbshiv@gmail.com",   role: "coach" },      // temp coach for testing

  // ── Captains ─────────────────────────────────────────────
  // { email: "hannahbshiv@gmail.com", role: "captain" },   // testing captain view
  // { email: "captain@fcps.edu",      role: "captain" },

];

function getAdminRole(email) {
  if (!email) return "member";
  const normalized = email.toLowerCase();
  const found = ADMIN_ROLES.find(r =>
    [r.email, ...(r.loginEmails || [])]
      .filter(Boolean)
      .some(loginEmail => loginEmail.toLowerCase() === normalized)
  );
  return found ? found.role : "member";
}

function normalizePortalRole(role) {
  return ["member", "captain", "coach", "website-admin"].includes(role)
    ? role
    : "member";
}

function isFullAdminRole(role) {
  return role === "coach" || role === "website-admin";
}

function canManageMemberContentRole(role) {
  return isFullAdminRole(role) || role === "captain";
}

function portalRoleLabel(role) {
  return {
    member: "Team Member",
    captain: "Captain",
    coach: "Coach",
    "website-admin": "Website Admin",
  }[normalizePortalRole(role)];
}

async function portalEmailHash(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalizedEmail);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function getLoginEligibility(firestoreDb, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const legacyApproved = normalizedEmail &&
    typeof APPROVED_MEMBERS !== "undefined" &&
    Array.isArray(APPROVED_MEMBERS) &&
    APPROVED_MEMBERS.some(member => member.toLowerCase() === normalizedEmail);
  const legacy = { approved: Boolean(legacyApproved), active: Boolean(legacyApproved), source: "legacy" };
  if (!normalizedEmail || !firestoreDb) return legacy;

  try {
    const hash = await portalEmailHash(normalizedEmail);
    const snapshot = await firestoreDb.collection("portal_login_status").doc(hash).get();
    if (!snapshot.exists) return legacy;
    const active = snapshot.data().active === true;
    return { approved: active, active, source: "directory" };
  } catch (error) {
    console.warn("[Member access] Could not load login eligibility:", error);
    return legacy;
  }
}

async function getMemberAccess(firestoreDb, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const legacyApproved = normalizedEmail &&
    typeof APPROVED_MEMBERS !== "undefined" &&
    Array.isArray(APPROVED_MEMBERS) &&
    APPROVED_MEMBERS.some(member => member.toLowerCase() === normalizedEmail);
  const legacy = {
    approved: Boolean(legacyApproved),
    active: Boolean(legacyApproved),
    email: normalizedEmail,
    role: normalizePortalRole(getAdminRole(normalizedEmail)),
    name: typeof MEMBER_NAMES !== "undefined"
      ? (MEMBER_NAMES[normalizedEmail] || "")
      : "",
    profileId: "",
    source: "legacy",
  };

  if (!normalizedEmail || !firestoreDb) return legacy;

  try {
    const snapshot = await firestoreDb.collection("portal_members").doc(normalizedEmail).get();
    if (!snapshot.exists) return legacy;
    const data = snapshot.data() || {};
    return {
      approved: data.active === true,
      active: data.active === true,
      email: normalizedEmail,
      role: normalizePortalRole(data.role),
      name: String(data.name || "").trim(),
      profileId: String(data.profileId || "").trim(),
      source: "directory",
    };
  } catch (error) {
    console.warn("[Member access] Could not load directory access record:", error);
    return legacy;
  }
}
