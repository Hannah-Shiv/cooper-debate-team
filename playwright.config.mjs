import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  outputDir: './test-results/tablet',
  snapshotPathTemplate: '{testDir}/tablet-baselines/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 5000 --bind 127.0.0.1',
    url: 'http://127.0.0.1:5000/index.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});