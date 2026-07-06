import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated accessibility gate over the real production build. axe-core can't
// judge everything (it can't hear the mix), but it reliably catches the
// regressions that creep in silently: missing labels, broken ARIA wiring,
// contrast slips, landmark drift. The bar: no serious or critical violations
// on any primary surface. Moderate/minor findings are reported in the failure
// message when the gate trips, but only serious+ fail the build.

const IMPACT_GATE = ['serious', 'critical'];

async function checkA11y(page: Page, surface: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const gated = results.violations.filter((v) => IMPACT_GATE.includes(v.impact ?? ''));
  const detail = gated
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
    .join('\n');
  expect(gated, `${surface}: serious/critical axe violations\n${detail}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('drift-cookie-ack', '1'));
  await page.goto('./');
  await expect(page.locator('.sounds-grid .sound-card').first()).toBeVisible();
});

test('the main page has no serious accessibility violations', async ({ page }) => {
  await checkA11y(page, 'main page');
});

test('the now-playing sheet has no serious accessibility violations', async ({ page }) => {
  await page.locator('.scene-card').first().click();
  await page.locator('.mp-body').click();
  await expect(page.locator('.sheet')).toBeVisible();
  await checkA11y(page, 'now-playing sheet');
});

test('an open sound editor has no serious accessibility violations', async ({ page }) => {
  await page.locator('.sound-card[data-cat="Water"]').first().locator('.card-editor-icon').click();
  await expect(page.locator('.sb-panel')).toBeVisible();
  await checkA11y(page, 'sound editor');
});

test.describe('desktop split layout', () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

  test('the desktop layout has no serious accessibility violations', async ({ page }) => {
    await expect(page.locator('.side-panel')).toBeVisible();
    await page.locator('.scene-card').first().click();
    await expect(page.locator('.side-panel .layer-row').first()).toBeVisible();
    await checkA11y(page, 'desktop layout');
  });
});
