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

// Guards the 0.0.17 wall-clock fix: the countdown must track real elapsed time,
// not the number of interval ticks fired. A sleep mixer runs screen-off, where
// the browser throttles (or suspends) background timers — clock.fastForward fires
// each timer at most once across the jump, exactly like a throttled tick, so a
// tick-counting timer would barely move while a wall-clock one keeps pace.
test('the sleep timer counts real wall-clock time, not interval ticks', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await dismissNotice(page);
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await page.locator('.timer-btn', { hasText: /^15m$/ }).click();
  await expect(page.locator('.sheet-value.warm')).toContainText('15:00');

  // Jump five minutes firing a single tick: tick-counting would read ~14:59;
  // wall-clock must read 10:00.
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(page.locator('.sheet-value.warm')).toContainText('10:00');

  // Past the 15-minute deadline the mix stops itself, even from sparse ticks.
  await page.clock.fastForward(11 * 60 * 1000);
  await expect(page.locator('.mini-player')).toBeHidden();
});

// Guards 0.0.22: a scene swap keeps a running timer, but stopping the mix clears
// it, so a fresh mix never inherits a stale countdown.
test('stopping the mix clears a running sleep timer', async ({ page }) => {
  await page.locator('.scene-card').nth(0).click();
  await page.locator('.mp-body').click();
  await page.locator('.timer-btn', { hasText: /^15m$/ }).click();
  await expect(page.locator('.sheet-value.warm')).toBeVisible();

  // Swapping scenes keeps the timer.
  await page.keyboard.press('Escape');
  await page.locator('.scene-card').nth(1).click();
  await page.locator('.mp-body').click();
  await expect(page.locator('.sheet-value.warm')).toBeVisible();

  // Stopping the mix clears it — a fresh scene starts with no timer.
  await page.locator('.sheet-clear').click();
  await expect(page.locator('.mini-player')).toBeHidden();
  await page.locator('.scene-card').nth(0).click();
  await page.locator('.mp-body').click();
  await expect(page.locator('.sheet-value.warm')).toBeHidden();
});

// Guards 0.0.26: an unknown ?scene= id (a retired scene or a typo) falls through
// to the resumed last-session mix instead of stranding on a blank app.
test('a stale scene deep link falls through to resume', async ({ page }) => {
  // Establish a last-session, then let the debounced save land.
  await page.locator('.scene-card', { hasText: 'Fireside' }).click();
  await expect(page.locator('.mini-player')).toBeVisible();
  await page.waitForTimeout(700);

  // Unknown id → URL cleaned, and last night's mix comes back (not a blank app).
  await page.goto('./?scene=nonexistent-xyz');
  await dismissNotice(page);
  await expect(page.locator('.mini-player')).toBeVisible();
  expect(page.url()).not.toContain('scene=');

  // A valid id still plays its scene.
  await page.goto('./?scene=builtin-rainfall');
  await dismissNotice(page);
  await expect(page.locator('.mini-player')).toBeVisible();
});

// [0.1.0] Hold-to-arrange: a long-press lifts a card, dragging drops it in a
// new slot, and the arrangement persists. The keyboard path lives on each
// card's grip button.
test('a sound card can be dragged to a new position, and it persists', async ({ page }) => {
  const names = () => page.locator('.sounds-grid .card-name').allInnerTexts();
  const before = await names();
  expect(before[0]).toBe('Rain');

  // Long-press the first card (Rain), then drag onto the second (Fire).
  const rain = page.locator('.sounds-grid [data-sound-id="rain"]');
  const fire = page.locator('.sounds-grid [data-sound-id="fire"]');
  const from = (await rain.boundingBox())!;
  const to = (await fire.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450); // past the 350 ms lift threshold
  // Steps matter: the hook tracks pointermove.
  await page.mouse.move(to.x + to.width * 0.75, to.y + to.height / 2, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400); // landing glide + settle

  const after = await names();
  expect(after[0]).toBe('Fire');
  expect(after[1]).toBe('Rain');
  // The lift-then-drop must not have toggled the sound on.
  await expect(page.locator('[data-sound-id="rain"]')).not.toHaveClass(/active/);

  // The arrangement survives a reload.
  await page.reload();
  await dismissNotice(page);
  const reloaded = await names();
  expect(reloaded[0]).toBe('Fire');
  expect(reloaded[1]).toBe('Rain');
});

