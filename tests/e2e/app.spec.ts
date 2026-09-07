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

/** Bounding box rounded to whole pixels, for layout-stability assertions. */
function roundBox(b: { x: number; y: number; width: number; height: number }) {
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
}

/** Percentage of the lit pixels on screen that carry any colour at all. A
 *  grayscale filter leaves the DOM untouched, so the only honest way to check
 *  it is to look at what was actually painted. */
async function colouredPixelShare(page: Page): Promise<number> {
  const shot = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, coloured = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (mx > 24) { lit++; if (mx - mn > 18) coloured++; }
    }
    return lit ? (100 * coloured) / lit : 0;
  }, shot.toString('base64'));
}

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

// [0.1.23] Under RTL the grid paints right-to-left, but slots run in DOM order,
// and the drop geometry clusters column centres left-to-right — so without
// mirroring the column index every drop landed in the horizontally-opposite
// cell. Same gesture as the LTR test above, mirrored: drag Rain (which now
// paints at the right edge) onto Fire to its left, and it must still land in
// the second slot.
test('a card dropped in an RTL grid lands in the cell it covers', async ({ page }) => {
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  await page.waitForTimeout(200);

  const names = () => page.locator('.sounds-grid .card-name').allInnerTexts();
  expect((await names())[0]).toBe('Rain');

  const rain = page.locator('.sounds-grid [data-sound-id="rain"]');
  const fire = page.locator('.sounds-grid [data-sound-id="fire"]');
  const from = (await rain.boundingBox())!;
  const to = (await fire.boundingBox())!;
  // Sanity: RTL really is mirrored, so Fire paints to the LEFT of Rain.
  expect(to.x).toBeLessThan(from.x);

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(to.x + to.width * 0.25, to.y + to.height / 2, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await names();
  expect(after[0]).toBe('Fire');
  expect(after[1]).toBe('Rain');
  await expect(page.locator('[data-sound-id="rain"]')).not.toHaveClass(/active/);
});

// [0.1.2] The drop target is the cell the CARD visibly covers — probed by the
// card's visual centre with row-band-first geometry — not wherever the finger
// happens to be. Grabbing by a corner and hovering the bottom half of a cell
// were the two ways the old pointer-based, row-major targeting overshot
// right/down.
test('a corner-grabbed card drops onto the cell it visibly covers', async ({ page }) => {
  await page.waitForTimeout(1600);
  const fire = (await page.locator('[data-sound-id="fire"]').boundingBox())!;
  const fan = (await page.locator('[data-sound-id="fan"]').boundingBox())!;
  // Grab Fire by its top-right corner (a corner grab that keeps the pointer
  // inside the viewport on the small device profile)…
  const grab = { x: fire.x + fire.width - 12, y: fire.y + 12 };
  // …and put the card's visual centre on Fan's cell (next row, left column).
  const dx = (fan.x + fan.width / 2) - (fire.x + fire.width / 2);
  const dy = (fan.y + fan.height / 2) - (fire.y + fire.height / 2);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(grab.x + dx, grab.y + dy, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const names = await page.locator('.sounds-grid .card-name').allInnerTexts();
  // Fire claims exactly the covered cell: [Rain, Fan, Fire, …]
  expect(names.slice(0, 3)).toEqual(['Rain', 'Fan', 'Fire']);
});

// [0.1.3] Displaced cards must not slide into place after the finger lifts —
// they snap at release; only the dropped card glides. And a drag that starts
// with a sound editor open must measure the post-close layout, not wipe cards
// to coordinates from the stale one.
test('displaced cards do not keep moving after the drop', async ({ page }) => {
  await page.waitForTimeout(1600);
  const rain = (await page.locator('[data-sound-id="rain"]').boundingBox())!;
  const fan = (await page.locator('[data-sound-id="fan"]').boundingBox())!;
  await page.mouse.move(rain.x + rain.width / 2, rain.y + rain.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(fan.x + fan.width / 2, fan.y + fan.height / 2, { steps: 6 });
  await page.mouse.up(); // release immediately — the old wipe window
  await page.waitForTimeout(60);
  const early = (await page.locator('[data-sound-id="fire"]').boundingBox())!;
  await page.waitForTimeout(250);
  const late = (await page.locator('[data-sound-id="fire"]').boundingBox())!;
  expect(Math.abs(late.x - early.x), 'displaced card x drift after release').toBeLessThan(2);
  expect(Math.abs(late.y - early.y), 'displaced card y drift after release').toBeLessThan(2);
});

test('a drag that starts with an open editor uses the settled layout', async ({ page }) => {
  await page.waitForTimeout(1600);
  await page.locator('[data-sound-id="rain"] .card-editor-icon').click();
  await expect(page.locator('.sb-panel')).toBeVisible();
  const rain = (await page.locator('[data-sound-id="rain"]').boundingBox())!;
  await page.mouse.move(rain.x + rain.width / 2, rain.y + rain.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450); // lift closes the editor synchronously
  await expect(page.locator('.sb-panel')).toBeHidden();
  // Aim at where Fan sits in the settled (post-close) layout.
  const fan = (await page.locator('[data-sound-id="fan"]').boundingBox())!;
  await page.mouse.move(fan.x + fan.width / 2, fan.y + fan.height / 2, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const names = await page.locator('.sounds-grid .card-name').allInnerTexts();
  expect(names.slice(0, 3)).toEqual(['Fire', 'Fan', 'Rain']);
});

// [0.1.1] Dropping a card must not replay anyone's entrance reveal: a finished
// CSS animation restarts when React moves the node (and `backwards` fill makes
// it blink invisible for its stagger delay — "flashes as if new"). The reveal
// is frozen inline on animationend, so a drop leaves every card at full
// opacity.
test('dropping a dragged card does not flash cards back in', async ({ page }) => {
  await page.waitForTimeout(1600); // let the entrance reveal finish
  const rain = (await page.locator('[data-sound-id="rain"]').boundingBox())!;
  const ocean = (await page.locator('[data-sound-id="ocean"]').boundingBox())!;
  await page.mouse.move(rain.x + rain.width / 2, rain.y + rain.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(ocean.x + ocean.width / 2, ocean.y + ocean.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(320); // inside the window where a replayed reveal sits invisible
  const dimmed = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('.sounds-grid [data-sound-id]').forEach((el) => {
      if (getComputedStyle(el).opacity !== '1') out.push(el.dataset.soundId!);
    });
    return out;
  });
  expect(dimmed, 'cards mid-entrance-replay after drop').toEqual([]);
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

// [0.1.24] The wordmark is sized off viewport WIDTH (7vw), so turning a phone
// sideways grew it to its cap exactly when vertical space ran out: the header
// took 39% of an 844x390 screen, and at 740x360 the first scene card was cut
// off by the fold. Short viewports get a compressed header; assert the card
// that used to be cut off now fits, and that the header stays a modest slice.
// [0.1.25] Dev mode (five quick taps on the moon) drains the colour out of the
// app but must not move anything: same layout, same components, just no hue.
// Asserted on real pixels, since a grayscale filter is invisible to the DOM.
// [0.1.26] A layer the user deliberately switches on that fails to start used
// to flip itself back off with no explanation, while the live region said
// "stopped" — as if they had done it on purpose. Forcing the failure is the
// only honest way to test it: media-element playback is what the wav-backed
// sounds use, so rejecting play() is exactly the shape of a real failure.
// [0.1.27] Saving a mix is confirmed out loud, and the write was wrapped in a
// swallowing catch — so with storage refused (private browsing, exhausted
// quota) the app announced "saved mix X", showed it in the shelf, stored
// nothing, and the mix was gone on the next open with no warning ever given.
test('a mix that cannot be stored says so instead of confirming', async ({ page }) => {
  await page.evaluate(() => {
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(this: Storage, k: string, v: string) {
      if (k === 'sleep-mixer-presets-v2') {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return realSet.call(this, k, v);
    };
  });

  await page.locator('.scene-card').first().click();
  await page.locator('.mp-save').click();
  await page.locator('.preset-input').fill('Night One');
  await page.locator('.preset-save-btn').click();

  await expect(page.locator('.toast-text')).toHaveText(/couldn’t save “Night One”/);
  // and it must NOT claim the save succeeded
  await expect(page.locator('[role="status"]')).toHaveText(/could not be saved/);
  // the mix still works for this session rather than vanishing mid-use
  await expect(page.locator('.mix-name')).toHaveText('Night One');
});

test('a mix that stores cleanly confirms without a warning', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-save').click();
  await page.locator('.preset-input').fill('Night One');
  await page.locator('.preset-save-btn').click();

  await expect(page.locator('[role="status"]')).toHaveText(/saved mix Night One/);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.reload();
  await dismissNotice(page);
  await expect(page.locator('.mix-name')).toHaveText('Night One');
});

test('a sound that fails to start says so, and can be retried', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { __broken: boolean };
    const real = HTMLMediaElement.prototype.play;
    w.__broken = true;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      return w.__broken ? Promise.reject(new Error('forced failure')) : real.call(this);
    };
  });

  await page.locator('[data-sound-id="fan"] .sound-card-toggle').click();

  await expect(page.locator('.toast-text')).toHaveText(/couldn’t start Fan/);
  await expect(page.locator('[role="status"]')).toHaveText(/Fan could not start/);
  // The card does not pretend it is playing.
  await expect(page.locator('[data-sound-id="fan"]')).not.toHaveClass(/active/);

  // Once whatever broke is better, retry brings it in.
  await page.evaluate(() => { (window as unknown as { __broken: boolean }).__broken = false; });
  await page.locator('.toast-action').click();
  await expect(page.locator('[data-sound-id="fan"]')).toHaveClass(/active/);
  await expect(page.locator('.mini-player')).toBeVisible();
});

// A sound that starts normally must stay silent — no toast for the happy path.
test('starting a sound normally shows no error', async ({ page }) => {
  await page.locator('[data-sound-id="fan"] .sound-card-toggle').click();
  await expect(page.locator('[data-sound-id="fan"]')).toHaveClass(/active/);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('dev mode goes monochrome without moving anything', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await expect(page.locator('.mini-player')).toBeVisible();
  // The player rises in over 0.45s; measuring mid-animation reads its
  // transform, not its resting place, and leaves the baseline 6px out.
  await page.waitForTimeout(700);

  // Dev mode also reveals the held-back sounds, so the grid legitimately grows.
  // Measure the chrome around it instead: that must not shift at all.
  const header = page.locator('header');
  const player = page.locator('.mini-player');
  // Rounded: sub-pixel float noise between two boundingBox() calls is not a
  // layout change, and asserting on it would make this test flaky.
  const boxes = async () => ({
    header: roundBox((await header.boundingBox())!),
    player: roundBox((await player.boundingBox())!),
  });
  const before = await boxes();
  const colourBefore = await colouredPixelShare(page);
  expect(colourBefore, 'the app is colourful to begin with').toBeGreaterThan(5);

  const moon = page.locator('.moon');
  for (let i = 0; i < 5; i++) { await moon.click({ force: true }); await page.waitForTimeout(80); }
  await expect(page.locator('html')).toHaveClass(/dev-mono/);
  await page.waitForTimeout(700); // the 0.5s cross-fade

  expect(await colouredPixelShare(page), 'no colour left in dev mode').toBeLessThan(0.5);
  expect(await boxes(), 'monochrome must not move anything').toEqual(before);

  // ...and it is a toggle, not a one-way door.
  for (let i = 0; i < 5; i++) { await moon.click({ force: true }); await page.waitForTimeout(80); }
  await expect(page.locator('html')).not.toHaveClass(/dev-mono/);
  await page.waitForTimeout(700);
  expect(await colouredPixelShare(page), 'colour returns when toggled off').toBeGreaterThan(5);
});

test.describe('short viewport (landscape phone)', () => {
  test.use({ viewport: { width: 740, height: 360 } });

  test('the header yields and the first scene card is not cut off', async ({ page }) => {
    const header = page.locator('header');
    const card = page.locator('.scene-card').first();
    const h = (await header.boundingBox())!;
    const c = (await card.boundingBox())!;

    expect(h.height, 'header should not dominate a short viewport').toBeLessThan(360 * 0.3);
    expect(c.y + c.height, 'first scene card must fit above the fold').toBeLessThanOrEqual(360);
  });
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
