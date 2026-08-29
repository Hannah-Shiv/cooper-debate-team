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
  let existingSignup = savedPartnerIds.length > 0;
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
      existingSignup = true;
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
      isExistingSignup: existingSignup,
    };
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, self }),
    });
  });
}

async function openBoard(page, selectionMode = true) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#tourney-tryout-fcps-id").fill("1234567");
  await page.locator("#tourney-tryout-name").fill("Jordan Student");
  await page.locator("#tourney-tryout-grade").selectOption("8");
  await page.locator("#tourney-tryout-show-board").click();
  await expect(page.locator("#tourney-tryout-workspace")).toBeVisible();
  const selectionIsOpen = await page.locator("#tourney-tryout-pair-heading").getByText("Choose your debate partner", { exact: true }).count();
  if (selectionMode && !selectionIsOpen) {
    await page.locator("[data-tryout-pairs]").click();
  } else if (!selectionMode && selectionIsOpen) {
    await page.locator("[data-tryout-pairs]").click();
  }
  await expect(page.locator("#tourney-tryout-pair-heading")).toHaveText(selectionMode ? "Choose your debate partner" : "Review all current pairs");
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

  const caseyRow = page.locator('[data-pref-id="casey"]');
  const blakeRow = page.locator('[data-pref-id="blake"]');
  const caseyBox = await caseyRow.boundingBox();
  const blakeBox = await blakeRow.boundingBox();
  await page.mouse.move(caseyBox.x + caseyBox.width / 2, caseyBox.y + caseyBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(blakeBox.x + blakeBox.width / 2, blakeBox.y + blakeBox.height * 0.25);
  await page.mouse.up();
  await expect(page.locator(".tourney-tryout-preference-list li").nth(1)).toContainText("Casey C.");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(0).locator("b")).toHaveText("1");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(1).locator("b")).toHaveText("2");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(2).locator("b")).toHaveText("3");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(3).locator("b")).toHaveText("4");

  const devonRow = page.locator('[data-pref-id="devon"]');
  const averyRow = page.locator('[data-pref-id="avery"]');
  const devonBox = await devonRow.boundingBox();
  const averyBox = await averyRow.boundingBox();
  await page.mouse.move(devonBox.x + devonBox.width / 2, devonBox.y + devonBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(averyBox.x + averyBox.width / 2, averyBox.y + averyBox.height * 0.75);
  await page.mouse.up();
  await expect(page.locator(".tourney-tryout-preference-list li").nth(0)).toContainText("Avery A.");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(1)).toContainText("Devon D.");

  await page.locator('[data-pref-id="devon"]').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(2)).toContainText("Devon D.");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".tourney-tryout-preference-list li").nth(3)).toContainText("Devon D.");
  await page.locator("#tourney-tryout-submit").click();
  await expect(page.locator(".tourney-tryout-action-card button:visible")).toHaveCount(5);

  const submitted = requests.find(request => request.action === "request");
  expect(submitted.partnerIds).toEqual(["avery", "casey", "blake", "devon"]);
  await expect(page.locator("#tourney-tryout-student-status")).toContainText("Partner choices saved");
});

