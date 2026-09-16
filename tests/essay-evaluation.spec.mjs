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
      if (body.action === "reset") {
        window.__evaluation = null;
        window.__revision = 0;
        return new Response(JSON.stringify({ ok: true, evaluation: null }), {
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

  await expect(page.locator(".essay-launch-wrap p")).toContainText("In Progress4/35");
  await expect(page.locator(".essay-launch-wrap p")).not.toContainText("coach@example.test");
  await expect(page.locator(".essay-progress-score")).toHaveCSS("font-size", "18.88px");
  await page.evaluate(() => { window.__delayGetMs = 250; });
  await page.locator(".essay-launch").click();

  await expect(page.locator(".essay-eval-title")).toHaveText("Test Applicant");
  await expect(page.locator(".eval-rubric")).toHaveAttribute("inert", "");
  await expect(page.locator(".eval-rubric")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".eval-score")).toHaveCount(35);
  await expect(page.getByText(
    "Presents a strong, precise claim and develops a clear case with at least two well-developed reasons or contentions."
  )).toBeVisible();
  await expect(page.locator(".eval-header-score")).toHaveText("1 of 7 categories · 4 / 35 points");
  await expect(page.locator('[data-key="claimCase"] .eval-cat-grade')).toHaveText("Good");
  await expect(page.locator('[data-key="claimCase"]')).toHaveClass(/scored/);
  await expect(page.locator(".eval-source-notice")).toContainText("No valid Google Drive or Google Docs link");

  await page.locator('[data-key="evidenceResearch"] .eval-cat-head').click();
  await page.locator('[data-key="evidenceResearch"] .eval-score[data-score="5"]').click();
  await expect(page.locator(".eval-header-score")).toHaveText("2 of 7 categories · 9 / 35 points");
  await expect(page.locator(".eval-meter span")).toHaveText("29%");
  await expect(page.locator('[data-key="evidenceResearch"] .eval-cat-grade')).toHaveText("Outstanding");
  await expect(page.locator('[data-key="evidenceResearch"] .eval-cat-score')).toHaveText("5/5");
  const gradeWidths = await page.locator(".eval-cat-grade").evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().width)
  );
  expect(new Set(gradeWidths).size).toBe(1);
  expect(gradeWidths[0]).toBe(104);
  await expect.poll(async () => page.evaluate(() =>
    window.__requests.filter((request) => request.action === "save").length
  )).toBe(1);
  await expect(page.locator(".eval-status")).toHaveText("Saved just now");
});

test("reset clears a saved evaluation and restores the Not Started launcher", async ({ page }) => {
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
    strengths: "Clear claim.",
    growthAreas: "",
    concerns: "",
    recommendation: null,
  });

  await expect(page.locator(".essay-launch-wrap p")).toContainText("In Progress4/35");
  await page.locator(".essay-launch").click();
  await expect(page.locator(".eval-reset")).toBeVisible();
  await expect(page.locator(".eval-reset")).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator(".eval-reset")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.locator(".eval-reset").click();
  await expect(page.locator(".eval-reset-confirm")).toBeVisible();
  await expect(page.locator(".eval-reset-confirm")).toContainText("This cannot be undone.");
  const resetConfirmationLayout = await page.locator(".eval-reset-confirm").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
      width: rect.width,
    };
  });
  expect(Math.abs(resetConfirmationLayout.centerX - resetConfirmationLayout.viewportCenterX)).toBeLessThan(2);
  expect(Math.abs(resetConfirmationLayout.centerY - resetConfirmationLayout.viewportCenterY)).toBeLessThan(2);
  expect(resetConfirmationLayout.width).toBeGreaterThan(500);
  expect(resetConfirmationLayout.width).toBeLessThan(650);
  await page.locator(".reset-confirm").click();

  await expect(page.locator(".essay-eval")).not.toBeVisible();
  await expect(page.locator(".essay-launch-wrap p")).toHaveText("Not started");
  await expect(page.locator(".essay-launch")).toHaveText("Start Essay Evaluation");
  await expect.poll(async () => page.evaluate(() =>
    window.__requests.filter((request) => request.action === "reset").at(-1)?.expectedRevision
  )).toBe(2);
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
  await expect(page.locator(".essay-launch-wrap p")).toContainText("Evaluated35/35Strongly recommend");
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
  await expect(page.locator(".essay-launch-wrap p")).toContainText("Evaluated35/35Strongly recommend");
});

