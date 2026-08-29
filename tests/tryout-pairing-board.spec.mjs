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

async function openBoard(page, name = 'Jordan Student', grade = '8') {
  await page.locator('#tourney-tryout-name').fill(name);
  await page.locator('#tourney-tryout-grade').selectOption(grade);
  await page.locator('#tourney-tryout-show-board').click();
}

test('opens one board from the details gate and supports drag and tap placement', async ({ page }) => {
  await seed(page, []);
  await page.evaluate(({ storageKey, activeKey }) => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(activeKey);
  }, { storageKey, activeKey });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#tourney-tryout-workspace')).toBeHidden();
  await expect(page.locator('#tourney-tryout-grade option')).toHaveCount(3);
  await openBoard(page);
  await expect(page.locator('#tourney-tryout-workspace')).toBeVisible();
  await expect(page.locator('#tourney-tryout-gate')).toBeHidden();

  await page.locator('[data-partner="demo-sam"]').dragTo(page.locator('[data-drop-slot]').first());
  await expect(page.locator('[data-partner="demo-sam"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tourney-tryout-board-row.is-your-request')).toHaveCount(1);

  await page.locator('[data-board-row="5"] [data-drop-slot]').first().click();
  await expect(page.locator('[data-board-row="5"].is-your-request')).toHaveCount(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('first mutual acceptance pairs students and releases competitors', async ({ page }) => {
  const records = [
    record('avery', 'Avery Able', 'blake'),
    record('casey', 'Casey Cole', 'blake'),
    record('blake', 'Blake Baker'),
  ];

  await seed(page, records, 'blake');
  await page.locator('[data-partner="avery"]').click();
  await page.locator('#tourney-tryout-submit').click();
  await expect(page.locator('#tourney-tryout-student-status')).toContainText('You are paired');

  const saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  const byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.blake.partnerId).toBe('avery');
  expect(byId.avery.partnerId).toBe('blake');
  expect(byId.casey.partnerId).toBeNull();
  expect(byId.casey.releasedReason).toBe('partner-locked');
});

test('a pending request can add a student already shown in another pending row', async ({ page }) => {
  const records = [
    record('sam', 'Sam Kim', 'olivia'),
    record('olivia', 'Olivia Brooks'),
  ];
  records[0].dates = ['sep23'];
  records[0].selectedDate = 'sep23';
  records[1].dates = ['sep23'];
  records[1].selectedDate = 'sep23';

  await seed(page, records);
  await page.locator('[data-date="sep23"]').click();
  await openBoard(page);
  await page.locator('[data-partner="olivia"]').click();
  await expect(page.locator('.tourney-tryout-board-row.is-your-request')).toHaveCount(1);
  await page.locator('#tourney-tryout-submit').click();
  await expect(page.locator('.tourney-tryout-board-row.is-pending')).toContainText('Olivia B.');
});

test('either student can release a mutual pairing and choose again', async ({ page }) => {
  const records = [
    record('avery', 'Avery Able', 'blake'),
    record('blake', 'Blake Baker', 'avery'),
  ];
  await seed(page, records, 'avery');

  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-tryout-edit]').click();
  await expect(page.locator('#tourney-tryout-gate')).toBeVisible();
  await expect(page.locator('[data-partner="blake"]')).toBeVisible();

  let saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  let byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.avery.partnerId).toBeNull();
  expect(byId.blake.partnerId).toBeNull();

  await page.locator('[data-partner="blake"]').click();
  await page.locator('#tourney-tryout-submit').click();
  saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.avery.partnerId).toBe('blake');
});

test('withdrawal releases both sides of a mutual pairing', async ({ page }) => {
  const records = [
    record('avery', 'Avery Able', 'blake'),
    record('blake', 'Blake Baker', 'avery'),
  ];
  await seed(page, records, 'avery');

  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-tryout-withdraw]').click();
  const saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  const byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.avery.withdrawn).toBe(true);
  expect(byId.avery.partnerId).toBeNull();
  expect(byId.blake.partnerId).toBeNull();
  await expect(page.locator('#tourney-tryout-workspace')).toBeHidden();
});

test('changing a signup releases incoming pending requests', async ({ page }) => {
  const records = [
    record('avery', 'Avery Able'),
    record('casey', 'Casey Cole', 'avery'),
  ];
  await seed(page, records, 'avery');

  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-tryout-edit]').click();
  await expect.poll(async () => page.evaluate(storageKey => {
    const data = JSON.parse(localStorage.getItem(storageKey));
    return data.records.find(item => item.id === 'casey').partnerId;
  }, storageKey)).toBeNull();
});

test('a stale board cannot overwrite a newer mutual pairing', async ({ page }) => {
  const records = [
    record('avery', 'Avery Able', 'blake'),
    record('blake', 'Blake Baker'),
    record('casey', 'Casey Cole'),
  ];
  await seed(page, records, 'avery');
  await page.evaluate(storageKey => {
    const data = JSON.parse(localStorage.getItem(storageKey));
    const avery = data.records.find(item => item.id === 'avery');
    const casey = data.records.find(item => item.id === 'casey');
    avery.partnerId = 'casey';
    casey.partnerId = 'avery';
    avery.updatedAt = '2026-08-29T13:00:00.000Z';
    casey.updatedAt = '2026-08-29T13:00:00.000Z';
    data.revision += 1;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, storageKey);

  await page.locator('#tourney-tryout-submit').click();
  await expect(page.locator('#tourney-tryout-error')).toContainText('changed in another tab');
  const saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), storageKey);
  const byId = Object.fromEntries(saved.records.map(item => [item.id, item]));
  expect(byId.avery.partnerId).toBe('casey');
  expect(byId.casey.partnerId).toBe('avery');
});

test('hides unrelated relationships and sixth-grade legacy records', async ({ page }) => {
  const records = [
    record('private-a', 'Private Alpha', 'private-b'),
    record('private-b', 'Private Beta', 'private-a'),
    record('private-c', 'Private Casey', 'private-d'),
    record('private-d', 'Private Delta'),
    { ...record('sixth', 'Sixth Student'), grade: '6' },
  ];
  await seed(page, records);
  await openBoard(page);

  await expect(page.locator('.tourney-tryout-board-grid')).not.toContainText('Private');
  await expect(page.locator('.tourney-tryout-roster-list')).toContainText('Private C.');
  await expect(page.locator('.tourney-tryout-roster-list')).not.toContainText('Sixth');
});