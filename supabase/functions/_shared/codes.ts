// Одноразовые 6-значные коды (регистрация и вход по коду). Хранятся только хэши в public.recovery_codes.
// Действует любой из последних 5 кодов, пока не истёк срок (письма приходят не по порядку), а новый код
// выдаётся не чаще раза в 30 секунд — выдачу атомарно делает RPC push_recovery_code.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MAX_ATTEMPTS = 5;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const hashFor = (userId: string, code: string) => sha256(`${userId}:${code}`);

/** Новый код или, если предыдущий отправлен меньше 30 секунд назад, — сколько секунд подождать. */
export async function issueCode(
  admin: SupabaseClient,
  userId: string,
): Promise<{ code: string } | { retryAfter: number }> {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const { data, error } = await admin.rpc('push_recovery_code', { p_user: userId, p_hash: await hashFor(userId, code) });
  if (error) throw error;
  return data > 0 ? { retryAfter: data as number } : { code };
}

/** Письмо не ушло — снимаем 30-секундную паузу, чтобы повторная попытка сразу выдала новый код. */
export async function allowResend(admin: SupabaseClient, userId: string) {
  await admin.from('recovery_codes').update({ sent_at: new Date(0).toISOString() }).eq('user_id', userId);
}

/** Проверяет код; при успехе удаляет все коды пользователя. */
export async function checkCode(admin: SupabaseClient, userId: string, code: string): Promise<'ok' | 'invalid' | 'expired'> {
  const { data: row } = await admin
    .from('recovery_codes')
    .select('code_hash, prev_hashes, expires_at, attempts')
    .eq('user_id', userId)
    .maybeSingle();
  if (!row || new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) return 'expired';
  const hash = await hashFor(userId, code);
  if (hash !== row.code_hash && !(row.prev_hashes ?? []).includes(hash)) {
    await admin.from('recovery_codes').update({ attempts: row.attempts + 1 }).eq('user_id', userId);
    return 'invalid';
  }
  await admin.from('recovery_codes').delete().eq('user_id', userId);
  return 'ok';
}
