// Runtime sound sweep: drives the real app in a headless browser, toggles
// every library sound on, and asserts signal actually reaches the master bus
// (via the __driftMasterPeak test hook). This is the check that unit tests
// can't do — it exercises worklet loading, WAV generation, the media-element
// routing, and the mixer's fades end-to-end. It caught live Birdsong being
// buried ~20 dB by its own output smoother (fixed in 9.1.1) after the bug had
// shipped unheard for months.
//
// Usage: with a dev server running (npm run dev):
//   node scripts/sweep-sounds.mjs [base-url]
//
// Event-driven sounds aren't continuous, so each sound gets a listen window
// sized to its nature; Thunder deliberately holds its first strike back
// 9–21 s, so it gets the longest.
import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:5173/';

// Per-sound listen windows (ms). Default suits continuous beds; sparse
// event sounds need longer.
const WINDOWS = { Thunder: 30000, Birdsong: 20000, 'Wind Chimes': 15000 };
const DEFAULT_WINDOW = 9000;

function localChromium() {
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const bin = `${root}/${dir}/chrome-linux/chrome`;
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: localChromium() });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const gotIt = page.getByRole('button', { name: /got it/i });
if (await gotIt.isVisible().catch(() => false)) await gotIt.click();

const peak = () => page.evaluate(() => window.__driftMasterPeak?.() ?? 0);
const cards = page.locator('.sound-card');
const count = await cards.count();
console.log(`sweeping ${count} sounds…`);

let fails = 0;
for (let i = 0; i < count; i++) {
  const card = cards.nth(i);
  const name = (await card.locator('.sound-name, [class*=name]').first().textContent().catch(() => `#${i}`))?.trim() ?? `#${i}`;
  await card.scrollIntoViewIfNeeded();
  await card.locator('.sound-card-toggle').click();
  const windowMs = WINDOWS[name] ?? DEFAULT_WINDOW;
  let p = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < windowMs) {
    await page.waitForTimeout(250);
    p = await peak();
    if (p > 0.01) break;
  }
  const ok = p > 0.01;
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(16)} peak=${p.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  await card.locator('.sound-card-toggle').click();
  const t1 = Date.now();
  while (Date.now() - t1 < 6000) {
    await page.waitForTimeout(250);
    if ((await peak()) < 0.005) break;
  }
}

console.log(`\n${count - fails}/${count} sounds audible; console errors: ${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none'}`);
await browser.close();
process.exit(fails > 0 || errors.length > 0 ? 1 : 0);
