import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: BASE, trace: 'off', acceptDownloads: true },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run preview -w site', url: BASE, reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
