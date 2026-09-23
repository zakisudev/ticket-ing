import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium = '/snap/bin/chromium';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: existsSync(systemChromium)
      ? { executablePath: systemChromium, args: ['--no-sandbox'] }
      : undefined,
  },
  webServer: {
    command: 'npm run dev -w apps/web -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
