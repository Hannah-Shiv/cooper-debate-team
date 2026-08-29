import { expect, test } from "@playwright/test";

const route = "/tournaments.html?tab=tryout-signup";
const endpoint = "**/tryoutBoard";

function publicStudent(id, displayName, partnerId = null) {
  return {
    id,
    displayName,
    grade: "8",
    session: "sep22",
    available: !partnerId,
    status: partnerId ? "paired" : "open",
    partnerId,
    revision: 1,
  };
}

async function installSharedBoard(page, records, onRequest = () => {}) {
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
    const partnerIds = Array.isArray(body.partnerIds) ? body.partnerIds : [];
    const self = {
      id: "self",
      name: "Jordan Student",
      displayName: "Jordan S.",
      grade: "8",
      session: "sep22",
      partnerId: partnerIds[0] || null,
      partnerIds,
      partnerNames: partnerIds,
      status: partnerIds.length ? "pending" : "open",
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
  await expect(page.locator('[data-partner="casey"]')).toBeVisible();
});