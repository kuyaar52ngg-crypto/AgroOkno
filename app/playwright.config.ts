import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

// E2E против веб-сборки с демо-слоем данных (EXPO_PUBLIC_DATA_MODE=mock): прод-база не затрагивается.
// Запуск: npm run test:e2e  (сборка и раздача — e2e/serve.mjs; E2E_SKIP_BUILD=1 — без пересборки).
const PORT = Number(process.env.E2E_PORT ?? 8081);

// Браузер: chromium из `npx playwright install chromium`; если он не установлен — Google Chrome из системы (тоже chromium, headless).
// E2E_CHANNEL=chrome|msedge задаёт канал явно.
const channel = process.env.E2E_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : 'chrome');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Asia/Yakutsk',
    viewport: { width: 420, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 900 }, channel },
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
  },
});
