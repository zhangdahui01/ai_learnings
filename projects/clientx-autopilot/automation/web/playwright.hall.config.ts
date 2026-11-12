import { defineConfig, devices } from '@playwright/test';

// Web cases for the Quiet Hall sample app (projects/quiet-hall). Starts the hall server and the
// exported web build; build it once with `npm run hall:build`.
const HALL = '../../../quiet-hall';
const api = Number(process.env.HALL_API_PORT || 8787);
const web = Number(process.env.HALL_WEB_PORT || 8790);

export default defineConfig({
  testDir: './tests-hall',
  // The hall is a 3D scene; rendering it in software is heavy, so cases run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: Number(process.env.RETRIES || 0),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: process.env.HALL_BASE_URL || `http://127.0.0.1:${web}`,
    actionTimeout: 10_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  projects: [{ name: 'mobile-chromium' }],
  webServer: process.env.HALL_BASE_URL ? undefined : [
    { command: `node ${HALL}/server/server.mjs --port ${api} --residents 12 --data test-results/hall-data.json`, port: api, reuseExistingServer: true },
    { command: `node ${HALL}/server/static.mjs ${HALL}/app/dist ${web}`, port: web, reuseExistingServer: true },
  ],
});
