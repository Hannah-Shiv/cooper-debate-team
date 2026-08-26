import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

test("approved non-FCPS adults can request and complete an email-link sign-in", async () => {
  const [adminSource, source] = await Promise.all([
    readFile("data/admins.js", "utf8"),
    readFile("js/members-auth.js", "utf8"),
  ]);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: {},
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        focus() {},
      });
    }
    return elements.get(id);
  };

  ["login", "pending", "completing", "dashboard", "denied"].forEach(state => {
    element("state-" + state);
  });
  element("email-input").value = "ApprovedAdult@example.com";

  const stored = new Map();
  const calls = [];
  const auth = {
    setPersistence: async () => {},
    isSignInWithEmailLink: () => false,
    sendSignInLinkToEmail: async (email, settings) => {
      calls.push({ kind: "send", email, settings });
    },
    signInWithEmailLink: async (email, href) => {
      calls.push({ kind: "complete", email, href });
      return { user: { email } };
    },
    signOut: async () => {},
    onAuthStateChanged() {},
    getRedirectResult: async () => null,
  };
  const firestore = {
    collection(name) {
      assert.ok(["portal_login_status", "portal_members"].includes(name));
      return {
        doc() {
          return {
            async get() {
              return { exists: false };
            },
          };
        },
      };
    },
  };
  const authFactory = () => auth;
  authFactory.Auth = { Persistence: { LOCAL: "local" } };
  authFactory.GoogleAuthProvider = class {
    setCustomParameters() {}
  };

  const context = {
    console,
    Promise,
    crypto: webcrypto,
    TextEncoder,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: callback => callback(),
    firebase: {
      initializeApp() {},
      auth: authFactory,
      firestore: () => firestore,
    },
    window: {
      location: {
        origin: "https://example.test",
        href: "https://example.test/members-signon.html",
        pathname: "/members-signon.html",
      },
      history: { replaceState() {} },
      addEventListener() {},
      prompt() { return null; },
    },
    document: {
      title: "Members",
      getElementById: element,
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: key => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: key => stored.delete(key),
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    APPROVED_MEMBERS: ["approvedadult@example.com"],
    MEMBER_NAMES: { "approvedadult@example.com": "Approved Adult" },
    getAdminRole: () => "member",
  };
  vm.createContext(context);
  vm.runInContext(adminSource, context);
  vm.runInContext(source + "\nthis.sendLink = sendSignInLink; this.completeLink = completeMagicLinkSignIn;", context);

  await context.sendLink();
  assert.equal(calls[0].kind, "send");
  assert.equal(calls[0].email, "approvedadult@example.com");
  assert.equal(calls[0].settings.url, "https://example.test/members-signon.html");
  assert.equal(calls[0].settings.handleCodeInApp, true);
  assert.equal(stored.get("cooper_signin_email"), "approvedadult@example.com");
  assert.equal(element("state-pending").style.display, "");

  await context.completeLink();
  assert.equal(calls[1].kind, "complete");
  assert.equal(calls[1].email, "approvedadult@example.com");
  assert.equal(context.window.location.href, "members-resources.html");
});

test("legacy admin fallback provides website-admin access and readable names", async () => {
  const adminSource = await readFile("data/admins.js", "utf8");
  const context = { console, TextEncoder };
  vm.createContext(context);
  vm.runInContext(
    adminSource + `
      this.fallbackRole = getAdminRole("1806950@fcpsschools.net");
      this.directoryOverrideRole = resolvePortalRole("member", "1806950@fcpsschools.net");
      this.namedWelcome = portalWelcomeLabel("Alex Rivera", "1806950@fcpsschools.net");
      this.numericWelcome = portalWelcomeLabel("", "1806950@fcpsschools.net");
    `,
    context
  );

  assert.equal(context.fallbackRole, "website-admin");
  assert.equal(context.directoryOverrideRole, "website-admin");
  assert.equal(context.namedWelcome, "Alex Rivera");
  assert.equal(context.numericWelcome, "Member");
});

test("a stale member directory role cannot downgrade the protected website admin", async () => {
  const [approvedSource, adminSource] = await Promise.all([
    readFile("data/approved-members.js", "utf8"),
    readFile("data/admins.js", "utf8"),
  ]);
  const context = {
    console,
    TextEncoder,
    APPROVED_MEMBERS: ["1806950@fcpsschools.net"],
    MEMBER_NAMES: {},
  };
  vm.createContext(context);
  vm.runInContext(
    approvedSource + "\n" + adminSource + "\nthis.getAccess = getPortalMemberAccess;",
    context
  );

  const access = await context.getAccess({
    email: "1806950@fcpsschools.net",
    displayName: "Hannah Shiv",
    getIdTokenResult: async () => ({ signInProvider: "google.com" }),
  }, {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({ active: true, role: "member", name: "" }),
        }),
      }),
    }),
  });

  assert.equal(access.approved, true);
  assert.equal(access.role, "website-admin");
  assert.equal(access.displayName, "Hannah Shiv");
});

