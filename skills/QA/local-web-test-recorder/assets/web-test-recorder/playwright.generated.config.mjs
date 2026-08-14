import { defineConfig } from 'playwright/test';

const directEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/^(?:HTTP|HTTPS|ALL)_PROXY$/i.test(key)));

export default defineConfig({
  testDir: './test-suites',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: Number(process.env.WTR_TEST_TIMEOUT || 120000),
  expect: { timeout: Number(process.env.WTR_EXPECT_TIMEOUT || 30000) },
  reporter: 'line',
  outputDir: process.env.WTR_OUTPUT_DIR || './test-results/generated',
  use: {
    browserName: process.env.WTR_BROWSER || 'chromium',
    headless: process.env.WTR_HEADLESS !== 'false',
    launchOptions: { env: directEnvironment },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
