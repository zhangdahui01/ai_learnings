import { defineConfig, devices } from '@playwright/test';

// Cases for 首尔生活助手 (projects/seoul-life-app). Same BDD layer as the other suites (support/bdd.ts):
// specs/<id>.md is the source, tests-seoul/<id>.spec.ts is its implementation. The app is a production
// Next.js build pointed at a Supabase address that does not exist; pages/seoul.ts answers every Supabase
// and /api/scan request in memory, so no account, database or AI key is needed.
const web = Number(process.env.SEOUL_WEB_PORT || 8795);
const dir = process.env.SEOUL_DIR || '../../../seoul-life-app';
export default defineConfig({
  testDir: './tests-seoul',
  fullyParallel: false,
  workers: 1,
  retries: Number(process.env.RETRIES || 0),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: process.env.SEOUL_BASE_URL || `http://127.0.0.1:${web}`,
    actionTimeout: 10_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
    launchOptions: { executablePath: process.env.CHROME_PATH || undefined },
  },
  projects: [{ name: 'mobile-chromium' }],
  webServer: process.env.SEOUL_BASE_URL ? undefined : [
    {
      command: `npm run build && npx next start -H 127.0.0.1 -p ${web}`,
      cwd: dir,
      port: web,
      timeout: 240_000,
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.invalid',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
