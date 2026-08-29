import { expect, test } from "@playwright/test";

const route = "/tournaments.html?tab=tryout-signup";
const endpoint = "**/tryoutBoard";

function publicStudent(id, displayName, partnerId = null, session = "sep22") {
  return {
    id,
    displayName,
    grade: "8",
    session,
    available: !partnerId,
    status: partnerId ? "paired" : "open",
    partnerId,
    revision: 1,
  };
}

async function installSharedBoard(page, records, onRequest = () => {}, savedPartnerIds = [], incomingRequests = [], pairOnRequestId = null) {
  let serverSession = "sep22";
  let serverPartnerIds = savedPartnerIds.slice();
  let serverPairedWith = null;
  await page.route("https://www.gstatic.com/firebasejs/**", requestRoute => requestRoute.abort());
  await page.addInitScript(publicRecords => {
    const snapshot = {
      docs: publicRecords.map(record => ({
        id: record.id,
        data: () => ({ ...record }),
      })),
    };
    const app = {
      firestore() {
        return {
          collection() {
            return {
              where() {
                return {
                  onSnapshot(success) {
                    setTimeout(() => success(snapshot), 0);
                    return () => {};
                  },
                };
              },
            };
          },
        };
      },
    };
    window.firebase = {
      apps: [app],
      firestore: true,
      initializeApp: () => app,
    };
  }, records);

  await page.route(endpoint, async requestRoute => {
    const body = requestRoute.request().postDataJSON();
    onRequest(body);
    if (body.action === "open" && body.session) serverSession = body.session;
    if (body.action === "request") {
      serverSession = body.session || serverSession;
      serverPartnerIds = Array.isArray(body.partnerIds) ? body.partnerIds.slice() : [];
      if (pairOnRequestId && serverPartnerIds.includes(pairOnRequestId)) serverPairedWith = pairOnRequestId;
    } else if (body.action === "release" || body.action === "withdraw") {
      serverPartnerIds = [];
      serverPairedWith = null;
    }
    const partnerIds = serverPartnerIds.slice();
    const self = {
      id: "self",
      name: "Jordan Student",
      displayName: "Jordan S.",
      grade: "8",
      session: serverSession,
      partnerId: serverPairedWith || partnerIds[0] || null,
      partnerIds,
      partnerNames: partnerIds,
      incomingRequests,
      status: serverPairedWith ? "mutual" : partnerIds.length ? "pending" : "open",
      releasedReason: "",
      revision: 2,
    };
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, self }),
    });
  });
}

async function openBoard(page) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#tourney-tryout-fcps-id").fill("1234567");
  await page.locator("#tourney-tryout-name").fill("Jordan Student");
  await page.locator("#tourney-tryout-grade").selectOption("8");
  await page.locator("#tourney-tryout-show-board").click();
  await expect(page.locator("#tourney-tryout-workspace")).toBeVisible();
}

test("submits four choices in the visible preference order", async ({ page }) => {
  const requests = [];
  await installSharedBoard(page, [
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
    publicStudent("casey", "Casey C."),
    publicStudent("devon", "Devon D."),
  ], body => requests.push(body));
  await openBoard(page);

  for (const id of ["avery", "blake", "casey", "devon"]) {
    await page.locator(`[data-partner="${id}"]`).click();
  }
  await expect(page.locator(".tourney-tryout-preference-list li")).toHaveCount(4);
  await expect(page.locator('[data-partner="casey"] .tourney-tryout-roster-check')).toHaveText("#3");

  await page.getByRole("button", { name: "Move Casey C. up" }).click();
  await expect(page.locator(".tourney-tryout-preference-list li").nth(1)).toContainText("Casey C.");
  await page.locator("#tourney-tryout-submit").click();

  const submitted = requests.find(request => request.action === "request");
  expect(submitted.partnerIds).toEqual(["avery", "casey", "blake", "devon"]);
  await expect(page.locator("#tourney-tryout-student-status")).toContainText("Partner choices saved");
});

test("shows large primary board actions", async ({ page }) => {
  await installSharedBoard(page, [publicStudent("avery", "Alexandria-Marguerite W.")]);
  await page.goto(route, { waitUntil: "domcontentloaded" });

  await expect(page.locator(".tourney-tryout-heading .section-sub")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".tourney-tryout-heading .section-label")).toHaveCSS("color", "rgb(201, 157, 50)");
  await expect(page.locator("#tourney-tryout-show-board")).toHaveCSS("min-height", "56px");
  await openBoard(page);
  await expect(page.locator("#tourney-tryout-submit")).toHaveCSS("min-height", "56px");
  await expect(page.locator(".tourney-tryout-identity-actions .tourney-tryout-action-info")).toHaveCount(3);
  await expect(page.locator("[data-tryout-edit]")).toHaveAttribute("data-tooltip", /release any current request or confirmed pairing/i);
  const layoutMetrics = await page.locator(".tourney-tryout-shell").evaluate(shell => {
    const shellBox = shell.getBoundingClientRect();
    const rosterBox = shell.querySelector(".tourney-tryout-roster").getBoundingClientRect();
    const rosterNameElement = shell.querySelector(".tourney-tryout-roster-name strong");
    const rosterName = getComputedStyle(rosterNameElement).fontSize;
    const preferenceName = getComputedStyle(shell.querySelector(".tourney-tryout-preference-empty")).fontSize;
    return {
      shellWidth: shellBox.width,
      rosterWidth: rosterBox.width,
      rosterName,
      preferenceName,
      longNameFits: rosterNameElement.scrollWidth <= rosterNameElement.clientWidth,
    };
  });
  expect(layoutMetrics.shellWidth).toBeGreaterThan(1100);
  expect(layoutMetrics.rosterWidth).toBeGreaterThan(540);
  expect(parseFloat(layoutMetrics.rosterName)).toBeGreaterThanOrEqual(12);
  expect(parseFloat(layoutMetrics.preferenceName)).toBeGreaterThanOrEqual(9);
  expect(layoutMetrics.longNameFits).toBe(true);
});

