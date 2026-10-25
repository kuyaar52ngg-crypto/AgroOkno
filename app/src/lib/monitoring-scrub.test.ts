import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scrubEvent, scrubText } from './monitoring-scrub';

test('scrubText скрывает email, телефон и ИНН', () => {
  assert.equal(scrubText('ошибка для ivan@mail.ru'), 'ошибка для [email]');
  assert.equal(scrubText('тел. +7 914 123-45-67 занят'), 'тел. [phone] занят');
  assert.equal(scrubText('8(914)1234567'), '[phone]');
  assert.equal(scrubText('Key (inn)=(143512345660) already exists'), 'Key (inn)=([number]) already exists');
  assert.doesNotMatch(scrubText('ИНН 1435123456'), /\d/); // 10 цифр — ИНН юрлица или телефон: скрыто в любом случае
});

test('scrubText не трогает обычные числа и uuid', () => {
  assert.equal(scrubText('HTTP 500, 12 записей, 2026-10-23'), 'HTTP 500, 12 записей, 2026-10-23');
  const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.equal(scrubText(`user ${id}`), `user ${id}`);
});

test('scrubEvent оставляет только id пользователя и чистит вложенные строки', () => {
  const event = scrubEvent({
    user: { id: 'u-1', email: 'a@b.ru', ip_address: '1.2.3.4', username: 'ivan' },
    request: { url: 'https://x', headers: { cookie: 'a=b' } },
    message: 'fail a@b.ru',
    breadcrumbs: [{ message: 'phone +79141234567' }],
  } as Parameters<typeof scrubEvent>[0] & { message: string; breadcrumbs: { message: string }[] });
  assert.deepEqual(event.user, { id: 'u-1' });
  assert.equal('request' in event, false);
  assert.equal((event as { message: string }).message, 'fail [email]');
  assert.equal((event as { breadcrumbs: { message: string }[] }).breadcrumbs[0].message, 'phone [phone]');
});
