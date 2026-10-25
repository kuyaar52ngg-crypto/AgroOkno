// Блокировка пользователя и отображение email администратора.

/** 876000 часов (≈100 лет) — «навсегда»: блокировка сервером ставится именно на такой срок. */
const FOREVER_YEAR = 2100;

export function isBanned(bannedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

/** «Заблокирован» (бессрочно) или «Заблокирован до 01.12.2026»; для активных — null. */
export function banLabel(bannedUntil: string | null | undefined, formatDate: (iso: string) => string, now: Date = new Date()): string | null {
  if (!isBanned(bannedUntil, now) || !bannedUntil) return null;
  const year = new Date(bannedUntil).getUTCFullYear();
  return year >= FOREVER_YEAR ? 'Заблокирован' : `Заблокирован до ${formatDate(bannedUntil)}`;
}

/** Технический email входа (u<id>@agrookno.app или <ИНН>@agrookno.app) пользователю не показываем. */
export function isTechnicalEmail(email: string | null | undefined): boolean {
  return !!email && /@agrookno\.app$/i.test(email.trim());
}

/** Что показать в шапке: реальный email из профиля, иначе email сессии (если он не технический), иначе имя. */
export function displayAdminEmail(profile: { email: string | null; full_name: string | null } | null, sessionEmail: string | null): string {
  const fromProfile = profile?.email?.trim();
  if (fromProfile) return fromProfile;
  if (sessionEmail && !isTechnicalEmail(sessionEmail)) return sessionEmail;
  return profile?.full_name?.trim() || 'Администратор';
}
