import { expect, test } from '@playwright/test';

const viewports = [
  { width: 768, height: 1024 },
  { width: 834, height: 1194 },
  { width: 1024, height: 1366 },
];

const routes = [
  'index.html',
  'tournaments.html',
  'apply.html',
  'members-directory.html',
  'members-calendar.html',
  'members-applications.html',
  'members-volunteers.html',
];

test('members-stats keeps its temporary auth state on the stats route', async ({ request }) => {
  const response = await request.get('/members-stats.html');
  const source = await response.text();
  expect(source).toMatch(/if \(state === ['"]login['"]\)[\s\S]*?setTimeout[\s\S]*?auth\.currentUser[\s\S]*?handleExistingAuthenticatedUser/);
  expect(source).not.toMatch(/if \(state === ['"]login['"] \|\| state === ['"]denied['"]\)/);
  expect(source).toMatch(/if \(state === ['"]completing['"]\)[\s\S]*?mp-loading[\s\S]*?return;/);
});

const screenshotStyle = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  #countdown-widget,
  #public-tournament-countdown,
  .next-countdown {
    visibility: hidden !important;
  }
`;

for (const route of routes) {
  for (const viewport of viewports) {
    const viewportName = `${viewport.width}x${viewport.height}`;
    const screenshotName = `${route.replace(/\.html$/, '')}-${viewportName}.png`;

    test(`${route} stays within ${viewportName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      try {
        await page.goto(`/${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(750);

        const dimensions = await page.evaluate(() => ({
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body?.scrollWidth ?? 0,
        }));

        expect(
          dimensions.documentWidth,
          `${route} has document-level horizontal overflow at ${viewportName}: ` +
            `scrollWidth=${dimensions.documentWidth}, viewport=${dimensions.viewportWidth}`,
        ).toBeLessThanOrEqual(dimensions.viewportWidth);
        expect(
          dimensions.bodyWidth,
          `${route} has body-level horizontal overflow at ${viewportName}: ` +
            `scrollWidth=${dimensions.bodyWidth}, viewport=${dimensions.viewportWidth}`,
        ).toBeLessThanOrEqual(dimensions.viewportWidth);

        await expect(page).toHaveScreenshot(screenshotName, {
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          style: screenshotStyle,
          timeout: 15_000,
          maxDiffPixels: 100,
        });
      } finally {
        await context.close();
      }
    });
  }
}