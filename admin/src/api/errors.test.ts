import { describe, expect, it } from 'vitest';

import { ApiError, MESSAGES, describeError, fromHttp, fromPostgrest, readable, toApiError } from './errors';

describe('ошибки Postgres/PostgREST', () => {
  it('42501 → «Нет доступа»', () => {
    const e = fromPostgrest({ code: '42501', message: 'Только для администраторов' });
    expect(e.kind).toBe('forbidden');
    expect(e.status).toBe(403);
    expect(e.message).toBe('Только для администраторов');
    expect(describeError(e).title).toBe('Нет доступа');
  });

  it('42501 с английским текстом заменяется русским', () => {
    expect(fromPostgrest({ code: '42501', message: 'permission denied for table x' }).message).toBe(MESSAGES.forbidden);
  });

  it('HTTP 403 без кода тоже «нет доступа»', () => {
    expect(fromPostgrest({ message: 'Forbidden', status: 403 }).kind).toBe('forbidden');
  });

  it('PGRST202 (нет функции) → база не обновлена', () => {
    const e = fromPostgrest({ code: 'PGRST202', message: 'Could not find the function public.admin_stats' });
    expect(e.kind).toBe('db_outdated');
    expect(e.message).toBe(MESSAGES.dbOutdated);
    expect(describeError(e).title).toBe('База данных не обновлена');
  });

  it('просроченный JWT → нужно войти снова', () => {
    expect(fromPostgrest({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('unauthorized');
    expect(fromPostgrest({ message: 'JWT expired' }).kind).toBe('unauthorized');
  });

  it('валидация и конфликт: русский текст сервера сохраняется', () => {
    const v = fromPostgrest({ code: '22023', message: 'Снять права с себя нельзя' });
    expect(v.kind).toBe('validation');
    expect(v.message).toBe('Снять права с себя нельзя');
    expect(fromPostgrest({ code: '23505', message: 'duplicate key' }).message).toBe(MESSAGES.conflict);
    expect(fromPostgrest({ code: 'P0002', message: 'no data found' }).kind).toBe('not_found');
  });

  it('22023 и P0002 — ошибки ввода: показываем message из ответа', () => {
    const self = fromPostgrest({ code: '22023', message: 'Нельзя снять права администратора с себя' });
    expect(self.kind).toBe('validation');
    expect(self.message).toBe('Нельзя снять права администратора с себя');
    const none = fromPostgrest({ code: 'P0002', message: 'Хозяйства для рассылки не найдены' });
    expect(none.kind).toBe('not_found');
    expect(none.message).toBe('Хозяйства для рассылки не найдены');
  });

  it('сетевая ошибка внутри сообщения PostgREST', () => {
    expect(fromPostgrest({ message: 'TypeError: Failed to fetch' }).kind).toBe('network');
  });

  it('незнакомая ошибка → общий текст', () => {
    const e = fromPostgrest({ code: 'XX000', message: 'internal error' });
    expect(e.kind).toBe('unknown');
    expect(e.message).toBe(MESSAGES.unknown);
  });
});

describe('ответы сервера', () => {
  it('403 и 401', () => {
    expect(fromHttp(403, { error: 'Менять модель помощника могут только администраторы' }).kind).toBe('forbidden');
    expect(fromHttp(403, { error: 'Менять модель помощника могут только администраторы' }).message).toBe('Менять модель помощника могут только администраторы');
    expect(fromHttp(403, null).message).toBe(MESSAGES.forbidden);
    expect(fromHttp(401, { error: 'Unauthorized' }).kind).toBe('unauthorized');
  });

  it('503 без сервисного ключа: показываем русский текст сервера', () => {
    const e = fromHttp(503, { error: 'На сервере не задан SUPABASE_SERVICE_ROLE_KEY' });
    expect(e.kind).toBe('unavailable');
    expect(e.message).toBe('На сервере не задан SUPABASE_SERVICE_ROLE_KEY');
  });

  it('503 с английским текстом заменяется понятным русским', () => {
    const e = fromHttp(503, { error: 'Service Unavailable' });
    expect(e.kind).toBe('unavailable');
    expect(e.message).toBe(MESSAGES.unavailable);
  });

  it('self_block: 400 с кодом — ошибка ввода с понятным текстом', () => {
    const e = fromHttp(400, { error: 'Нельзя заблокировать самого себя', code: 'self_block' });
    expect(e.kind).toBe('validation');
    expect(e.message).toBe('Нельзя заблокировать самого себя');
    expect(fromHttp(400, { error: 'self block', code: 'self_block' }).message).toBe(MESSAGES.selfBlock);
  });

  it('404 и 502 с русским текстом сервера', () => {
    expect(fromHttp(404, { error: 'Пользователь не найден' }).message).toBe('Пользователь не найден');
    expect(fromHttp(502, { error: 'Не удалось обновить учётную запись' }).message).toBe('Не удалось обновить учётную запись');
  });

  it('503 с русским текстом', () => {
    expect(fromHttp(503, { error: 'На сервере не задан сервисный ключ базы данных' }).message).toBe('На сервере не задан сервисный ключ базы данных');
  });

  it('db_outdated, 502 и 400', () => {
    expect(fromHttp(503, { error: 'x', code: 'db_outdated' }).kind).toBe('db_outdated');
    expect(fromHttp(502, { error: 'Не удалось получить список моделей OpenRouter. Попробуйте позже' }).kind).toBe('unavailable');
    expect(fromHttp(400, { error: 'Запасных моделей — не больше трёх' }).kind).toBe('validation');
    expect(fromHttp(500, 'oops').kind).toBe('unknown');
  });
});

describe('toApiError', () => {
  it('исключение fetch → сеть', () => {
    const e = toApiError(new TypeError('Failed to fetch'));
    expect(e.kind).toBe('network');
    expect(e.message).toBe(MESSAGES.network);
  });

  it('таймаут → сеть с подсказкой про простой сервера', () => {
    const e = toApiError(new DOMException('signal timed out', 'TimeoutError'));
    expect(e.kind).toBe('network');
    expect(e.message).toBe(MESSAGES.timeout);
  });

  it('ApiError возвращается как есть', () => {
    const original = new ApiError('conflict', 'x');
    expect(toApiError(original)).toBe(original);
  });

  it('объект PostgrestError и мусор', () => {
    expect(toApiError({ code: '42501', message: 'x' }).kind).toBe('forbidden');
    expect(toApiError('что-то').kind).toBe('unknown');
    expect(toApiError(null).message).toBe(MESSAGES.unknown);
  });
});

describe('readable', () => {
  it('пропускает только русский текст', () => {
    expect(readable('Нет доступа')).toBe('Нет доступа');
    expect(readable('forbidden')).toBeNull();
    expect(readable(42)).toBeNull();
  });
});
