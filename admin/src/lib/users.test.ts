import { describe, expect, it } from 'vitest';

import { fmtDate } from './format';
import { banLabel, displayAdminEmail, isBanned, isTechnicalEmail } from './users';

const NOW = new Date('2026-10-25T10:00:00Z');

describe('блокировка', () => {
  it('isBanned: будущая дата — заблокирован', () => {
    expect(isBanned('2026-11-01T00:00:00Z', NOW)).toBe(true);
    expect(isBanned('2026-10-01T00:00:00Z', NOW)).toBe(false);
    expect(isBanned(null, NOW)).toBe(false);
    expect(isBanned('мусор', NOW)).toBe(false);
  });

  it('banLabel: бессрочная и временная блокировка', () => {
    expect(banLabel('2126-10-25T00:00:00Z', fmtDate, NOW)).toBe('Заблокирован');
    expect(banLabel('2026-12-01T00:00:00Z', fmtDate, NOW)).toBe('Заблокирован до 01.12.2026');
    expect(banLabel('2026-10-01T00:00:00Z', fmtDate, NOW)).toBeNull();
    expect(banLabel(null, fmtDate, NOW)).toBeNull();
  });
});

describe('email администратора в шапке', () => {
  it('технический email распознаётся', () => {
    expect(isTechnicalEmail('u3f9a1b2c4d5e6@agrookno.app')).toBe(true);
    expect(isTechnicalEmail('143512345660@AgroOkno.app')).toBe(true);
    expect(isTechnicalEmail('kuyaar52ngg@gmail.com')).toBe(false);
    expect(isTechnicalEmail(null)).toBe(false);
  });

  it('приоритет: профиль → email сессии → имя → заглушка', () => {
    expect(displayAdminEmail({ email: 'admin@example.ru', full_name: 'А' }, 'u1@agrookno.app')).toBe('admin@example.ru');
    expect(displayAdminEmail({ email: null, full_name: 'Куяар' }, 'real@mail.ru')).toBe('real@mail.ru');
    expect(displayAdminEmail({ email: '', full_name: 'Куяар' }, 'u1@agrookno.app')).toBe('Куяар');
    expect(displayAdminEmail(null, 'u1@agrookno.app')).toBe('Администратор');
    expect(displayAdminEmail(null, null)).toBe('Администратор');
  });
});
