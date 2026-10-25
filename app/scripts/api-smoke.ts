// Интеграционная проверка серверных функций на живом проекте Supabase (демо-аккаунты).
// Запуск из каталога app: npx tsx scripts/api-smoke.ts   (нужен .env.local с URL и publishable key)
// Отправка отчёта создаёт квитанцию в пустом аккаунте 143500111222, поэтому по умолчанию не выполняется:
//   SMOKE_SUBMIT=1 npx tsx scripts/api-smoke.ts
// Проверка «Хорриота» (нужна применённая миграция v3): SMOKE_HORRIOT=1 npx tsx scripts/api-smoke.ts —
// без подключения демо-режима обработчик отвечает 409; PDF выписки (vypiska.pdf) содержит раздел «Хорриот».
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const OUT = path.join(process.env.TEMP ?? '.', 'agrookno-smoke');
mkdirSync(OUT, { recursive: true });

async function login(inn: string, password = 'AgroOkno2026!') {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${inn}@agrookno.app`, password }),
  });
  const j = (await r.json()) as { access_token: string; user: { id: string } };
  const farms = await fetch(`${URL_}/rest/v1/farms?select=id,name&deleted_at=is.null`, {
    headers: { apikey: KEY, Authorization: `Bearer ${j.access_token}` },
  });
  const [farm] = (await farms.json()) as { id: string; name: string }[];
  return { token: j.access_token, farmId: farm.id, farmName: farm.name };
}

async function save(res: Response, name: string) {
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path.join(OUT, name), buf);
  console.log(res.status, name, `${buf.length} байт`, res.headers.get('content-type'));
  if (res.status !== 200) console.log(buf.toString('utf8').slice(0, 300));
}

const req = (url: string, token: string, init?: RequestInit) =>
  new Request(`http://localhost${url}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

async function main() {
  const lph = await login('143512345660');
  const kfh = await login('143500987654');
  const trial = await login('143500111222'); // пустой аккаунт — для проверки отправки

  const { GET: extract } = await import('../api/household/extract');
  await save(await extract(req(`/api/household/extract?farm_id=${lph.farmId}`, lph.token)), 'vypiska.pdf');

  const { GET: receipt } = await import('../api/receipts/[no]');
  await save(await receipt(req(`/api/receipts/${encodeURIComponent('УЧ-10СХ-2026-015')}`, lph.token)), 'receipt.pdf');
  await save(await receipt(req(`/api/receipts/${encodeURIComponent('УЧ-10СХ-2026-015')}`, kfh.token)), 'receipt-foreign.pdf'); // ожидаем 404

  const forms: [string, string][] = [
    ['3-fermer', 'year=2025'],
    ['3-fermer-month', 'year=2026&month=9'],
    ['1-fermer', 'year=2025'],
    ['2-fermer', 'year=2025'],
    ['1-kfh', 'year=2025'],
    ['1-ip', 'year=2025'],
  ];
  for (const [form, q] of forms) {
    const mod = (await import(`../api/reports/${form}`)) as { GET: (r: Request) => Promise<Response> };
    await save(await mod.GET(req(`/api/reports/${form}?farm_id=${kfh.farmId}&${q}`, kfh.token)), `${form}.xlsx`);
  }
  const { GET: fermer3 } = await import('../api/reports/3-fermer');
  await save(await fermer3(req(`/api/reports/3-fermer?farm_id=${lph.farmId}&year=2026`, kfh.token)), 'foreign.xlsx'); // чужое хозяйство → 404

  if (process.env.SMOKE_HORRIOT) {
    const { POST: horriotSync } = await import('../api/horriot/sync');
    const res = await horriotSync(req('/api/horriot/sync', lph.token, { method: 'POST', body: JSON.stringify({ farm_id: lph.farmId }) }));
    console.log('horriot/sync', res.status, await res.text());
  }

  if (process.env.SMOKE_SUBMIT) {
    const { POST: submit } = await import('../api/reports/submit');
    const res = await submit(
      req('/api/reports/submit', trial.token, { method: 'POST', body: JSON.stringify({ farm_id: trial.farmId, form: '1-tabun', year: 2026, month: 10 }) }),
    );
    console.log('submit', res.status, await res.text());
  }
  console.log('Файлы:', OUT);
}

void main();
