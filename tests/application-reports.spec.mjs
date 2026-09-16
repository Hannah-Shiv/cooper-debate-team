import { test, expect } from "@playwright/test";

const applications = [
  {
    id: "app-b",
    student: { firstName: "Jordan", lastName: "Beta", studentId: "200", grade: "8th Grade" },
    createdAt: 2000,
    reviewStatus: "accepted",
    reviewedAt: 3000,
    reviewRating: 9,
    reviewNote: "Strong overall application.",
  },
  {
    id: "app-a",
    student: { firstName: "Alex", lastName: "Alpha", studentId: "100", grade: "7th Grade" },
    createdAt: 1000,
    reviewNote: "",
  },
  {
    id: "app-h",
    student: { firstName: "Casey", lastName: "Hold", studentId: "150", grade: "8th Grade" },
    createdAt: 1500,
    reviewedAt: 2500,
    reviewedBy: "coach@example.test",
    reviewRating: 6,
    reviewNote: "Awaiting final decision.",
  },
];

const evaluations = {
  "app-b": {
    status: "finalized",
    rubric: {
      claimCase: 5,
      evidenceResearch: 5,
      commentaryAnalysis: 4,
      weighingImpacts: 4,
      organizationNarrative: 5,
      conclusionRecommendation: 4,
      styleVoice: 5,
    },
    recommendation: "strongly-recommend",
    interpretation: "Outstanding",
  },
  "app-h": {
    status: "draft",
    rubric: {
      claimCase: 3,
      evidenceResearch: null,
      commentaryAnalysis: null,
      weighingImpacts: null,
      organizationNarrative: null,
      conclusionRecommendation: null,
      styleVoice: null,
    },
  },
};

async function mountReports(page) {
  await page.setContent(`
    <button id="essay-scores-report">Essay Scores</button>
    <button id="decision-status-report">Decision Status</button>
  `);
  await page.evaluate(({ records, essayRecords }) => {
    window.__cooperApplicationsReportContext = {
      applications: records,
      currentUser: { getIdToken: async () => "test-token" },
      role: "coach",
    };
    window.__essayReportFixture = essayRecords;
    window.fetch = async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => {
        const body = JSON.parse(options.body);
        return body.action === "list"
          ? { ok: true, evaluations: window.__essayReportFixture }
          : { ok: false, error: "Unexpected action" };
      },
    });
  }, { records: applications, essayRecords: evaluations });
  await page.addStyleTag({ path: "css/application-reports.css" });
  await page.addScriptTag({ path: "js/application-reports.js" });
}

test("essay report shows all grading states, filters, and sorts by total", async ({ page }) => {
  await mountReports(page);
  await page.locator("#essay-scores-report").click();

  const dialog = page.locator(".application-report-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("tbody tr")).toHaveCount(3);
  await expect(dialog).toContainText("Not Started");
  await expect(dialog).toContainText("In Progress");
  await expect(dialog).toContainText("Evaluated");
  await expect(dialog.locator("tbody tr").filter({ hasText: "Casey Hold" })).toContainText("Not complete");
  await expect(dialog).not.toContainText("Team Review");

  await dialog.locator("#report-status").selectOption("evaluated");
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(dialog.locator("tbody tr")).toContainText("Jordan Beta");

  await dialog.locator("#report-status").selectOption("all");
  await dialog.getByRole("button", { name: "Total /35" }).click();
  await expect(dialog.locator("tbody tr").first()).toContainText("Alex Alpha");
  await dialog.getByRole("button", { name: "Total /35" }).click();
  await expect(dialog.locator("tbody tr").first()).toContainText("Jordan Beta");
});

test("decision report distinguishes pending and on hold without Team Review data", async ({ page }) => {
  await mountReports(page);
  await page.locator("#decision-status-report").click();

  const dialog = page.locator(".application-report-dialog");
  await expect(dialog.locator("tbody tr")).toHaveCount(3);
  await expect(dialog).toContainText("Pending");
  await expect(dialog).toContainText("On Hold");
  await expect(dialog).toContainText("Accepted");
  await expect(dialog).not.toContainText("Team Review");

  await dialog.locator("#report-status").selectOption("on-hold");
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(dialog.locator("tbody tr")).toContainText("Casey Hold");

  await dialog.locator("#report-search").fill("Jordan");
  await expect(dialog).toContainText("No matching applicants");
});

test("reports hide hidden records by default and reveal them on request", async ({ page }) => {
  await mountReports(page);
  await page.evaluate(() => {
    window.__cooperApplicationsReportContext.applications.push({
      id: "app-hidden",
      hidden: true,
      student: { firstName: "Hidden", lastName: "Applicant", studentId: "999", grade: "7th Grade" },
      createdAt: 900,
    });
  });

  await page.locator("#decision-status-report").click();
  let dialog = page.locator(".application-report-dialog");
  await expect(dialog.locator("tbody tr")).toHaveCount(3);
  await expect(dialog).not.toContainText("Hidden Applicant");
  await dialog.locator("#report-show-hidden").check();
  await expect(dialog.locator("tbody tr")).toHaveCount(4);
  await expect(dialog).toContainText("Hidden Applicant");
  await dialog.locator(".report-close").click();

  await page.locator("#essay-scores-report").click();
  dialog = page.locator(".application-report-dialog");
  await expect(dialog.locator("tbody tr")).toHaveCount(3);
  await dialog.locator("#report-show-hidden").check();
  await expect(dialog.locator("tbody tr")).toHaveCount(4);
});

test("a late essay response cannot overwrite a newer decision report", async ({ page }) => {
  await page.setContent(`
    <button id="essay-scores-report">Essay Scores</button>
    <button id="decision-status-report">Decision Status</button>
  `);
  await page.evaluate(({ records, essayRecords }) => {
    window.__cooperApplicationsReportContext = {
      applications: records,
      currentUser: { getIdToken: async () => "test-token" },
      role: "coach",
    };
    window.fetch = async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(resolve => setTimeout(() => resolve({ ok: true, evaluations: essayRecords }), 150)),
    });
  }, { records: applications, essayRecords: evaluations });
  await page.addStyleTag({ path: "css/application-reports.css" });
  await page.addScriptTag({ path: "js/application-reports.js" });

  await page.locator("#essay-scores-report").click();
  await page.locator(".report-close").click();
  await page.locator("#decision-status-report").click();
  await page.waitForTimeout(250);

  const dialog = page.locator(".application-report-dialog");
  await expect(dialog.locator("#report-title")).toHaveText("Decision Status");
  await expect(dialog.getByRole("columnheader", { name: /^Decision ↕$/ })).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: /Claim & Case/ })).toHaveCount(0);
});

test("print mode releases fixed page heights so long reports can paginate", async ({ page }) => {
  await mountReports(page);
  await page.locator("#decision-status-report").click();
  await page.emulateMedia({ media: "print" });

  const layout = await page.evaluate(() => ({
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    bodyHeight: getComputedStyle(document.body).height,
    dialogOverflow: getComputedStyle(document.querySelector(".application-report-dialog")).overflow,
  }));
  expect(layout.htmlOverflow).toBe("visible");
  expect(layout.bodyOverflow).toBe("visible");
  expect(layout.bodyHeight).not.toBe("100%");
  expect(layout.dialogOverflow).toBe("visible");
});