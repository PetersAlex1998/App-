import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1, // ein Build, ein Server: Tests laufen nacheinander
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8199',
    viewport: { width: 390, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/serve.mjs dist-e2e 8199',
    url: 'http://localhost:8199/',
    reuseExistingServer: !process.env.CI,
  },
});
