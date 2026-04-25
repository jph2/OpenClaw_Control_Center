import { defineConfig, devices } from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts/test-results',
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: './artifacts/html-report', open: 'never' }]
  ],
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
