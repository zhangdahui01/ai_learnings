import { defineConfig, devices } from '@playwright/test';

// Cases for the 云灯岛 3D game. Same BDD layer as the other suites (support/bdd.ts): specs/<id>.md is the
// source, tests-island/<id>.spec.ts is its implementation. The game draws with WebGL, so unlike the Quiet
// Hall suite 3D stays on (software GL); the page is opened with ?test=1, which keeps every rule but draws
// less grass and skips shadows and bloom so a machine without a GPU keeps a usable frame rate.
const web = Number(process.env.ISLAND_WEB_PORT || 8791);
export default defineConfig({
  testDir: './tests-island',
  fullyParallel: false,
  workers: 1,
  retries: Number(process.env.RETRIES || 0),
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  use: {
    baseURL: process.env.ISLAND_BASE_URL || `http://127.0.0.1:${web}`,
    actionTimeout: 15_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'mobile-chromium' }],
  webServer: process.env.ISLAND_BASE_URL ? undefined : [
    { command: `node sut/serve-static.mjs ${process.env.ISLAND_DIR || '../../../yundeng-island/app'} ${web}`, port: web, reuseExistingServer: true },
  ],
});
