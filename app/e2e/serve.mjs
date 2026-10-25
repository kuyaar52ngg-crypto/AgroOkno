// Сборка веб-версии с демо-данными (EXPO_PUBLIC_DATA_MODE=mock) и раздача статики для Playwright.
// Прод-база не используется: в этой сборке слой данных — ./mock (состояние в памяти), а адреса Supabase/API указывают в никуда.
// E2E_SKIP_BUILD=1 — не пересобирать (если e2e/.dist уже собран).
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'e2e', '.dist');
const port = Number(process.env.E2E_PORT ?? 8081);

if (process.env.E2E_SKIP_BUILD !== '1') {
  console.log('[e2e] сборка веб-версии в режиме mock…');
  const result = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', dist], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      EXPO_PUBLIC_DATA_MODE: 'mock',
      // Заглушки: даже если бы настоящий клиент оказался в бандле, он не достучался бы до прод-базы.
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_placeholder',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:9',
      EXPO_PUBLIC_SENTRY_DSN: '',
      EXPO_PUBLIC_DEMO_DATE: '',
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('[e2e] нет e2e/.dist/index.html — соберите без E2E_SKIP_BUILD');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(dist, path.normalize(url));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  // SPA: неизвестные пути отдают index.html (expo-router разбирает адрес в браузере).
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`[e2e] http://127.0.0.1:${port}`));
