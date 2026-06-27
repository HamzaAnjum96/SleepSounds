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
  // The storage notice now waits for the first playback, then can overlay the
  // player. Pre-acknowledge it so it never intercepts taps in the functional
  // smoke tests; its timing has its own dedicated test below.
  await page.addInitScript(() => localStorage.setItem('drift-cookie-ack', '1'));
  await page.goto('./');
  await dismissNotice(page);
  await expect(page.locator('.sounds-grid .sound-card').first()).toBeVisible();
});

test('the storage notice waits for the first sound, then shows once', async ({ page }) => {
  // A fresh visit with no prior acknowledgement: nothing on first load.
  await page.addInitScript(() => localStorage.removeItem('drift-cookie-ack'));
  await page.goto('./');
  await expect(page.locator('.sounds-grid .sound-card').first()).toBeVisible();
  await expect(page.locator('.cookie-notice')).toBeHidden();
  // It appears only after the first sound plays.
  await page.locator('.scene-card').first().click();
  await expect(page.locator('.cookie-notice')).toBeVisible();
  // Acknowledged once, it stays gone across reloads.
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.cookie-notice')).toBeHidden();
  await page.reload();
  await expect(page.locator('.cookie-notice')).toBeHidden();
});

test('the library renders its sounds', async ({ page }) => {
  expect(await page.locator('.sound-card').count()).toBeGreaterThan(10);
  await expect(page.locator('.scene-card').first()).toBeVisible();
});

test('a scene starts, the mini player appears, and media metadata is set', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await expect(page.locator('.mini-player')).toBeVisible();
  // The platform bridge should have populated the OS media-session metadata.
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession?.metadata?.title ?? ''))
    .not.toBe('');
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

test('the sound editor leads with variant chips, sliders behind fine-tune', async ({ page }) => {
  // Open rain's editor from its library card.
  const rain = page.locator('.sound-card[data-cat="Water"]').first();
  await rain.locator('.card-editor-icon').click();
  const panel = page.locator('.sb-panel');
  await expect(panel).toBeVisible();

  // Chips are the primary surface; sliders are hidden until fine-tune.
  await expect(panel.locator('.sb-variant').first()).toBeVisible();
  await expect(panel.locator('.drift-slider')).toHaveCount(0);

  // Picking a non-default variant selects it.
  const downpour = panel.locator('.sb-variant', { hasText: 'Downpour' });
  await downpour.click();
  await expect(downpour).toHaveAttribute('aria-pressed', 'true');

  // Fine-tune reveals the sliders.
  await panel.locator('.sb-finetune').click();
  await expect(panel.locator('.drift-slider').first()).toBeVisible();
});

test('a sleep timer can be set', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await page.locator('.timer-btn', { hasText: /^1h$/ }).click();
  await expect(page.locator('.sheet-value.warm')).toBeVisible();
});

test('stop mix stops the mix, and undo brings it back', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await page.locator('.sheet-clear').click();
  await expect(page.locator('.mini-player')).toBeHidden();
  // A forgiving snackbar offers undo, which restores the mix playing.
  await page.locator('.toast-action', { hasText: 'undo' }).click();
  await expect(page.locator('.mini-player')).toBeVisible();
});

test('save from the mini player opens the save field', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-save').click();
  await expect(page.locator('.preset-input')).toBeVisible();
  await page.locator('.preset-input').fill('player save');
  await page.locator('.preset-save-btn').click();
  await expect(page.locator('.mix-card', { hasText: 'player save' })).toBeVisible();
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

test.describe('desktop split layout', () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

  test('a side panel controls the mix in place, with no mini player', async ({ page }) => {
    await expect(page.locator('.side-panel')).toBeVisible();
    await expect(page.locator('.mini-player')).toHaveCount(0);
    // Playing fills the panel with the mix controls (no slide-up sheet).
    await page.locator('.scene-card').first().click();
    await expect(page.locator('.side-panel .layer-row').first()).toBeVisible();
    await expect(page.locator('.side-panel .sheet-master')).toBeVisible();
    await expect(page.locator('.sheet-root')).toHaveCount(0);
  });
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