test("shows large primary board actions", async ({ page }) => {
  await installSharedBoard(page, [publicStudent("avery", "Alexandria-Marguerite W.")]);
  await page.goto(route, { waitUntil: "domcontentloaded" });

  await expect(page.locator(".tourney-tryout-heading .section-sub")).toHaveCSS("white-space", "nowrap");
  await expect(page.locator(".tourney-tryout-heading .section-label")).toHaveCSS("color", "rgb(201, 157, 50)");
  await expect(page.locator("#tourney-tab-calendar")).toHaveText("Calendar");
  await expect(page.locator(".page-subtitle")).toHaveText("Calendar, volunteer judges, partner sign-ups, and everything families need to know");
  await expect(page.locator("#tourney-tab-tryout")).toContainText("Partner Sign Up");
  await expect(page.locator("#tourney-tab-tryout svg circle")).toHaveCount(2);
  await expect(page.locator(".tourney-tryout-heading .section-title")).toHaveText("Debate Partner Sign-Up");
  await expect(page.locator(".tourney-tryout-heading .section-sub")).toHaveCSS("color", "rgb(255, 227, 110)");
  await expect(page.locator("#tourney-tryout-details-heading")).toHaveText("Student information");
  await expect(page.locator("#tourney-tryout-output-placeholder")).toBeVisible();
  await expect(page.locator("#tourney-tryout-output-heading")).toHaveText("Your sign-up status appears here");
  await expect(page.locator(".tourney-tryout-output #tourney-tryout-status")).toHaveCount(1);
  await expect(page.locator(".tourney-tryout-gate #tourney-tryout-error")).toHaveCount(1);
  await expect(page.locator("#tourney-tryout-session-preview")).toHaveText("Tuesday, September 22 — Cafeteria — 2:30–4:30 p.m.");
  const topLayout = await page.locator(".tourney-tryout-top-layout").evaluate(layout => {
    const gate = layout.querySelector("#tourney-tryout-gate").getBoundingClientRect();
    const how = layout.querySelector(".tourney-tryout-how-panel").getBoundingClientRect();
    const output = layout.querySelector(".tourney-tryout-output").getBoundingClientRect();
    return {
      howIsBetweenPanels: how.left > gate.right && output.left > how.right,
      topsAlign: Math.abs(how.top - gate.top) < 3 && Math.abs(output.top - gate.top) < 3,
      widthsFit: gate.width + how.width + output.width <= layout.getBoundingClientRect().width,
    };
  });
  expect(topLayout.howIsBetweenPanels).toBe(true);
  expect(topLayout.topsAlign).toBe(true);
  expect(topLayout.widthsFit).toBe(true);
  await expect(page.locator(".tourney-tryout-footer-note")).toHaveCount(0);
  await expect(page.locator("#tourney-tryout-date-options option")).toHaveText([
    "Tuesday, September 22 — Cafeteria — 2:30–4:30 p.m.",
    "Wednesday, September 23 — Lecture Hall — 2:30–4:30 p.m.",
  ]);
  await expect(page.locator("#tourney-tryout-grade option").first()).toHaveText("Select Grade");
  await expect(page.locator(".tourney-tryout-id-field > span")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".tourney-tryout-name-field > span")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator("#tourney-tryout-id-help")).toHaveCount(0);
  await page.locator("#tourney-tryout-show-board").click();
  await expect(page.locator("#tourney-tryout-gate #tourney-tryout-error")).toBeVisible();
  await expect(page.locator("#tourney-tryout-gate #tourney-tryout-error")).toHaveText("Please enter the student’s seven-digit FCPS ID.");
  await expect(page.locator("#tourney-tryout-show-board")).toHaveCSS("min-height", "55px");
  await openBoard(page, false);
  await expect(page.locator("#scroll-top")).toHaveCount(0);
  await expect(page.locator("#tourney-tryout-gate")).toBeVisible();
  await expect(page.locator("#tourney-tryout-workspace-label")).toHaveText("How it works");
  await expect(page.locator("#tourney-tryout-workspace-label")).toHaveCSS("font-weight", "900");
  expect(parseFloat(await page.locator("#tourney-tryout-workspace-label").evaluate(label => getComputedStyle(label).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(page.locator("#tourney-tryout-output-placeholder")).toBeHidden();
  await expect(page.locator(".tourney-tryout-output #tourney-tryout-identity")).toBeVisible();
  await expect(page.locator(".tourney-tryout-output #tourney-tryout-output-paired")).toBeVisible();
  await expect(page.locator(".tourney-tryout-output #tourney-tryout-output-pending")).toBeVisible();
  await expect(page.locator(".tourney-tryout-output #tourney-tryout-output-open")).toBeVisible();
  await expect(page.locator("#tourney-tryout-pair-heading")).toHaveText("Review all current pairs");
  await expect(page.locator(".tourney-tryout-flow strong")).toHaveText([
    "Review all pairs",
    "Select up to four",
    "Set your priority",
    "Submit your choices",
  ]);
  await expect(page.locator(".tourney-tryout-flow small")).toHaveText([
    "Check the shared board to see which students are open for your selected session.",
    "Add the students you would be comfortable debating with this season.",
    "Drag choices or use the arrow keys to rank your preferences from first to fourth.",
    "Save your ranked list so the board can identify mutual partner choices.",
  ]);
  const desktopFlow = await page.locator(".tourney-tryout-how-panel .tourney-tryout-flow li").evaluateAll(items => items.map(item => item.getBoundingClientRect()));
  for (let index = 1; index < desktopFlow.length; index += 1) {
    expect(desktopFlow[index].top).toBeGreaterThan(desktopFlow[index - 1].bottom);
  }
  await expect(page.locator(".tourney-tryout-flow-number").nth(0)).toHaveCSS("border-top-color", "rgb(118, 189, 255)");
  await expect(page.locator(".tourney-tryout-flow-number").nth(1)).toHaveCSS("border-top-color", "rgb(108, 224, 200)");
  await expect(page.locator(".tourney-tryout-flow-number").nth(2)).toHaveCSS("border-top-color", "rgb(193, 173, 255)");
  await expect(page.locator(".tourney-tryout-flow-number").nth(3)).toHaveCSS("border-top-color", "rgb(244, 196, 76)");
  await expect(page.locator("[data-tryout-print]")).toBeVisible();
  const printPopupPromise = page.waitForEvent("popup");
  await page.locator("[data-tryout-print]").click();
  const printPopup = await printPopupPromise;
  await expect(printPopup).toHaveTitle(/Debate Partner Sign-Up/);
  await expect(printPopup.locator("table")).toBeVisible();
  await expect(printPopup.locator("th")).toHaveText(["#", "Student 1", "Student 2", "Status"]);
  await expect(printPopup.locator("dd")).toHaveText(["Tuesday, September 22", "2:30–4:30 p.m.", "Cafeteria"]);
  await printPopup.close();
  await expect(page.locator(".tourney-tryout-roster")).toBeHidden();
  await expect(page.locator("[data-tryout-pairs] span").nth(1)).toHaveText("Select partners");
  const gateMetrics = await page.locator("#tourney-tryout-gate").evaluate(gate => {
    const footer = gate.querySelector(".tourney-tryout-gate-actions").getBoundingClientRect();
    return {
      gateWidth: gate.getBoundingClientRect().width,
      idInput: gate.querySelector("#tourney-tryout-fcps-id").getBoundingClientRect(),
      nameInput: gate.querySelector("#tourney-tryout-name").getBoundingClientRect(),
      gradeInput: gate.querySelector("#tourney-tryout-grade").getBoundingClientRect(),
      sessionInput: gate.querySelector("#tourney-tryout-date-options").getBoundingClientRect(),
      footer,
      privacy: gate.querySelector(".tourney-tryout-gate-actions p").getBoundingClientRect(),
      continueButton: gate.querySelector("#tourney-tryout-show-board").getBoundingClientRect(),
      gradeTextFits: gate.querySelector("#tourney-tryout-grade").scrollWidth <= gate.querySelector("#tourney-tryout-grade").clientWidth,
    };
  });
  expect(gateMetrics.gateWidth).toBeGreaterThan(400);
  expect(Math.abs(gateMetrics.idInput.top - gateMetrics.nameInput.top)).toBeLessThan(4);
  expect(Math.abs(gateMetrics.gradeInput.top - gateMetrics.sessionInput.top)).toBeLessThan(4);
  expect(gateMetrics.gradeInput.top).toBeGreaterThan(gateMetrics.idInput.bottom);
  expect(gateMetrics.idInput.width).toBeGreaterThan(85);
  expect(gateMetrics.nameInput.width).toBeGreaterThan(210);
  expect(Math.abs(gateMetrics.sessionInput.width - gateMetrics.nameInput.width)).toBeLessThan(2);
  expect(gateMetrics.gradeTextFits).toBe(true);
  expect(gateMetrics.footer.top).toBeGreaterThan(gateMetrics.sessionInput.bottom);
  expect(gateMetrics.footer.height).toBeLessThan(150);
  expect(gateMetrics.continueButton.left).toBeGreaterThan(gateMetrics.privacy.right);
  expect(parseFloat(await page.locator(".tourney-tryout-legend p").first().evaluate(item => getComputedStyle(item).fontSize))).toBeGreaterThanOrEqual(11);
  await page.locator("[data-tryout-pairs]").click();
  await expect(page.locator("#tourney-tryout-message")).toBeHidden();
  await expect(page.locator(".tourney-tryout-how-panel .tourney-tryout-screen-heading p")).toHaveText("How it works");
  await expect(page.locator("#tourney-tryout-pair-heading")).toHaveText("Choose your debate partner");
  await expect(page.locator("#tourney-tryout-submit")).toHaveCSS("min-height", "50px");
  await expect(page.locator(".tourney-tryout-action-card button:visible")).toHaveCount(2);
  await expect(page.locator("#tourney-tryout-identity-label")).toHaveText("Partner sign-up in progress");
  await expect(page.locator("[data-tryout-pairs]")).toBeVisible();
  await expect(page.locator("[data-tryout-print]")).toBeHidden();
  await expect(page.locator("[data-tryout-edit]")).toBeHidden();
  await expect(page.locator("[data-tryout-withdraw]")).toBeHidden();
  await expect(page.locator("[data-tryout-new]")).toBeHidden();
  await expect(page.locator(".tourney-tryout-action-submit")).toContainText("When you are ready, submit your ranked choices.");
  const actionLayout = await page.locator(".tourney-tryout-action-card").evaluate(card => {
    const board = document.querySelector(".tourney-tryout-board").getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const submit = card.querySelector("#tourney-tryout-submit");
    return {
      toRightOfBoard: cardBox.left >= board.right,
      submitInsideCard: Boolean(submit),
      submitIsLast: submit.closest(".tourney-tryout-action-list").lastElementChild.contains(submit),
    };
  });
  expect(actionLayout.toRightOfBoard).toBe(true);
  expect(actionLayout.submitInsideCard).toBe(true);
  expect(actionLayout.submitIsLast).toBe(true);
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

test("stacks the partner signup panel cleanly on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSharedBoard(page, [publicStudent("avery", "Avery A.")]);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#tourney-tryout-grade").selectOption("8");

  const mobileLayout = await page.locator("#tourney-tryout-gate").evaluate(gate => {
    const ids = ["tourney-tryout-fcps-id", "tourney-tryout-name", "tourney-tryout-grade", "tourney-tryout-date-options"];
    const controls = ids.map(id => gate.querySelector("#" + id).getBoundingClientRect());
    const privacy = gate.querySelector(".tourney-tryout-gate-actions p").getBoundingClientRect();
    const button = gate.querySelector("#tourney-tryout-show-board").getBoundingClientRect();
    return {
      controls,
      privacy,
      button,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });

  for (let index = 1; index < mobileLayout.controls.length; index += 1) {
    expect(mobileLayout.controls[index].top).toBeGreaterThan(mobileLayout.controls[index - 1].bottom);
  }
  expect(mobileLayout.controls.every(control => control.width > 260)).toBe(true);
  expect(mobileLayout.button.top).toBeGreaterThan(mobileLayout.privacy.bottom);
  expect(mobileLayout.noHorizontalOverflow).toBe(true);
  await expect(page.locator("#tourney-tryout-grade option:checked")).toHaveText("8th grade");
  const mobileTopLayout = await page.locator(".tourney-tryout-top-layout").evaluate(layout => {
    const gate = layout.querySelector("#tourney-tryout-gate").getBoundingClientRect();
    const output = layout.querySelector(".tourney-tryout-output").getBoundingClientRect();
    return { outputBelowGate: output.top > gate.bottom, outputFits: output.width <= layout.getBoundingClientRect().width };
  });
  expect(mobileTopLayout.outputBelowGate).toBe(true);
  expect(mobileTopLayout.outputFits).toBe(true);

  await openBoard(page, false);
  const mobileBoardLayout = await page.locator("#tourney-tryout-workspace").evaluate(workspace => {
    const steps = Array.from(document.querySelectorAll(".tourney-tryout-how-panel .tourney-tryout-flow li")).map(step => step.getBoundingClientRect());
    const actionCard = workspace.querySelector(".tourney-tryout-action-card").getBoundingClientRect();
    const visibleButtons = Array.from(workspace.querySelectorAll(".tourney-tryout-action-card button")).filter(button => !button.hidden);
    return {
      steps,
      actionCard,
      buttonsFitCard: visibleButtons.every(button => button.getBoundingClientRect().width <= actionCard.width),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  for (let index = 1; index < mobileBoardLayout.steps.length; index += 1) {
    expect(mobileBoardLayout.steps[index].top).toBeGreaterThan(mobileBoardLayout.steps[index - 1].bottom);
  }
  expect(mobileBoardLayout.buttonsFitCard).toBe(true);
  expect(mobileBoardLayout.noHorizontalOverflow).toBe(true);
});

test("opens new students in selection and returning students in all-pairs review", async ({ page }) => {
  await installSharedBoard(page, [
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
  ]);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("#tourney-tryout-fcps-id").fill("1234567");
  await page.locator("#tourney-tryout-name").fill("Jordan Student");
  await page.locator("#tourney-tryout-grade").selectOption("8");
  await page.locator("#tourney-tryout-show-board").click();

  await expect(page.locator("#tourney-tryout-pair-heading")).toHaveText("Choose your debate partner");
  await expect(page.locator(".tourney-tryout-roster")).toBeVisible();
  await expect(page.locator("[data-tryout-print]")).toBeHidden();
  await expect(page.locator("[data-tryout-pairs] span").nth(1)).toHaveText("Show all pairs");

  const returningPage = await page.context().newPage();
  await installSharedBoard(returningPage, [
    publicStudent("avery", "Avery A."),
    publicStudent("blake", "Blake B."),
  ], () => {}, ["avery"]);
  await returningPage.goto(route, { waitUntil: "domcontentloaded" });
  await returningPage.locator("#tourney-tryout-fcps-id").fill("7654321");
  await returningPage.locator("#tourney-tryout-name").fill("Returning Student");
  await returningPage.locator("#tourney-tryout-grade").selectOption("8");
  await returningPage.locator("#tourney-tryout-show-board").click();

  await expect(returningPage.locator("#tourney-tryout-pair-heading")).toHaveText("Review all current pairs");
  await expect(returningPage.locator(".tourney-tryout-roster")).toBeHidden();
  await expect(returningPage.locator("[data-tryout-print]")).toBeVisible();
  await expect(returningPage.locator("[data-tryout-pairs] span").nth(1)).toHaveText("Select partners");
  await expect(returningPage.locator(".tourney-tryout-output #tourney-tryout-identity")).toBeVisible();
  await returningPage.close();
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
  await expect(page.locator(".tourney-tryout-action-card button:visible")).toHaveCount(5);
  await expect(page.locator("#tourney-tryout-identity-label")).toHaveText("Current debate partner sign-up");
  await expect(page.locator("#tourney-tryout-workspace")).toBeVisible();
  await expect(page.locator("#tourney-tryout-workspace-label")).toHaveText("How it works");
  await expect(page.locator(".tourney-tryout-roster")).toBeHidden();
  await expect(page.locator("[data-tryout-pairs]")).toBeVisible();
  await expect(page.locator("[data-tryout-pairs]")).toBeDisabled();
  await expect(page.locator("[data-tryout-pairs] span").nth(1)).toHaveText("All pairs shown");
  await expect(page.locator("#tourney-tryout-pair-heading")).toHaveText("Review all current pairs");
  await expect(page.locator("#tourney-tryout-submit")).toBeHidden();
  await expect(page.locator("[data-drop-slot]")).toHaveCount(0);
  await expect(page.locator(".tourney-tryout-drop-slot.is-read-only").first()).toContainText("Open row");

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
  await expect(page.locator("#tourney-tryout-message")).toContainText("up to four students");
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
  await page.locator("#tourney-tryout-date-options").selectOption("sep23");
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