import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';

const PORT = 4321;
const BASE = `http://localhost:${PORT}/SleepSounds/`;

// Some managed environments pre-install a Chromium whose build number doesn't
// match the one this @playwright/test version would download (and downloads are
// blocked). When the pinned browser is absent but a local one exists, point at
// it so e2e still runs. On CI the dir doesn't exist, so Playwright's own managed
// browser is used as normal — this only activates as a fallback.
function localChromium(): string | undefined {
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const bin = `${root}/${dir}/chrome-linux/chrome`;
    if (existsSync(bin)) return bin;
  }
  return undefined;
}
const CHROME = localChromium();

// Browser smoke tests. Run with `npm run test:e2e`. The webServer builds the
// app and serves the production output (so the service worker / offline path is
// exercised), reusing an already-running preview locally.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    ...devices['Pixel 5'],
    ignoreHTTPSErrors: true,
    ...(CHROME ? { launchOptions: { executablePath: CHROME } } : {}),
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
