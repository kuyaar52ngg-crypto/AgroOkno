// Авторизация: вход по ИНН / email / телефону (RPC resolve_login_email → технический email + пароль), регистрация
// по реальному контакту с кодом (Edge Function register), демо-восстановление по OTP, смена пароля, выбор роли.
import { supabase } from '../lib/supabase';
import type { AuthResult, AuthApi, UserRole } from './contract';
import { currentFarm, currentProfile } from './entities';
import { isNetworkError, setOnline } from './net';
import { activateUser, currentUserId, session } from './session';
import { getDoc, putLocal } from './store';
import { requestSync, syncNow } from './sync';
import { emitChange } from './bus';

const ok: AuthResult = { ok: true };
const fail = (error: Extract<AuthResult, { ok: false }>['error'], message: string): Extract<AuthResult, { ok: false }> => ({
  ok: false,
  error,
  message,
});
const networkFail = () => fail('network', 'Нет подключения к сети. Проверьте интернет и попробуйте ещё раз');

export const innToEmail = (inn: string) => `${inn}@agrookno.app`;

/** Только цифры и знаки телефона, но не 10–12 цифр — скорее всего опечатка в ИНН. */
function looksLikeBrokenInn(identifier: string): boolean {
  if (identifier.includes('@') || !/^[\d\s()+-]+$/.test(identifier)) return false;
  const n = identifier.replace(/\D/g, '').length;
  return n < 10 || n > 12;
}

/**
 * Вход по любому идентификатору: ИНН хозяйства, email или телефон. Сначала RPC resolve_login_email
 * возвращает технический email учётной записи (для неизвестного идентификатора — заведомо несуществующий адрес,
 * поэтому ошибка та же, что при неверном пароле).
 */
export async function signIn(identifierRaw: string, password: string): Promise<AuthResult> {
  const identifier = identifierRaw.trim();
  if (!identifier) return fail('invalid_credentials', 'Введите ИНН, email или телефон');
  if (looksLikeBrokenInn(identifier)) return fail('invalid_inn', 'Неверный ИНН. Проверьте цифры');
  if (!password) return fail('invalid_credentials', 'Введите пароль');
  try {
    const { data: email, error: rpcError } = await supabase.rpc('resolve_login_email', { p_identifier: identifier });
    if (rpcError) {
      if (isNetworkError(rpcError)) {
        setOnline(false);
        return networkFail();
      }
      return fail('unknown', 'Не удалось войти. Попробуйте ещё раз');
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: String(email), password });
    if (error) {
      if (isNetworkError(error)) {
        setOnline(false);
        return networkFail();
      }
      if (error.status === 400 || /invalid login credentials|not confirmed/i.test(error.message)) {
        return fail('invalid_credentials', 'Неверный логин или пароль');
      }
      return fail('unknown', 'Не удалось войти. Попробуйте ещё раз');
    }
    setOnline(true);
    await activateUser(data.user.id);
    return ok;
  } catch (e) {
    if (isNetworkError(e)) {
      setOnline(false);
      return networkFail();
    }
    return fail('unknown', 'Не удалось войти. Попробуйте ещё раз');
  }
}

/** Вход по ИНН хозяйства (контракт v1) — частный случай signIn. */
export const signInWithInn = (inn: string, password: string): Promise<AuthResult> => signIn(inn, password);

interface FunctionResponse {
  ok: boolean;
  error?: Extract<AuthResult, { ok: false }>['error'];
  message?: string;
  maskedContact?: string;
  demoCode?: string;
  token_hash?: string;
}

async function callFunction(name: 'recovery' | 'register', body: Record<string, string>): Promise<FunctionResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<FunctionResponse>(name, { body });
    if (error) {
      // FunctionsHttpError содержит ответ функции — пробуем прочитать JSON с кодом ошибки.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          return (await ctx.json()) as FunctionResponse;
        } catch {
          return { ok: false, error: 'unknown', message: 'Не удалось выполнить запрос' };
        }
      }
      if (isNetworkError(error)) return null;
      return { ok: false, error: 'unknown', message: 'Не удалось выполнить запрос' };
    }
    return data ?? { ok: false, error: 'unknown', message: 'Пустой ответ сервера' };
  } catch (e) {
    if (isNetworkError(e)) return null;
    return { ok: false, error: 'unknown', message: 'Не удалось выполнить запрос' };
  }
}

/**
 * Демо-режим: настоящая отправка email/SMS не подключена. Код генерирует и проверяет Edge Function `recovery`,
 * а в ответ добавляет demoCode — UI подставляет его в ячейки A5 (на проде поле отсутствует).
 */
export async function requestRecovery(contact: string): Promise<AuthResult & { maskedContact?: string; demoCode?: string }> {
  const value = contact.trim();
  if (!value) return fail('contact_not_found', 'Введите телефон или email');
  const res = await callFunction('recovery', { action: 'request', contact: value });
  if (!res) return networkFail();
  if (!res.ok) return fail(res.error ?? 'unknown', res.message ?? 'Не удалось отправить код');
  return { ok: true, maskedContact: res.maskedContact, demoCode: res.demoCode };
}