test("evaluation header uses compact labeled groups without small-laptop overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mountEvaluation(page, null);
  await page.locator(".essay-launch").click();

  await expect(page.locator(".essay-eval-kicker")).toHaveText("Evaluation Workspace");
  await expect(page.locator(".essay-eval-sub")).toHaveText("Read document → Score categories");
  await expect(page.locator(".eval-head-summary strong")).toHaveText("Essay Evaluation");
  await expect(page.locator(".eval-header-score")).toHaveText("0 of 7 categories · 0 / 35 points");
  await expect(page.locator(".eval-status")).toHaveText("Not started");
  await expect(page.locator(".eval-head-recommendation span")).toHaveText("Not selected");
  const header = await page.evaluate(() => {
    const detailSelectors = [".essay-eval-title", ".essay-eval-sub", ".eval-header-score", ".eval-meter", ".eval-status", ".eval-head-recommendation", ".eval-finalize", ".eval-close"];
    const actionSelectors = [".eval-status", ".eval-head-recommendation", ".eval-finalize", ".eval-close"];
    const detailBoxes = detailSelectors.map(selector => document.querySelector(selector).getBoundingClientRect());
    const actionBoxes = actionSelectors.map(selector => document.querySelector(selector).getBoundingClientRect());
    const scoreStyle = getComputedStyle(document.querySelector(".eval-header-score"));
    const statusStyle = getComputedStyle(document.querySelector(".eval-status"));
    const closeStyle = getComputedStyle(document.querySelector(".eval-close"));
    const finalizeStyle = getComputedStyle(document.querySelector(".eval-finalize"));
    const status = document.querySelector(".eval-status").getBoundingClientRect();
    const close = document.querySelector(".eval-close").getBoundingClientRect();
    const finalize = document.querySelector(".eval-finalize").getBoundingClientRect();
    const header = document.querySelector(".essay-eval-head");
    const progress = document.querySelector(".eval-meter");
    const statusLabel = document.querySelector(".eval-head-status-group .eval-head-label").getBoundingClientRect();
    const recommendationLabel = document.querySelector(".eval-head-rec-group .eval-head-label").getBoundingClientRect();
    const recommendation = document.querySelector(".eval-head-recommendation").getBoundingClientRect();
    const progressStyle = getComputedStyle(progress);
    const progressTextStyle = getComputedStyle(progress.querySelector("span"));
    return {
      actionsOrdered: actionBoxes.every((box, index) => index === 0 || box.left >= actionBoxes[index - 1].right),
      actionsOneLine: Math.max(...actionBoxes.map(box => box.top + box.height / 2)) - Math.min(...actionBoxes.map(box => box.top + box.height / 2)) < 2,
      detailBaseline: Math.max(...detailBoxes.map(box => box.bottom)) - Math.min(...detailBoxes.map(box => box.bottom)) < 6,
      compactHeight: header.getBoundingClientRect().height,
      noHeaderOverflow: header.scrollWidth <= header.clientWidth,
      noDialogOverflow: document.querySelector(".essay-eval-shell").scrollWidth <= document.querySelector(".essay-eval-shell").clientWidth,
      progressInHeader: progress.closest(".eval-head-summary") !== null,
      statusCentered: Math.abs((statusLabel.left + statusLabel.width / 2) - (status.left + status.width / 2)) < 1,
      recommendationCentered: Math.abs((recommendationLabel.left + recommendationLabel.width / 2) - (recommendation.left + recommendation.width / 2)) < 1,
      progressBackground: progressStyle.backgroundColor,
      progressTextColor: progressTextStyle.color,
      progressTextLayer: Number(progressTextStyle.zIndex),
      scoreWidth: document.querySelector(".eval-header-score").getBoundingClientRect().width,
      scoreRadius: parseFloat(scoreStyle.borderRadius),
      statusRadius: parseFloat(statusStyle.borderRadius),
      essayTitleSize: parseFloat(getComputedStyle(document.querySelector(".eval-head-summary strong")).fontSize),
      scoreSize: parseFloat(scoreStyle.fontSize),
      statusDivider: getComputedStyle(document.querySelector(".eval-status"), "::before").borderRightWidth,
      statusWidth: status.width,
      instructionSize: parseFloat(getComputedStyle(document.querySelector(".essay-eval-sub")).fontSize),
      instructionColor: getComputedStyle(document.querySelector(".essay-eval-sub")).color,
      actionHeights: actionBoxes.map(box => box.height),
      closeBackground: closeStyle.backgroundImage,
      finalizeBackground: finalizeStyle.backgroundImage,
      finalizeBackgroundColor: finalizeStyle.backgroundColor,
      finalizeColor: finalizeStyle.color,
      closeIsLast: document.querySelector(".essay-eval-head-actions").lastElementChild.classList.contains("eval-close"),
      recommendationBetweenStatusAndFinalize:
        document.querySelector(".eval-head-status-group").nextElementSibling.classList.contains("eval-head-rec-group") &&
        document.querySelector(".eval-head-rec-group").nextElementSibling.classList.contains("eval-finalize-wrap"),
      statusCloseGap: close.left - status.right,
      finalizeCloseGap: close.left - finalize.right,
    };
  });
  expect(header.actionsOrdered).toBe(true);
  expect(header.actionsOneLine).toBe(true);
  expect(header.detailBaseline).toBe(true);
  expect(header.compactHeight).toBeLessThanOrEqual(64);
  expect(header.noHeaderOverflow).toBe(true);
  expect(header.noDialogOverflow).toBe(true);
  expect(header.progressInHeader).toBe(true);
  expect(header.statusCentered).toBe(true);
  expect(header.recommendationCentered).toBe(true);
  expect(header.progressBackground).toBe("rgb(6, 57, 67)");
  expect(header.progressTextColor).toBe("rgb(255, 255, 255)");
  expect(header.progressTextLayer).toBeGreaterThan(1);
  expect(header.scoreWidth).toBeGreaterThanOrEqual(205);
  expect(header.scoreRadius).toBeGreaterThan(20);
  expect(header.statusRadius).toBeGreaterThan(20);
  expect(header.essayTitleSize).toBeGreaterThanOrEqual(7.5);
  expect(header.scoreSize).toBeGreaterThanOrEqual(12.1);
  expect(header.statusDivider).toBe("1px");
  expect(header.statusWidth).toBe(96);
  expect(header.instructionSize).toBeGreaterThanOrEqual(13.7);
  expect(header.instructionColor).toBe("rgb(212, 230, 248)");
  expect(header.actionHeights.every(height => height === 30)).toBe(true);
  expect(header.closeBackground).toContain("182, 59, 71");
  expect(header.finalizeBackground).toBe("none");
  expect(header.finalizeBackgroundColor).toBe("rgb(23, 107, 76)");
  expect(header.finalizeColor).toBe("rgb(255, 255, 255)");
  expect(header.closeIsLast).toBe(true);
  expect(header.recommendationBetweenStatusAndFinalize).toBe(true);
  expect(header.finalizeCloseGap).toBeGreaterThanOrEqual(4);

  const finalizeHelp = page.locator(".eval-finalize-help");
  await page.mouse.move(2, 400);
  await expect(finalizeHelp).toBeHidden();
  await page.locator(".eval-finalize-wrap").hover();
  await expect(finalizeHelp).toBeVisible();
  await expect(finalizeHelp).toContainText("Please score all categories and choose a recommendation to activate.");
  const tooltipBox = await finalizeHelp.boundingBox();
  const headerBox = await page.locator(".essay-eval-head").boundingBox();
  expect(tooltipBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);

  await page.locator('[data-key="claimCase"] .eval-score[data-score="4"]').click();
  await expect(page.locator(".eval-reset")).toBeVisible();
  const savedDraftOverflow = await page.evaluate(() => {
    const header = document.querySelector(".essay-eval-head");
    const shell = document.querySelector(".essay-eval-shell");
    const close = document.querySelector(".eval-close").getBoundingClientRect();
    return {
      headerFits: header.scrollWidth <= header.clientWidth,
      shellFits: shell.scrollWidth <= shell.clientWidth,
      closeFits: close.right <= window.innerWidth,
    };
  });
  expect(savedDraftOverflow).toEqual({ headerFits: true, shellFits: true, closeFits: true });

  const close = page.locator(".eval-close");
  const restingBackground = await close.evaluate(element => getComputedStyle(element).backgroundImage);
  await close.hover();
  await page.waitForTimeout(220);
  const hoverStyle = await close.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundImage, shadow: style.boxShadow, transform: style.transform };
  });
  expect(hoverStyle.background).not.toBe(restingBackground);
  expect(hoverStyle.shadow).not.toBe("none");
  expect(hoverStyle.transform).not.toBe("none");
});

