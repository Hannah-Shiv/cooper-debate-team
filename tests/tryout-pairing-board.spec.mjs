import { expect, test } from '@playwright/test';

const route = '/tournaments.html?tab=tryout-signup';
const storageKey = 'cooper_tryout_signups_v1';
const activeKey = 'cooper_tryout_active_student_v1';

function record(id, name, partnerId = null) {
  const timestamp = '2026-08-29T12:00:00.000Z';
  return {
    id,
    name,
    grade: '8',
    dates: ['sep22'],
    selectedDate: 'sep22',
    mode: 'partner',
    partnerId,
    assignedPartnerId: null,
    tint: 'blue',
    piece: 'boy',
    isDemo: false,
    withdrawn: false,
    releasedReason: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function seed(page, records, activeId = null) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ storageKey, activeKey, records, activeId }) => {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, revision: 0, records }));
    if (activeId) localStorage.setItem(activeKey, activeId);
    else localStorage.removeItem(activeKey);
  }, { storageKey, activeKey, records, activeId });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('supports drag and tap placement without horizontal overflow', async ({ page }) => {
  await seed(page, []);
  await page.evaluate(({ storageKey, activeKey }) => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(activeKey);
  }, { storageKey, activeKey });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#tourney-tryout-continue').click();

  await page.locator('[data-partner="demo-sam"]').dragTo(page.locator('[data-drop-slot]').first());
  await expect(page.locator('[data-partner="demo-sam"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tourney-tryout-board-row.is-your-request')).toHaveCount(1);

  await page.locator('[data-board-row="5"] [data-drop-slot]').first().click();
  await expect(page.locator('[data-board-row="5"].is-your-request')).toHaveCount(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('first mutual acceptance locks one pair and releases competitors', async ({ browser }) => {
  const context = await browser.newContext();
  const requester = await context.newPage();
  const accepter = await context.newPage();
  const records = [
    record('avery', 'Avery Able', 'blake'),
    record('casey', 'Casey Cole', 'blake'),
    record('blake', 'Blake Baker'),
  ];

  await seed(requester, records, 'avery');
  await requester.locator('[data-tryout-edit]').click();
  await requester.locator('#tourney-tryout-continue').click();
  await requester.locator('#tourney-tryout-continue').click();

  await seed(accepter, records, 'blake');
  await accepter.locator('#tourney-tryout-continue').click();
  await accepter.locator('[data-partner="avery"]').click();
  await accepter.locator('#tourney-tryout-continue').click();
  await accepter.locator('#tourney-tryout-continue').click();

  await requester.locator('#tourney-tryout-continue').click();
  await expect(requester.locator('#tourney-tryout-error')).toContainText('locked while you were editing');

  const saved = await requester.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  const byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.blake.partnerId).toBe('avery');
  expect(byId.avery.partnerId).toBe('blake');
  expect(byId.casey.partnerId).toBeNull();
  expect(byId.casey.releasedReason).toBe('partner-locked');

  await context.close();
});

test('does not expose unrelated public pairing relationships on the board', async ({ page }) => {
  const records = [
    record('private-a', 'Private Alpha', 'private-b'),
    record('private-b', 'Private Beta', 'private-a'),
    record('private-c', 'Private Casey', 'private-d'),
    record('private-d', 'Private Delta'),
  ];
  await seed(page, records);
  await page.locator('#tourney-tryout-continue').click();

  await expect(page.locator('.tourney-tryout-board-grid')).not.toContainText('Private');
  await expect(page.locator('.tourney-tryout-roster-list')).toContainText('Private C.');
});