/** Обмен token_hash на сессию и активация пользователя (общий хвост для кода восстановления и кода регистрации). */
async function exchangeTokenHash(tokenHash: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error || !data.user) {
      if (error && isNetworkError(error)) return networkFail();
      return fail('unknown', 'Не удалось войти по коду. Запросите новый');
    }
    await activateUser(data.user.id);
    return ok;
  } catch (e) {
    return isNetworkError(e) ? networkFail() : fail('unknown', 'Не удалось войти по коду. Запросите новый');
  }
}

export async function verifyRecoveryCode(contact: string, code: string): Promise<AuthResult> {
  if (!/^\d{6}$/.test(code)) return fail('invalid_code', 'Неверный код. Проверьте цифры');
  const res = await callFunction('recovery', { action: 'verify', contact: contact.trim(), code });
  if (!res) return networkFail();
  if (!res.ok || !res.token_hash) return fail(res.error ?? 'unknown', res.message ?? 'Не удалось подтвердить код');
  return exchangeTokenHash(res.token_hash);
}

// ─── Регистрация (R1–R2) ────────────────────────────────────────────────────

/** Требования A6: не короче 8 символов, буквы и цифры. */
export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password);
}

export const isValidContact = (contact: string): boolean => {
  const value = contact.trim();
  if (value.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  const d = value.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 12;
};

/** R1: создаёт аккаунт и «отправляет» код (в демо-режиме код возвращается в demoCode). */
export async function signUp(input: {
  full_name: string;
  contact: string;
  password: string;
  consent: boolean;
}): Promise<AuthResult & { maskedContact?: string; demoCode?: string }> {
  if (input.full_name.trim().length < 2) return fail('unknown', 'Укажите фамилию и имя');
  if (!isValidContact(input.contact)) return fail('contact_not_found', 'Проверьте телефон или email');
  if (!isStrongPassword(input.password)) return fail('weak_password', 'Пароль слишком простой: не короче 8 символов, буквы и цифры');
  if (!input.consent) return fail('unknown', 'Нужно согласие на обработку персональных данных');
  const res = await callFunction('register', {
    action: 'signup',
    full_name: input.full_name.trim(),
    contact: input.contact.trim(),
    password: input.password,
  });
  if (!res) return networkFail();
  if (!res.ok) return fail(res.error ?? 'unknown', res.message ?? 'Не удалось создать аккаунт');
  return { ok: true, maskedContact: res.maskedContact, demoCode: res.demoCode };
}

/** R2: после верного кода пользователь в сессии. */
export async function verifySignUpCode(contact: string, code: string): Promise<AuthResult> {
  if (!/^\d{6}$/.test(code)) return fail('invalid_code', 'Неверный код. Проверьте цифры');
  const res = await callFunction('register', { action: 'verify', contact: contact.trim(), code });
  if (!res) return networkFail();
  if (!res.ok || !res.token_hash) return fail(res.error ?? 'unknown', res.message ?? 'Не удалось подтвердить код');
  return exchangeTokenHash(res.token_hash);
}

export async function resendCode(contact: string, purpose: 'signup' | 'recovery'): Promise<AuthResult & { demoCode?: string }> {
  if (purpose === 'recovery') {
    const r = await requestRecovery(contact);
    return r.ok ? { ok: true, demoCode: r.demoCode } : r;
  }
  const res = await callFunction('register', { action: 'resend', contact: contact.trim() });
  if (!res) return networkFail();
  if (!res.ok) return fail(res.error ?? 'unknown', res.message ?? 'Не удалось отправить код');
  return { ok: true, demoCode: res.demoCode };
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!isStrongPassword(password)) return fail('weak_password', 'Пароль слишком простой: не короче 8 символов, буквы и цифры');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (isNetworkError(error)) return networkFail();
      if (/same.*password|different from the old/i.test(error.message)) return ok;
      if (/weak|short|at least/i.test(error.message)) return fail('weak_password', 'Пароль слишком простой');
      return fail('unknown', 'Не удалось сменить пароль');
    }
    return ok;
  } catch (e) {
    return isNetworkError(e) ? networkFail() : fail('unknown', 'Не удалось сменить пароль');
  }
}

export async function setRole(role: UserRole): Promise<AuthResult> {
  const id = currentUserId();
  if (!id) return fail('unknown', 'Нет активной сессии');
  const doc = getDoc('profiles', id);
  const base = doc?.data ?? { id };
  putLocal('profiles', 'id', { ...base, role });
  // Роль критична для навигации — отправляем сразу, а не дожидаясь фоновой синхронизации.
  await syncNow({ force: true });
  const confirmed = getDoc('profiles', id);
  emitChange();
  if (confirmed?.pending) requestSync(3000);
  return ok;
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // офлайн: локальная сессия всё равно сбрасывается
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

export function buildAuthApi(): AuthApi {
  return {
    status: session.status,
    profile: session.status === 'signed_in' ? currentProfile() : null,
    farm: session.status === 'signed_in' ? currentFarm() : null,
    signInWithInn,
    requestRecovery,
    verifyRecoveryCode,
    setNewPassword,
    setRole,
    signOut,
  };
}
