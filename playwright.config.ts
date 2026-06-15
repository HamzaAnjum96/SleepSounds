import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const BASE = `http://localhost:${PORT}/SleepSounds/`;

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
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
