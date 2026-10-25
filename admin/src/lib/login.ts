// Проверка поля «ИНН, email или телефон» до обращения к серверу — те же правила, что во входе мобильного приложения.

/** Только цифры и знаки телефона, но не 10–12 цифр — скорее всего опечатка в ИНН. */
export function looksLikeBrokenInn(identifier: string): boolean {
  if (identifier.includes('@') || !/^[\d\s()+-]+$/.test(identifier)) return false;
  const n = identifier.replace(/\D/g, '').length;
  return n < 10 || n > 12;
}

/** Текст ошибки или null, если идентификатор и пароль можно отправлять. */
export function validateCredentials(identifierRaw: string, password: string): string | null {
  const identifier = identifierRaw.trim();
  if (!identifier) return 'Введите ИНН, email или телефон';
  if (looksLikeBrokenInn(identifier)) return 'Неверный ИНН. Проверьте цифры';
  if (!password) return 'Введите пароль';
  return null;
}
