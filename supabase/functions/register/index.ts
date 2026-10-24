// Edge Function «register»: регистрация по реальному email/телефону (R1) и подтверждение кода (R2).
// Код генерируется и проверяется на сервере. Если заданы секреты Gmail (../_shared/mail.ts), код уходит письмом,
// а регистрация доступна только по email (SMS не подключены). Без секретов — демо-режим: код возвращается
// в ответе как demoCode (UI подставляет его в ячейки R2).
// Технический email входа — u<случайный id>@agrookno.app: реальные контакты хранятся только в profiles,
// а резолвер входа (RPC resolve_login_email) отдаёт наружу лишь технический адрес.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { allowResend, checkCode, issueCode } from '../_shared/codes.ts';
import { mailEnabled, sendCode } from '../_shared/mail.ts';

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

type ErrCode = 'invalid_code' | 'weak_password' | 'contact_not_found' | 'network' | 'unknown';
const fail = (error: ErrCode, message: string) => json({ ok: false, error, message });

const digits = (s: string) => s.replace(/\D/g, '');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function mask(contact: string) {
  if (contact.includes('@')) {
    const [name, domain] = contact.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  const d = digits(contact);
  return `+7 ••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}`;
}

/** Нормализованный контакт: email в нижнем регистре или телефон +7XXXXXXXXXX. */
function normalize(raw: string): { kind: 'email' | 'phone'; value: string } | null {
  const value = raw.trim();
  if (value.includes('@')) return EMAIL_RE.test(value) ? { kind: 'email', value: value.toLowerCase() } : null;
  const d = digits(value);
  if (d.length < 10 || d.length > 12) return null;
  return { kind: 'phone', value: `+7${d.slice(-10)}` };
}

async function findProfile(c: { kind: 'email' | 'phone'; value: string }) {
  if (c.kind === 'email') {
    const { data } = await admin.from('profiles').select('id, email, phone').ilike('email', c.value.replace(/[%_\\]/g, '\\$&')).limit(1);
    return data?.[0] ?? null;
  }
  const tail = digits(c.value).slice(-10);
  const { data } = await admin.from('profiles').select('id, email, phone').not('phone', 'is', null);
  return data?.find((p) => digits(p.phone ?? '').slice(-10) === tail) ?? null;
}

const isStrong = (p: string) => p.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(p) && /\d/.test(p);

/**
 * Ответ после выдачи кода: письмо на email или demoCode в демо-режиме. Если код ушёл меньше 30 секунд назад,
 * регистрация (quiet) отвечает успехом без нового письма — прежний код действует; «Отправить повторно» просит подождать.
 */
async function deliver(userId: string, email: string | null, fallbackContact: string, quiet: boolean) {
  if (mailEnabled && !email) return fail('contact_not_found', 'Отправка SMS пока не подключена. Укажите email');
  const issued = await issueCode(admin, userId);
  if ('retryAfter' in issued) {
    if (quiet) return json({ ok: true, maskedContact: mask(email ?? fallbackContact) });
    return fail('unknown', `Код уже отправлен. Запросить новый можно через ${issued.retryAfter} с`);
  }
  const { code } = issued;
  if (!mailEnabled || !email) return json({ ok: true, maskedContact: mask(fallbackContact), demoCode: code });
  if (!(await sendCode(email, code, 'signup'))) {
    await allowResend(admin, userId);
    return fail('network', 'Не удалось отправить письмо с кодом. Попробуйте ещё раз');
  }
  return json({ ok: true, maskedContact: mask(email) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'unknown', message: 'Метод не поддерживается' }, 405);

  let body: { action?: string; contact?: string; code?: string; full_name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'unknown', message: 'Некорректный запрос' }, 400);
  }
  const contact = normalize(String(body.contact ?? ''));
  if (!contact) return fail('contact_not_found', 'Проверьте телефон или email');

  if (body.action === 'signup') {
    const fullName = String(body.full_name ?? '').trim();
    const password = String(body.password ?? '');
    if (fullName.length < 2) return fail('unknown', 'Укажите фамилию и имя');
    if (!isStrong(password)) return fail('weak_password', 'Пароль слишком простой: не короче 8 символов, буквы и цифры');
    if (mailEnabled && contact.kind === 'phone') return fail('contact_not_found', 'Отправка SMS пока не подключена. Укажите email');

    const existing = await findProfile(contact);
    let userId: string;
    if (existing) {
      const { data: u } = await admin.auth.admin.getUserById(existing.id);
      if (u?.user?.email_confirmed_at) {
        return fail('unknown', 'Аккаунт с таким контактом уже есть. Войдите или восстановите доступ');
      }
      // Регистрация не завершена: обновляем данные и выдаём новый код.
      userId = existing.id;
      const { error } = await admin.auth.admin.updateUserById(userId, { password, user_metadata: { full_name: fullName } });
      if (error) return fail('unknown', 'Не удалось создать аккаунт. Попробуйте ещё раз');
      await admin.from('profiles').update({ full_name: fullName }).eq('id', userId);
    } else {
      const techEmail = `u${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}@agrookno.app`;
      const { data, error } = await admin.auth.admin.createUser({
        email: techEmail,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) return fail('unknown', 'Не удалось создать аккаунт. Попробуйте ещё раз');
      userId = data.user.id;
      const patch = contact.kind === 'email' ? { email: contact.value } : { phone: contact.value };
      const { error: pErr } = await admin.from('profiles').upsert({ id: userId, full_name: fullName, ...patch });
      if (pErr) {
        await admin.auth.admin.deleteUser(userId);
        return fail('unknown', 'Не удалось создать аккаунт. Попробуйте ещё раз');
      }
    }
    return deliver(userId, contact.kind === 'email' ? contact.value : null, contact.value, true);
  }

  const profile = await findProfile(contact);

  if (body.action === 'resend') {
    if (!profile) return fail('contact_not_found', 'Не нашли регистрацию с таким контактом');
    return deliver(profile.id, profile.email, contact.value, false);
  }

  if (body.action === 'verify') {
    if (!profile) return fail('contact_not_found', 'Не нашли регистрацию с таким контактом');
    const verdict = await checkCode(admin, profile.id, String(body.code ?? ''));
    if (verdict === 'expired') return fail('invalid_code', 'Код истёк или исчерпаны попытки. Запросите новый');
    if (verdict === 'invalid') return fail('invalid_code', 'Неверный код. Проверьте цифры');
    const { data: user } = await admin.auth.admin.getUserById(profile.id);
    const email = user?.user?.email;
    if (!email) return fail('unknown', 'Учётная запись не найдена');
    await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !link?.properties?.hashed_token) return fail('unknown', 'Не удалось подтвердить код');
    return json({ ok: true, token_hash: link.properties.hashed_token });
  }

  return json({ ok: false, error: 'unknown', message: 'Неизвестное действие' }, 400);
});
