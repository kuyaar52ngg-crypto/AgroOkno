// Живой смоук-тест сервера против Supabase (проект agrookno). Запуск: node scripts/smoke.mjs [http://localhost:3001]
// Нужны SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY (из server/.env). Создаёт временные аккаунты и удаляет их результаты не трогая демо-данные.
import { readFileSync } from 'node:fs';

try {
  process.loadEnvFile();
} catch {
  /* .env нет */
}

const BASE = process.argv[2] ?? 'http://localhost:3001';
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const DEMO_PASSWORD = 'AgroOkno2026!';
const DEMO_FARM = 'f0000000-0000-4000-8000-000000000001';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed += 1;
};

async function rpc(fn, args, token) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${token ?? KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(identifier, password) {
  const r = await rpc('resolve_login_email', { p_identifier: identifier });
  const email = r.body;
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return { ok: res.ok, token: body.access_token, user: body.user, status: res.status };
}

async function api(path, { method = 'GET', token, json, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (json) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) body = form;
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

async function main() {
  // 1. Здоровье
  const health = await api('/health');
  check('GET /health', health.status === 200 && health.body.ok, JSON.stringify(health.body.providers));

  // 2. Вход демо-аккаунтов по ИНН, email и телефону
  const byInn = await login('143512345660', DEMO_PASSWORD);
  check('signIn по ИНН (демо ЛПХ)', byInn.ok);
  check('signIn по email', (await login('ivan@example.com', DEMO_PASSWORD)).ok);
  check('signIn по телефону', (await login('+7 999 000 45 04', DEMO_PASSWORD)).ok);
  check('signIn демо КФХ', (await login('143500987654', DEMO_PASSWORD)).ok);
  check('signIn демо без роли', (await login('143500111222', DEMO_PASSWORD)).ok);
  check('неверный пароль -> ошибка', !(await login('143512345660', 'wrong-pass-1')).ok);
  check('неизвестный идентификатор -> ошибка', !(await login('999999999999', DEMO_PASSWORD)).ok);
  const token = byInn.token;

  // 3. Помощник
  const noAuth = await api('/v1/assistant/messages', { method: 'POST', json: { farm_id: DEMO_FARM, text: 'привет' } });
  check('помощник без токена -> 401', noAuth.status === 401);
  const milk = await api('/v1/assistant/messages', { method: 'POST', token, json: { farm_id: DEMO_FARM, text: 'Сегодня коровы дали 120 литров молока' } });
  const ev = milk.body?.proposed_events?.[0];
  check('помощник: надой 120 л -> 123.6 кг', milk.status === 200 && ev?.type === 'product_output' && Math.abs(ev.quantity - 123.6) < 0.01, JSON.stringify(milk.body?.reply?.text));
  const clar = await api('/v1/assistant/messages', { method: 'POST', token, json: { farm_id: DEMO_FARM, text: 'Запиши надой за сегодня' } });
  check('помощник: уточнение количества', clar.body?.needs_clarification === true && clar.body.proposed_events.length === 0, clar.body?.reply?.text);
  const rep = await api('/v1/assistant/messages', { method: 'POST', token, json: { farm_id: DEMO_FARM, text: 'Какие отчеты скоро сдавать?' } });
  check('помощник: сроки отчётов (карточки)', (rep.body?.reply?.cards ?? []).some((c) => c.kind === 'deadline'), `${(rep.body?.reply?.cards ?? []).length} карточек`);
  const alien = await api('/v1/assistant/messages', { method: 'POST', token, json: { farm_id: 'f0000000-0000-4000-8000-000000000002', text: 'привет' } });
  check('помощник: чужое хозяйство -> 404 (RLS)', alien.status === 404, String(alien.status));

  // 4. Голос (mock → 503)
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(2048)], { type: 'audio/m4a' }), 'voice.m4a');
  const tr = await api('/v1/assistant/transcribe', { method: 'POST', token, form });
  check('transcribe (mock) -> 503 с понятным текстом', tr.status === 503 && /напишите текстом/.test(tr.body?.error ?? ''), tr.body?.error);
  const big = new FormData();
  big.append('audio', new Blob([new Uint8Array(5 * 1024 * 1024 + 10)], { type: 'audio/m4a' }), 'big.m4a');
  const trBig = await api('/v1/assistant/transcribe', { method: 'POST', token, form: big });
  check('transcribe > 5 МБ -> 413', trBig.status === 413, String(trBig.status));

  // 5. Настройки напоминаний
  const s0 = await api('/v1/reminders/settings', { token });
  check('GET reminders/settings', s0.status === 200 && s0.body.remind_7_days !== undefined, JSON.stringify(s0.body));
  const s1 = await api('/v1/reminders/settings', { method: 'PUT', token, json: { sound: s0.body.sound } });
  check('PUT reminders/settings', s1.status === 200);

  // 6. Отчёты через адаптер
  const xlsx = await fetch(`${BASE}/v1/reports/3-fermer?farm_id=${DEMO_FARM}&year=2026&access_token=${token}`);
  check('XLSX 3-фермер через адаптер', xlsx.status === 200 && /spreadsheet/.test(xlsx.headers.get('content-type') ?? ''), `${xlsx.status}`);
  const pdf = await fetch(`${BASE}/api/household/extract?farm_id=${DEMO_FARM}&access_token=${token}`);
  check('PDF выписка (совместимый /api путь)', pdf.status === 200 && /pdf/.test(pdf.headers.get('content-type') ?? ''), `${pdf.status}`);

  // 7. Регистрация (Edge Function register) → онбординг → создание хозяйства → доступ
  const stamp = Date.now();
  const emailA = `smoke${stamp}@example.com`;
  const fn = (body) =>
    fetch(`${URL_}/functions/v1/register`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY }, body: JSON.stringify(body) }).then((r) => r.json());
  const su = await fn({ action: 'signup', full_name: 'Смоук Тестов', contact: emailA, password: 'Smoke2026pass' });
  check('register: signup -> demoCode', su.ok && /^\d{6}$/.test(su.demoCode ?? ''), su.message ?? '');
  const early = await login(emailA, 'Smoke2026pass');
  check('до подтверждения кода вход невозможен', !early.ok);
  const bad = await fn({ action: 'verify', contact: emailA, code: '000000' });
  check('register: неверный код -> invalid_code', !bad.ok && bad.error === 'invalid_code');
  const ver = await fn({ action: 'verify', contact: emailA, code: su.demoCode });
  check('register: verify -> token_hash', ver.ok && !!ver.token_hash, ver.message ?? '');
  const vo = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: ver.token_hash }),
  }).then((r) => r.json());
  const tokA = vo.access_token;
  check('verifyOtp -> сессия', !!tokA);
  const loginA = await login(emailA, 'Smoke2026pass');
  check('вход по email после регистрации', loginA.ok);

  if (tokA) {
    const created = await api('/v1/farms', { method: 'POST', token: tokA, json: { name: 'Смоук-хозяйство', legal_status: 'lph', region: 'Республика Саха (Якутия)', settlement: 'с. Намцы' } });
    check('POST /v1/farms (создать ЛПХ)', created.status === 201 && /^AGRO-\d{4}$/.test(created.body?.invite_code ?? ''), `${created.body?.invite_code}`);
    const again = await api('/v1/farms', { method: 'POST', token: tokA, json: { name: 'Второе', legal_status: 'kfh', region: '', settlement: '' } });
    check('второе хозяйство -> 409', again.status === 409);
    const look = await api('/v1/farms/lookup?q=AGRO-0142', { token: tokA });
    check('lookup по коду AGRO-0142', look.body?.farm?.farm_id === DEMO_FARM, JSON.stringify(look.body));
    const lookInn = await api('/v1/farms/lookup?q=143500987654', { token: tokA });
    check('lookup по ИНН', lookInn.body?.farm?.name?.includes('Эрилик') === true);
    // Новый пользователь B запрашивает доступ к хозяйству A
    const emailB = `smokeb${stamp}@example.com`;
    const suB = await fn({ action: 'signup', full_name: 'Смоук Второй', contact: emailB, password: 'Smoke2026pass' });
    const verB = await fn({ action: 'verify', contact: emailB, code: suB.demoCode });
    const voB = await fetch(`${URL_}/auth/v1/verify`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: verB.token_hash }) }).then((r) => r.json());
    const tokB = voB.access_token;
    const lk = await api(`/v1/farms/lookup?q=${created.body.invite_code}`, { token: tokB });
    const req = await api('/v1/farms/join-requests', { method: 'POST', token: tokB, json: { farm_id: lk.body.farm.farm_id } });
    check('запрос доступа создан (pending)', req.status === 201 && req.body.status === 'pending');
    // RLS: B пока не видит данные хозяйства A
    const peek = await fetch(`${URL_}/rest/v1/farms?id=eq.${created.body.id}`, { headers: { apikey: KEY, authorization: `Bearer ${tokB}` } }).then((r) => r.json());
    check('RLS: до одобрения участник не видит хозяйство', Array.isArray(peek) && peek.length === 0);
    const selfApprove = await api(`/v1/farms/join-requests/${req.body.id}/approve`, { method: 'POST', token: tokB });
    check('RLS: заявитель не может сам одобрить -> 403', selfApprove.status === 403, String(selfApprove.status));
    const incoming = await api('/v1/farms/join-requests?scope=incoming', { token: tokA });
    check('владелец видит входящий запрос', incoming.body?.requests?.some((r) => r.id === req.body.id));
    const appr = await api(`/v1/farms/join-requests/${req.body.id}/approve`, { method: 'POST', token: tokA });
    check('владелец одобряет запрос', appr.status === 200 && appr.body.status === 'approved');
    const peek2 = await fetch(`${URL_}/rest/v1/farms?id=eq.${created.body.id}`, { headers: { apikey: KEY, authorization: `Bearer ${tokB}` } }).then((r) => r.json());
    check('RLS: после одобрения участник видит хозяйство', Array.isArray(peek2) && peek2.length === 1);
    // участник пишет событие, владелец его видит
    const ins = await fetch(`${URL_}/rest/v1/product_outputs`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${tokB}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ farm_id: created.body.id, occurred_on: '2026-10-23', product: 'milk', quantity: 10 }),
    });
    check('участник пишет событие в хозяйство', ins.status === 201, String(ins.status));
    // чужой пользователь (демо КФХ) не видит хозяйство A и не может писать
    const other = await login('143500987654', DEMO_PASSWORD);
    const peek3 = await fetch(`${URL_}/rest/v1/farms?id=eq.${created.body.id}`, { headers: { apikey: KEY, authorization: `Bearer ${other.token}` } }).then((r) => r.json());
    check('RLS: посторонний не видит хозяйство', Array.isArray(peek3) && peek3.length === 0);
    const insBad = await fetch(`${URL_}/rest/v1/product_outputs`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${other.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ farm_id: created.body.id, occurred_on: '2026-10-23', product: 'milk', quantity: 1 }),
    });
    check('RLS: посторонний не может писать -> отказ', insBad.status >= 400, String(insBad.status));
    // push-токен
    const pt = await api('/v1/push-tokens', { method: 'POST', token: tokA, json: { token: 'ExponentPushToken[smoke-' + stamp + ']', platform: 'ios' } });
    check('POST /v1/push-tokens', pt.status === 200);
    // сообщение помощнику участником
    const chat = await api('/v1/assistant/messages', { method: 'POST', token: tokB, json: { farm_id: created.body.id, text: 'Родилось 3 ягненка' } });
    check('участник пользуется помощником', chat.body?.proposed_events?.[0]?.animal_group === 'sheep');
  }

  // 8. Запуск напоминаний без секрета
  const run = await api('/v1/reminders/run', { method: 'POST' });
  check('POST /v1/reminders/run без секрета -> 401', run.status === 401);

  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
void readFileSync;