test("explains and confirms identity actions before changing a paired signup", async ({ page }) => {
  const requests = [];
  await installSharedBoard(page, [
    publicStudent("hannah", "Hannah Shiv"),
  ], body => requests.push(body), [], [], "hannah");
  await openBoard(page);
  await page.locator('[data-partner="hannah"]').click();
  await page.locator("#tourney-tryout-submit").click();
  await expect(page.locator("#tourney-tryout-student-status")).toContainText("You are paired");

  await page.locator("[data-tryout-edit]").click();
  await expect(page.locator("#tourney-tryout-confirm")).toBeVisible();
  await expect(page.locator("#tourney-tryout-confirm-title")).toContainText("release this pairing");
  await expect(page.locator("#tourney-tryout-confirm-note")).toContainText("Both students will become available");
  expect(requests.some(request => request.action === "release")).toBe(false);
  await page.locator("[data-tryout-confirm-cancel]").click();

  await page.locator("[data-tryout-new]").click();
  await expect(page.locator("#tourney-tryout-confirm-title")).toContainText("another student");
  await expect(page.locator("#tourney-tryout-confirm-note")).toContainText("confirmed pairing stay safely saved");
  await page.locator("[data-tryout-confirm-cancel]").click();

  await page.locator("[data-tryout-withdraw]").click();
  await expect(page.locator("#tourney-tryout-confirm-title")).toHaveText("Are you sure you want to withdraw?");
  await expect(page.locator("#tourney-tryout-confirm-note")).toContainText("confirmed pair will be ended");
  expect(requests.some(request => request.action === "withdraw")).toBe(false);
  await page.locator("[data-tryout-confirm-accept]").click();
  await expect.poll(() => requests.some(request => request.action === "withdraw")).toBe(true);
  await expect(page.locator("#tourney-tryout-gate")).toBeVisible();
});

test("keeps duplicate names as distinct choices and enforces the four-choice limit", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("sam-one", "Sam K."),
    publicStudent("sam-two", "Sam K."),
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
    publicStudent("casey", "Casey C."),
  ]);
  await openBoard(page);

  await expect(page.getByRole("button", { name: /Sam K\./ })).toHaveCount(2);
  await expect(page.locator(".tourney-tryout-roster-piece svg")).toHaveCount(0);
  await expect(page.locator('[data-partner="sam-one"] .tourney-tryout-roster-grade')).toHaveText("8th grade");
  await expect(page.locator('[data-partner="sam-one"] .tourney-tryout-roster-availability')).toHaveText("Sept 22");
  for (const id of ["sam-one", "sam-two", "avery", "blake"]) {
    await page.locator(`[data-partner="${id}"]`).click();
  }
  await page.locator('[data-partner="casey"]').click();

  await expect(page.locator(".tourney-tryout-preference-list li")).toHaveCount(4);
  await expect(page.locator("#tourney-tryout-error")).toContainText("up to four students");
});

test("keeps an unsaved ranked draft through background status polling", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
    publicStudent("casey", "Casey C."),
  ]);
  await openBoard(page);

  for (const id of ["avery", "blake", "casey"]) {
    await page.locator(`[data-partner="${id}"]`).click();
  }
  await expect(page.locator(".tourney-tryout-preference-list li")).toHaveCount(3);
  await page.waitForTimeout(10500);

  await expect(page.locator(".tourney-tryout-preference-list li")).toHaveCount(3);
  await expect(page.locator('[data-partner="blake"] .tourney-tryout-roster-check')).toHaveText("#2");
});

test("restores the signup details and board after a page refresh", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
  ]);
  await openBoard(page);
  await page.locator('[data-partner="avery"]').click();
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("#tourney-tryout-workspace")).toBeVisible();
  await expect(page.locator("#tourney-tryout-identity-name")).toHaveText("Jordan Student");
  await expect(page.locator(".tourney-tryout-preference-list li")).toHaveCount(1);
  await expect(page.locator('[data-partner="avery"] .tourney-tryout-roster-check')).toHaveText("#1");
});

