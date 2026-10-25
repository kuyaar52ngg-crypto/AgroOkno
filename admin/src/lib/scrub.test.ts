import { describe, expect, it } from 'vitest';

import { scrubEvent, scrubText } from './scrub';

describe('scrub', () => {
  it('скрывает email, телефон и ИНН', () => {
    expect(scrubText('ошибка для ivan@mail.ru')).toBe('ошибка для [email]');
    expect(scrubText('тел. +7 914 123-45-67 занят')).toBe('тел. [phone] занят');
    expect(scrubText('Key (inn)=(143512345660) exists')).toBe('Key (inn)=([number]) exists');
  });

  it('не трогает обычные числа и uuid', () => {
    expect(scrubText('HTTP 500, 12 записей, 2026-10-23')).toBe('HTTP 500, 12 записей, 2026-10-23');
    const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
    expect(scrubText(`user ${id}`)).toBe(`user ${id}`);
  });

  it('оставляет у пользователя только id и убирает request', () => {
    const e = scrubEvent({ user: { id: 'u-1', email: 'a@b.ru', ip_address: '1.2.3.4' }, request: { url: 'https://x/?a=1' }, message: 'fail a@b.ru' });
    expect(e.user).toEqual({ id: 'u-1' });
    expect('request' in e).toBe(false);
    expect(e.message).toBe('fail [email]');
  });
});
