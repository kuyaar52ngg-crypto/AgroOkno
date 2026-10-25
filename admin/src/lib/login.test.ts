import { describe, expect, it } from 'vitest';

import { looksLikeBrokenInn, validateCredentials } from './login';

describe('проверка формы входа', () => {
  it('опечатки в ИНН', () => {
    expect(looksLikeBrokenInn('14351234566')).toBe(false); // 11 цифр допустимы как телефон/ИНН
    expect(looksLikeBrokenInn('143512345')).toBe(true);
    expect(looksLikeBrokenInn('1435123456601')).toBe(true);
    expect(looksLikeBrokenInn('+7 (914) 123-45-67')).toBe(false);
    expect(looksLikeBrokenInn('admin@example.ru')).toBe(false);
    expect(looksLikeBrokenInn('иванов')).toBe(false);
  });

  it('validateCredentials', () => {
    expect(validateCredentials('', 'pass')).toBe('Введите ИНН, email или телефон');
    expect(validateCredentials('   ', 'pass')).toBe('Введите ИНН, email или телефон');
    expect(validateCredentials('12345', 'pass')).toBe('Неверный ИНН. Проверьте цифры');
    expect(validateCredentials('143512345660', '')).toBe('Введите пароль');
    expect(validateCredentials('143512345660', 'secret1')).toBeNull();
    expect(validateCredentials(' user@mail.ru ', 'secret1')).toBeNull();
  });
});