test("shows the current unsaved first choice on the board preview", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("m", "Test M."),
    publicStudent("j", "Test J."),
  ], () => {}, ["m"]);
  await openBoard(page);

  await page.locator('[data-partner="m"]').click();
  await page.locator('[data-partner="j"]').click();

  await expect(page.locator(".tourney-tryout-board-row.is-your-request")).toContainText("Test J.");
  await expect(page.locator(".tourney-tryout-board-row.is-your-request .tourney-tryout-row-state")).toHaveAttribute("title", "Pending");
  await expect(page.locator(".tourney-tryout-board-row.is-your-request")).not.toContainText("Test M.");
  await expect(page.locator("#tourney-tryout-student-status")).toContainText("Test J.");
  await expect(page.locator("#tourney-tryout-student-status")).not.toContainText("Test M.");
});

test("keeps a selected September 23 session and shows its candidates", async ({ page }) => {
  const requests = [];
  await installSharedBoard(page, [
    publicStudent("hannah", "Hannah Shiv", null, "sep23"),
  ], body => requests.push(body));
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#tourney-tryout-fcps-id").fill("7000001");
  await page.locator("#tourney-tryout-name").fill("Test M");
  await page.locator("#tourney-tryout-grade").selectOption("7");
  await page.locator('[data-date="sep23"]').click();
  await page.locator("#tourney-tryout-show-board").click();

  await expect(page.locator("#tourney-tryout-identity-meta")).toContainText("September 23");
  await expect(page.locator('[data-partner="hannah"]')).toBeVisible();
  await page.locator('[data-partner="hannah"]').click();
  await page.locator("#tourney-tryout-submit").click();

  expect(requests.find(request => request.action === "request")?.session).toBe("sep23");
  await page.waitForTimeout(10500);
  await expect(page.locator("#tourney-tryout-identity-meta")).toContainText("September 23");
});

test("shows confirmed reciprocal pairs but not private pending relationships", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("avery", "Avery A.", "blake"),
    publicStudent("blake", "Blake B.", "avery"),
    publicStudent("casey", "Casey C."),
  ]);
  await openBoard(page);

  await expect(page.locator(".tourney-tryout-board-row.is-locked")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-board-row.is-locked")).toContainText("Avery A.");
  await expect(page.locator(".tourney-tryout-board-row.is-locked")).toContainText("Blake B.");
  await expect(page.locator(".tourney-tryout-board-row.is-locked .tourney-tryout-row-state")).toHaveAttribute("title", "Paired");
  await expect(page.locator(".tourney-tryout-legend i.locked svg")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-legend i.pending svg")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-legend i.incoming svg")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-legend i.open svg")).toHaveCount(1);
  await expect(page.locator('[data-partner="casey"]')).toBeVisible();
});

test("moves incoming requests onto the board and lets the student accept one", async ({ page }) => {
  const requests = [];
  await installSharedBoard(page, [
    publicStudent("hannah", "Hannah Shiv", null, "sep22"),
    publicStudent("avery", "Avery A.", null, "sep22"),
  ], body => requests.push(body), [], [{
    id: "hannah",
    displayName: "Hannah S.",
    grade: "8",
    session: "sep22",
  }]);
  await openBoard(page);

  await expect(page.locator('[data-partner="hannah"]')).toHaveCount(0);
  await expect(page.locator(".tourney-tryout-board-row.is-incoming")).toContainText("Hannah S.");
  await expect(page.locator(".tourney-tryout-board-row.is-incoming")).toContainText("Waiting for acceptance");
  await expect(page.locator(".tourney-tryout-board-row.is-incoming .tourney-tryout-row-state")).toHaveAttribute("title", "Waiting for acceptance");
  await page.locator('[data-accept-partner="hannah"]').click();
  await expect(page.locator(".tourney-tryout-preference-list")).toContainText("Hannah S.");
  await page.locator("#tourney-tryout-submit").click();
  expect(requests.find(request => request.action === "request")?.partnerIds).toEqual(["hannah"]);
});

test("shows every incoming request even when more than eight students are waiting", async ({ page }) => {
  const incoming = Array.from({ length: 9 }, (_, index) => ({
    id: `waiting-${index}`,
    displayName: `Waiting ${index}.`,
    grade: "8",
    session: "sep22",
  }));
  await installSharedBoard(page, incoming.map(record => publicStudent(record.id, record.displayName)), () => {}, [], incoming);
  await openBoard(page);

  await expect(page.locator(".tourney-tryout-board-row.is-incoming")).toHaveCount(9);
  await expect(page.locator('[data-partner^="waiting-"]')).toHaveCount(0);
});

test("does not duplicate a row after an incoming request becomes a confirmed pair", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("test-h", "Test H.", "self"),
  ], () => {}, [], [], "test-h");
  await openBoard(page);

  await page.locator('[data-partner="test-h"]').click();
  await page.locator("#tourney-tryout-submit").click();

  await expect(page.locator(".tourney-tryout-board-row.is-locked")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-board-row.is-your-request")).toHaveCount(0);
  await expect(page.locator(".tourney-tryout-board-row")).toHaveCount(8);
});