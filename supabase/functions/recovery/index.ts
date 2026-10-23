// Edge Function «recovery»: демо-восстановление доступа по OTP.
// Реальной отправки email/SMS нет: код генерируется и проверяется на сервере, а в ответе
// на action=request возвращается demoCode (UI показывает его в info-плашке «учебные данные»).
// После верной проверки выдаётся token_hash magic-link: клиент обменивает его на сессию через verifyOtp.
import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
    if (!profile) {
      return json({ ok: false, error: 'contact_not_found', message: 'Не нашли хозяйство с таким контактом' });
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    await admin.from('recovery_codes').upsert({
      user_id: profile.id,
      code_hash: await sha256(`${profile.id}:${code}`),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
    });
    return json({ ok: true, maskedContact: mask(contact), demoCode: code });
  }

  if (body.action === 'verify') {
    if (!profile) return json({ ok: false, error: 'contact_not_found', message: 'Не нашли хозяйство с таким контактом' });
    const { data: row } = await admin.from('recovery_codes').select('*').eq('user_id', profile.id).maybeSingle();
    const invalid = { ok: false, error: 'invalid_code', message: 'Неверный код. Проверьте цифры' };
    if (!row || new Date(row.expires_at) < new Date() || row.attempts >= 5) {
      return json({ ...invalid, message: 'Код истёк или исчерпаны попытки. Запросите новый' });
    }
    if (row.code_hash !== (await sha256(`${profile.id}:${String(body.code ?? '')}`))) {
      await admin.from('recovery_codes').update({ attempts: row.attempts + 1 }).eq('user_id', profile.id);
      return json(invalid);
    }
    await admin.from('recovery_codes').delete().eq('user_id', profile.id);
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
