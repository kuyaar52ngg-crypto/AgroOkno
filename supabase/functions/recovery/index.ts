// Edge Function «recovery»: вход / восстановление доступа по одноразовому коду.
// Код генерируется и проверяется на сервере. Если заданы секреты Gmail (../_shared/mail.ts), код уходит письмом
// на email из профиля (даже если человек ввёл телефон). Без секретов вход по коду закрыт; демо-режим (код в ответе
// на action=request как demoCode) включается только секретом ALLOW_DEMO_CODES=true.
// После верной проверки выдаётся token_hash magic-link: клиент обменивает его на сессию через verifyOtp.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { allowResend, checkCode, issueCode } from '../_shared/codes.ts';
import { demoRecoveryAllowed, mailEnabled, sendCode } from '../_shared/mail.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const digits = (s: string) => s.replace(/\D/g, '');

function mask(contact: string) {
  if (contact.includes('@')) {
    const [name, domain] = contact.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  const d = digits(contact);
  return `+7 ••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}`;
}

async function findProfile(contact: string) {
  const value = contact.trim();
  if (!value) return null;
  if (value.includes('@')) {
    const { data } = await admin.from('profiles').select('id, email, phone').ilike('email', value).limit(1);
    return data?.[0] ?? null;
  }
  const tail = digits(value).slice(-10);
  if (tail.length < 10) return null;
  const { data } = await admin.from('profiles').select('id, email, phone').not('phone', 'is', null);
  return data?.find((p) => digits(p.phone ?? '').slice(-10) === tail) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'unknown', message: 'Метод не поддерживается' }, 405);

  let body: { action?: string; contact?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'unknown', message: 'Некорректный запрос' }, 400);
  }
  const contact = String(body.contact ?? '');
  const profile = await findProfile(contact);

  if (body.action === 'request') {
    if (!mailEnabled && !demoRecoveryAllowed) {
      return json({ ok: false, error: 'unknown', message: 'Вход по коду временно недоступен: почта не настроена. Войдите по паролю' });
    }
    if (!profile) {
      return json({ ok: false, error: 'contact_not_found', message: 'Не нашли хозяйство с таким контактом' });
    }
    if (mailEnabled && !profile.email) {
      return json({ ok: false, error: 'contact_not_found', message: 'В профиле нет email, а отправка SMS пока не подключена' });
    }
    const issued = await issueCode(admin, profile.id);
    // Код ушёл меньше 30 секунд назад (двойное нажатие) — он действует, второе письмо не шлём.
    if ('retryAfter' in issued) return json({ ok: true, maskedContact: mask(mailEnabled ? profile.email! : contact) });
    const { code } = issued;
    if (!mailEnabled) return json({ ok: true, maskedContact: mask(contact), demoCode: code });
    if (!(await sendCode(profile.email!, code, 'recovery'))) {
      await allowResend(admin, profile.id);
      return json({ ok: false, error: 'network', message: 'Не удалось отправить письмо с кодом. Попробуйте ещё раз' });
    }
    return json({ ok: true, maskedContact: mask(profile.email!) });
  }

  if (body.action === 'verify') {
    if (!mailEnabled && !demoRecoveryAllowed) {
      return json({ ok: false, error: 'unknown', message: 'Вход по коду временно недоступен: почта не настроена. Войдите по паролю' });
    }
    if (!profile) return json({ ok: false, error: 'contact_not_found', message: 'Не нашли хозяйство с таким контактом' });
    const verdict = await checkCode(admin, profile.id, String(body.code ?? ''));
    if (verdict === 'expired') {
      return json({ ok: false, error: 'invalid_code', message: 'Код истёк или исчерпаны попытки. Запросите новый' });
    }
    if (verdict === 'invalid') return json({ ok: false, error: 'invalid_code', message: 'Неверный код. Проверьте цифры' });
    const { data: user } = await admin.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email) return json({ ok: false, error: 'unknown', message: 'Учётная запись не найдена' });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !link?.properties?.hashed_token) {
      return json({ ok: false, error: 'unknown', message: 'Не удалось подтвердить код' });
    }
    return json({ ok: true, token_hash: link.properties.hashed_token });
  }

  return json({ ok: false, error: 'unknown', message: 'Неизвестное действие' }, 400);
});