test("normal member-page startup skips the unused redirect-result handshake", async () => {
  const source = await readFile("js/members-auth.js", "utf8");
  const startup = source.slice(
    source.indexOf('window.addEventListener("DOMContentLoaded"'),
    source.indexOf("function watchForExistingSession")
  );

  assert.match(startup, /if \(completingGoogleRedirect\)[\s\S]*?auth\.getRedirectResult\(\)/);
  assert.match(startup, /persistenceReady\.then\(\(\) => watchForExistingSession\(false\)\)/);
});

test("resources header maps every portal role to its matching artwork", async () => {
  const [source, resourcesPage] = await Promise.all([
    readFile("js/members-auth.js", "utf8"),
    readFile("members-resources.html", "utf8"),
  ]);
  const presentationStart = source.indexOf("const PORTAL_ROLE_PRESENTATION");
  const presentationEnd = source.indexOf("// ── Initialise Firebase", presentationStart);
  const context = {};

  vm.createContext(context);
  vm.runInContext(
    source.slice(presentationStart, presentationEnd) +
      "\nthis.rolePresentation = JSON.stringify(PORTAL_ROLE_PRESENTATION);",
    context
  );
  const roles = JSON.parse(context.rolePresentation);

  assert.equal(roles.member.icon, "images/role-icons/member.png");
  assert.equal(roles.captain.icon, "images/role-icons/captain.png");
  assert.equal(roles.coach.icon, "images/role-icons/coach.png");
  assert.equal(roles["website-admin"].icon, "images/role-icons/website-admin.png");
  assert.match(resourcesPage, /class="mub-badge mub-role-badge"/);
  assert.match(resourcesPage, /class="mub-role-icon"/);
  assert.match(resourcesPage, /class="mub-role-label"/);
});

test("specified member pages share the role artwork header", async () => {
  const pageSpecs = [
    ["members-calendar.html", "cal-role-icon", "cal-role-badge", "cal-user-email"],
    ["members-directory.html", "member-role-icon", "member-role-badge", "member-email"],
    ["members-stats.html", "member-role-icon", "member-role-badge", "member-email"],
    ["members-blog.html", "mp-role-icon", "mp-role-badge", "mp-user-email"],
    ["members-volunteers.html", "member-role-icon", "member-role-badge", "member-email"],
  ];
  const pages = await Promise.all(pageSpecs.map(([file]) => readFile(file, "utf8")));

  pages.forEach((page, index) => {
    const [file, iconId, badgeId, emailId] = pageSpecs[index];
    assert.match(page, /class="member-userbar role-artwork-userbar"/, `${file} should use the shared artwork header`);
    assert.match(page, new RegExp(`id="${iconId}"`), `${file} should include the standalone role icon`);
    assert.match(page, new RegExp(`id="${badgeId}"`), `${file} should include the role badge`);
    assert.match(page, /class="mub-role-label"/, `${file} should include a role label`);
    assert.doesNotMatch(page, new RegExp(`id="${emailId}"`), `${file} should not show an email field`);
  });
});

test("stats recovers a restored Firebase user before redirecting to sign-in", async () => {
  const source = await readFile("members-stats.html", "utf8");
  const overrideStart = source.indexOf("(function () {", source.indexOf("showState override"));
  const overrideEnd = source.indexOf("})();", overrideStart) + 5;
  const user = { email: "member@fcpsschools.net" };
  let scheduled = null;
  let recoveredUser = null;

  const context = {
    auth: { currentUser: user },
    document: {
      getElementById: () => ({ style: {} }),
    },
    handleExistingAuthenticatedUser(restoredUser) {
      recoveredUser = restoredUser;
    },
    initStats() {},
    window: {
      location: { href: "members-stats.html" },
      showState() {},
      setTimeout(callback, delay) {
        scheduled = { callback, delay };
        return 1;
      },
      clearTimeout() {
        scheduled = null;
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(source.slice(overrideStart, overrideEnd), context);
  context.window.showState("login");

  assert.equal(context.window.location.href, "members-stats.html");
  assert.equal(scheduled.delay, 1200);
  scheduled.callback();
  assert.equal(recoveredUser, user);
  assert.equal(context.window.location.href, "members-stats.html");
});