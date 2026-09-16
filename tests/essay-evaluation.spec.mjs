import { expect, test } from "@playwright/test";

const APP_ORIGIN = "http://127.0.0.1:5000";

async function mountEvaluation(page, evaluation = null) {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="${APP_ORIGIN}/css/essay-evaluation.css?v=test">
      </head>
      <body style="margin:0;background:#071a37">
        <div id="essay-pane"></div>
        <script src="${APP_ORIGIN}/js/essay-rubric.js?v=test"></script>
        <script src="${APP_ORIGIN}/js/essay-evaluation.js?v=test"></script>
      </body>
    </html>
  `);
  await page.evaluate(({ initialEvaluation }) => {
    window.__evaluation = initialEvaluation;
    window.__revision = initialEvaluation?.revision || 0;
    window.__requests = [];
    window.__failSave = false;
    window.__delayGetMs = 0;
    window.firebase = {
      auth: () => ({
        currentUser: {
          getIdToken: async () => "test-token",
        },
      }),
    };
    window.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      window.__requests.push(body);
      if (body.action !== "get" && window.__failSave) {
        return new Response(JSON.stringify({ error: "Test save failure." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (body.action === "get") {
        if (window.__delayGetMs) {
          await new Promise((resolve) => setTimeout(resolve, window.__delayGetMs));
        }
        return new Response(JSON.stringify({ ok: true, evaluation: window.__evaluation }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      window.__revision += 1;
      window.__evaluation = {
        revision: window.__revision,
        status: body.action === "finalize" ? "finalized" : "draft",
        rubric: body.rubric,
        strengths: body.strengths,
        growthAreas: body.growthAreas,
        concerns: body.concerns,
        recommendation: body.recommendation,
        updatedBy: "coach@example.test",
        updatedAt: { _seconds: 1789500000, _nanoseconds: 0 },
      };
      return new Response(JSON.stringify({ ok: true, evaluation: window.__evaluation }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const pane = document.querySelector("#essay-pane");
    window.dispatchEvent(new CustomEvent("cooper:essay-ready", {
      detail: {
        pane,
        item: {
          id: "application-test-01",
          student: { firstName: "Test", lastName: "Applicant" },
          answers: { requiredEssay: "No document link in this fixture." },
        },
      },
    }));
  }, { initialEvaluation: evaluation });
}

test("loads a saved draft, renders the exact rubric, and autosaves a score", async ({ page }) => {
  await mountEvaluation(page, {
    revision: 2,
    status: "draft",
    rubric: {
      claimCase: 4,
      evidenceResearch: null,
      commentaryAnalysis: null,
      weighingImpacts: null,
      organizationNarrative: null,
      conclusionRecommendation: null,
      styleVoice: null,
    },
    strengths: "",
    growthAreas: "",
    concerns: "",
    recommendation: null,
  });

  await expect(page.locator(".essay-launch-wrap p")).toContainText("Draft · 1 of 7 scored · 4/35");
  await page.evaluate(() => { window.__delayGetMs = 250; });
  await page.locator(".essay-launch").click();

  await expect(page.locator(".essay-eval-title")).toHaveText("Test Applicant");
  await expect(page.locator(".eval-rubric")).toHaveAttribute("inert", "");
  await expect(page.locator(".eval-rubric")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".eval-score")).toHaveCount(35);
  await expect(page.getByText(
    "Presents a strong, precise claim and develops a clear case with at least two well-developed reasons or contentions."
  )).toBeVisible();
  await expect(page.locator(".eval-header-score")).toHaveText("1 of 7 scored · 4/35 · Not complete");
  await expect(page.locator(".eval-source-notice")).toContainText("No valid Google Drive or Google Docs link");

  await page.locator('[data-key="evidenceResearch"] .eval-cat-head').click();
  await page.locator('[data-key="evidenceResearch"] .eval-score[data-score="5"]').click();
  await expect(page.locator(".eval-header-score")).toHaveText("2 of 7 scored · 9/35 · Not complete");
  await expect.poll(async () => page.evaluate(() =>
    window.__requests.filter((request) => request.action === "save").length
  )).toBe(1);
  await expect(page.locator(".eval-status")).toHaveText("Saved just now");
});

test("mobile view switches panels and protects changes after a failed save", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountEvaluation(page, {
    revision: 3,
    status: "finalized",
    rubric: {
      claimCase: 5,
      evidenceResearch: 5,
      commentaryAnalysis: 5,
      weighingImpacts: 5,
      organizationNarrative: 5,
      conclusionRecommendation: 5,
      styleVoice: 5,
    },
    strengths: "Strong reasoning.",
    growthAreas: "Keep refining source comparison.",
    concerns: "",
    recommendation: "strongly-recommend",
    finalizedBy: "coach@example.test",
    finalizedAt: { _seconds: 1789500000, _nanoseconds: 0 },
  });
  await expect(page.locator(".essay-launch-wrap p")).toContainText("Completed · 35/35 · Outstanding");
  await page.locator(".essay-launch").click();

  await expect(page.locator('[data-view="essay"]')).toHaveClass(/active/);
  await page.locator('[data-view="rubric"]').click();
  await expect(page.locator(".eval-rubric")).toHaveClass(/mobile-visible/);
  await expect(page.locator(".eval-header-score")).toBeVisible();

  await page.evaluate(() => { window.__failSave = true; });
  await page.locator("#eval-strengths").fill("A strong opening claim.");
  await page.locator(".eval-close").click();
  await expect(page.locator(".eval-close-confirm")).toBeVisible();
  await expect(page.locator(".eval-close-confirm")).toContainText("Unsaved evaluation changes");
  await page.locator(".close-keep").click();
  await expect(page.locator(".essay-eval")).toBeVisible();
  await page.locator(".eval-close").click();
  await expect(page.locator(".eval-close-confirm")).toBeVisible();
  await page.locator(".close-discard").click();
  await expect(page.locator(".essay-eval")).not.toBeVisible();
  await expect(page.locator(".essay-launch-wrap p")).toContainText("Completed · 35/35 · Outstanding");
});

test("launcher keeps the document beside the complete seven-category quick reference", async ({ page }) => {
  await page.setContent(`
    <link rel="stylesheet" href="${APP_ORIGIN}/css/essay-evaluation.css?v=test">
    <div id="essay-pane"><div class="essay-entry-shell">
      <section class="essay-entry-document"><div class="essay-preview-body"></div></section>
      <aside class="essay-entry-reference"><header class="essay-reference-head"><div class="essay-reference-launch"></div><span class="essay-reference-head-divider"></span><div class="essay-reference-heading"><h2>Rubric Quick Reference</h2></div></header><div class="essay-reference-list">
        ${["Claim and Case","Evidence and Research","Commentary and Analysis","Weighing Impacts, and Significance","Organization and Narrative Control","Conclusion and Recommendation","Style, Voice, and Presentation"].map((title, index) => `<details class="essay-reference-category"><summary><span class="essay-ref-number">0${index + 1}</span><span class="essay-ref-title">${title}</span><span class="essay-ref-points">5 pts</span></summary><div class="essay-ref-criteria"><div><b>5</b><span>Exact scoring criterion for this category.</span></div></div></details>`).join("")}
      </div></aside>
    </div></div>
    <script src="${APP_ORIGIN}/js/essay-rubric.js?v=test"></script>
    <script src="${APP_ORIGIN}/js/essay-evaluation.js?v=test"></script>
  `);
  await page.evaluate(() => {
    window.__evaluation = null;
    window.firebase = { auth: () => ({ currentUser: { getIdToken: async () => "test-token" } }) };
    window.fetch = async () => new Response(JSON.stringify({ ok: true, evaluation: null }), { status: 200 });
    const pane = document.querySelector("#essay-pane");
    window.dispatchEvent(new CustomEvent("cooper:essay-ready", {
      detail: { pane, item: { id: "launcher-test", student: { firstName: "Ari", lastName: "Coach" }, answers: { requiredEssay: "" } } },
    }));
  });
  await expect(page.locator(".essay-entry-shell")).toBeVisible();
  await expect(page.locator(".essay-entry-document")).toBeVisible();
  await expect(page.locator(".essay-entry-reference")).toBeVisible();
  await expect(page.locator(".essay-reference-category")).toHaveCount(7);
  await expect(page.locator(".essay-reference-category .essay-ref-criteria")).toHaveCount(7);
  await expect(page.locator(".essay-launch")).toHaveText("Start Essay Evaluation");
  const layout = await page.evaluate(() => {
    const documentPanel = document.querySelector(".essay-entry-document").getBoundingClientRect();
    const referencePanel = document.querySelector(".essay-entry-reference").getBoundingClientRect();
    const launchButton = document.querySelector(".essay-launch").getBoundingClientRect();
    return {
      documentLeft: documentPanel.left,
      referenceLeft: referencePanel.left,
      referenceRight: referencePanel.right,
      referenceTop: referencePanel.top,
      launchTop: launchButton.top,
      referenceBottom: referencePanel.bottom,
      launchRight: launchButton.right,
      launchBottom: launchButton.bottom,
    };
  });
  expect(layout.referenceLeft).toBeGreaterThan(layout.documentLeft);
  expect(layout.launchTop - layout.referenceTop).toBeLessThan(40);
  expect(layout.launchRight).toBeLessThanOrEqual(layout.referenceRight);
  expect(layout.launchBottom).toBeLessThanOrEqual(layout.referenceBottom);
  const categoryColors = await page.locator(".essay-reference-category").evaluateAll((categories) =>
    categories.map((category) => getComputedStyle(category).getPropertyValue("--category-accent").trim())
  );
  expect(new Set(categoryColors).size).toBe(7);
});