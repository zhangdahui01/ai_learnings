import { defineConfig, devices } from '@playwright/test';

// BASE_URL points at the staging environment in CI. Without it the bundled demo shop is served
// locally, so the framework can be exercised end to end on a laptop.
const local = !process.env.BASE_URL;
const port = Number(process.env.SUT_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No blanket retries: a retry hides flakiness. The daily run may opt in; a gate run never does.
  retries: Number(process.env.RETRIES || 0),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${port}`,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: process.env.LOCALE || 'en-US',
    proxy: process.env.PROXY_SERVER ? { server: process.env.PROXY_SERVER } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: local ? { command: `node sut/serve.mjs ${port}`, port, reuseExistingServer: true } : undefined,
});
