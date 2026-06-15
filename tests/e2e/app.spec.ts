import { test, expect, type Page } from '@playwright/test';

// Smoke tests over the real production build: the core flows a user relies on.
// Each starts fresh and dismisses the one-time storage notice (it overlays the
// player and would otherwise intercept taps).

/** Dismiss the storage notice only if it's actually showing (it doesn't return
 *  after the first acknowledgement), without blocking on a missing button. */
async function dismissNotice(page: Page) {
  const btn = page.getByRole('button', { name: 'Got it' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await dismissNotice(page);
  await expect(page.locator('.sounds-grid .sound-card').first()).toBeVisible();
});

test('the library renders its sounds', async ({ page }) => {
  expect(await page.locator('.sound-card').count()).toBeGreaterThan(10);
  await expect(page.locator('.scene-card').first()).toBeVisible();
});

test('a scene starts and the mini player appears', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await expect(page.locator('.mini-player')).toBeVisible();
});

test('the now-playing sheet opens and master volume can change', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await expect(page.locator('.sheet')).toBeVisible();
  const master = page.locator('.sheet-master .drift-slider');
  await master.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sheet-master .sheet-value')).toBeVisible();
});

test('a sleep timer can be set', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await page.locator('.timer-btn', { hasText: /^1h$/ }).click();
  await expect(page.locator('.sheet-value.warm')).toBeVisible();
});

test('clear all stops the mix', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await page.locator('.sheet-clear').click();
  await expect(page.locator('.mini-player')).toBeHidden();
});

test('a custom mix saves and survives a reload', async ({ page }) => {
  await page.locator('.sound-card[data-cat="Water"]').first().locator('.sound-card-toggle').click();
  await page.locator('.mp-body').click();
  await page.locator('.sheet-action.warm').click();
  await page.locator('.preset-input').fill('e2e mix');
  await page.locator('.preset-save-btn').click();
  await expect(page.locator('.mix-card', { hasText: 'e2e mix' })).toBeVisible();

  await page.reload();
  await dismissNotice(page);
  await expect(page.locator('.mix-card', { hasText: 'e2e mix' })).toBeVisible();
});

test('the privacy page is reachable', async ({ page }) => {
  const link = page.locator('.footer-privacy');
  await expect(link).toHaveAttribute('href', /privacy\.html$/);
});

test('the shell loads offline after the first visit', async ({ page, context }) => {
  // Let the service worker take control, then cut the network and reload.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 10_000 }).catch(() => {});
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.sounds-grid')).toBeVisible();
  await context.setOffline(false);
});