test('a sound card can be reordered with the keyboard grip', async ({ page }) => {
  const names = () => page.locator('.sounds-grid .card-name').allInnerTexts();
  expect((await names())[0]).toBe('Rain');
  await page.locator('[data-sound-id="rain"] .card-grip').focus();
  await page.keyboard.press('ArrowRight');
  expect((await names()).slice(0, 2)).toEqual(['Fire', 'Rain']);
  await page.keyboard.press('End');
  const atEnd = await names();
  expect(atEnd[atEnd.length - 1]).toBe('Rain');
  await page.keyboard.press('Home');
  expect((await names())[0]).toBe('Rain');
});

// Guards the tuning-persistence arc (0.0.15 / 0.0.16 / 0.0.20): the last-session
// writer must keep each layer's tuning, so a resumed mix comes back with the
// character it was playing rather than reverting tuned layers to defaults.
test('a resumed session keeps each layer\'s tuning', async ({ page }) => {
  // Fan & Rain shapes the rain layer (the scene's quieter "at a window" bed).
  await page.locator('.scene-card', { hasText: 'Fan & Rain' }).click();
  await expect(page.locator('.mini-player')).toBeVisible();
  await page.waitForTimeout(700); // let the debounced save land
  const rain = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drift-last-session') || 'null');
    return s?.state?.rain ?? null;
  });
  expect(rain?.tuning).toBeTruthy();
  expect(Object.keys(rain.tuning).length).toBeGreaterThan(0);
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

test('deleting a saved mix can be undone', async ({ page }) => {
  await page.locator('.sound-card[data-cat="Water"]').first().locator('.sound-card-toggle').click();
  await page.locator('.mp-save').click();
  await page.locator('.preset-input').fill('undo me');
  await page.locator('.preset-save-btn').click();
  // Close the sheet so it no longer overlays the saved-mix card.
  await page.locator('.sheet-close').click();
  await expect(page.locator('.sheet')).toBeHidden();
  const card = page.locator('.mix-card', { hasText: 'undo me' });
  await expect(card).toBeVisible();
  await card.locator('.mix-del').click();
  await expect(card).toHaveCount(0);
  await page.locator('.toast-action', { hasText: 'undo' }).click();
  await expect(page.locator('.mix-card', { hasText: 'undo me' })).toBeVisible();
});

test('audio flows through the shared master bus', async ({ page }) => {
  // Toggle a WAV sound (Fan, Air) and confirm signal reaches the master output —
  // guards the unified graph (worklets + MediaElementSource-routed WAV) against
  // a silent-wiring regression.
  await page.locator('.sound-card[data-cat="Air"]').first().locator('.sound-card-toggle').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __driftMasterPeak?: () => number }).__driftMasterPeak?.() ?? 0), { timeout: 6000 })
    .toBeGreaterThan(0.01);
});

// The per-layer M (mute) / S (solo) toggles are hidden behind the
// `layerMuteSolo` feature flag (off for now); the mixer logic stays wired up.
// Re-enable this test when the flag is flipped back on.
test.skip('muting a layer silences the mix, and unmuting restores it', async ({ page }) => {
  const peak = () => page.evaluate(() => (window as unknown as { __driftMasterPeak?: () => number }).__driftMasterPeak?.() ?? 0);
  await page.locator('.sound-card[data-cat="Air"]').first().locator('.sound-card-toggle').click();
  await page.locator('.mp-body').click();
  // The M (mute) toggle is the first layer toggle in the row; wait for the sheet
  // to settle so the click lands on the settled control.
  const mute = page.locator('.layer-row .layer-toggle').first();
  await expect(mute).toBeVisible();
  await expect.poll(peak, { timeout: 6000 }).toBeGreaterThan(0.01);
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(peak, { timeout: 4000 }).toBeLessThan(0.01);
  await mute.click();
  await expect.poll(peak, { timeout: 4000 }).toBeGreaterThan(0.01);
});

test('sleep-safe is on by default and can be toggled', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  const toggle = page.locator('.sleep-safe');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
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
