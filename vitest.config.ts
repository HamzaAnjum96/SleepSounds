import { defineConfig } from 'vitest/config';

// Standalone config (not the app's vite.config) so unit tests run in a plain
// Node environment without the React/build plugins. Browser smoke tests live
// separately under tests/e2e and are not run here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
