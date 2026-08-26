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