test("coaching notes are optional and recommendation colors persist after selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountEvaluation(page, null);
  await page.locator(".essay-launch").click();

  await expect(page.locator('label[for="eval-strengths"]')).toContainText("Optional");
  await expect(page.locator('label[for="eval-growth"]')).toContainText("Optional");
  await expect(page.locator(".eval-meter span")).toHaveText("0%");
  await expect(page.locator(".eval-meter i")).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator(".eval-cat-grade")).toHaveCount(7);
  await expect(page.locator(".eval-cat-score")).toHaveCount(7);
  await expect(page.locator(".eval-cat-grade").first()).toHaveText("Choose level");
  await expect(page.locator(".eval-cat-score").first()).toHaveText("— /5");

  const categoryColors = await page.locator(".eval-category").evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).borderLeftColor)
  );
  expect(new Set(categoryColors).size).toBe(7);

  const recommendation = page.locator('[data-rec="recommend"]');
  const restingColor = await recommendation.evaluate(element => getComputedStyle(element).backgroundColor);
  await recommendation.hover();
  await page.waitForTimeout(220);
  const hoverColor = await recommendation.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(hoverColor).not.toBe(restingColor);
  await recommendation.click();
  await page.waitForTimeout(220);
  await expect(recommendation).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".eval-head-recommendation span")).toHaveText("Recommend");
  expect(await recommendation.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(hoverColor);

  for (const category of await page.locator(".eval-category").all()) {
    const score = category.locator('.eval-score[data-score="5"]');
    if (!(await score.isVisible())) await category.locator(".eval-cat-head").click();
    await score.click();
  }
  await expect(page.locator("#eval-strengths")).toHaveValue("");
  await expect(page.locator("#eval-growth")).toHaveValue("");
  await expect(page.locator(".eval-finalize")).toBeEnabled();
});

test("launcher keeps the document beside the complete seven-category quick reference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
  expect(layout.launchTop - layout.referenceTop).toBeLessThan(60);
  expect(layout.launchRight).toBeLessThanOrEqual(layout.referenceRight);
  expect(layout.launchBottom).toBeLessThanOrEqual(layout.referenceBottom);
  const categoryColors = await page.locator(".essay-reference-category").evaluateAll((categories) =>
    categories.map((category) => getComputedStyle(category).getPropertyValue("--category-accent").trim())
  );
  expect(new Set(categoryColors).size).toBe(7);
});