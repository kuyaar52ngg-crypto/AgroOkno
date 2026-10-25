// Единая модель ошибок слоя API: Postgres/PostgREST (RPC), HTTP-ответы сервера, сеть. Тексты — по-русски.

export type ApiErrorKind =
  | 'forbidden' // 42501 / 403 — нет прав администратора
  | 'unauthorized' // 401 / истёкший JWT — нужно войти заново
  | 'network' // нет связи / сервер не ответил
  | 'db_outdated' // RPC или таблицы нет: миграция базы не применена
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'unavailable' // 502/503 — сервер или внешний сервис недоступен
  | 'unknown';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CYRILLIC = /[А-Яа-яЁё]/;

export const MESSAGES = {
  forbidden: 'Нет доступа. Раздел доступен только администраторам.',
  unauthorized: 'Сессия истекла. Войдите снова.',
  network: 'Не удалось связаться с сервером. Проверьте интернет и повторите попытку.',
  timeout: 'Сервер не ответил вовремя. Повторите попытку: после простоя он может запускаться до минуты.',
  dbOutdated: 'База данных ещё не обновлена до нужной версии (не применена миграция админ-панели). Обратитесь к разработчикам.',
  notFound: 'Запись не найдена. Возможно, она была удалена.',
  conflict: 'Конфликт данных. Обновите страницу и повторите.',
  validation: 'Проверьте введённые данные.',
  unavailable: 'Сервис временно недоступен. Повторите попытку позже.',
  selfBlock: 'Нельзя заблокировать самого себя.',
  unknown: 'Не удалось выполнить запрос. Повторите попытку позже.',
} as const;

/** Текст пригоден для показа пользователю, если он уже по-русски (так отвечают наши RPC и сервер). */
export function readable(message: unknown): string | null {
  return typeof message === 'string' && CYRILLIC.test(message) ? message : null;
}

function isNetworkMessage(message: string): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|econnrefused|enotfound/i.test(message);
}

interface PostgrestLike {
  code?: string;
  message?: string;
  status?: number;
}

/** Ошибка PostgREST/Supabase (`rpc`/`from`) или произвольное исключение → ApiError. */
export function fromPostgrest(error: PostgrestLike): ApiError {
  const code = error.code;
  const message = error.message ?? '';
  const status = error.status;
  if (code === '42501' || status === 403) return new ApiError('forbidden', readable(message) ?? MESSAGES.forbidden, 403, code);
  if (code === 'PGRST301' || code === 'PGRST303' || status === 401 || /jwt (expired|invalid)/i.test(message)) {
    return new ApiError('unauthorized', MESSAGES.unauthorized, 401, code);
  }
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01') {
    return new ApiError('db_outdated', MESSAGES.dbOutdated, 503, code);
  }
  if (code === 'P0002' || status === 404) return new ApiError('not_found', readable(message) ?? MESSAGES.notFound, 404, code);
  if (code === '23505' || status === 409) return new ApiError('conflict', readable(message) ?? MESSAGES.conflict, 409, code);
  if (code === '22023' || code === '23514' || code === '22P02' || code === '23502' || status === 400) {
    return new ApiError('validation', readable(message) ?? MESSAGES.validation, 400, code);
  }
  if (isNetworkMessage(message)) return new ApiError('network', MESSAGES.network, undefined, code);
  return new ApiError('unknown', readable(message) ?? MESSAGES.unknown, status, code);
}

/** Ответ сервера Fastify: `{ error: "текст", code?: "..." }` и HTTP-статус. */
export function fromHttp(status: number, body: unknown): ApiError {
  const data = (body && typeof body === 'object' ? body : {}) as { error?: unknown; message?: unknown; code?: unknown };
  const text = readable(data.error) ?? readable(data.message);
  const code = typeof data.code === 'string' ? data.code : undefined;
  if (code === 'db_outdated') return new ApiError('db_outdated', MESSAGES.dbOutdated, status, code);
  if (code === 'self_block') return new ApiError('validation', text ?? MESSAGES.selfBlock, status, code);
  switch (status) {
    case 401:
      return new ApiError('unauthorized', MESSAGES.unauthorized, status, code);
    case 403:
      return new ApiError('forbidden', text ?? MESSAGES.forbidden, status, code);
    case 404:
      return new ApiError('not_found', text ?? MESSAGES.notFound, status, code);
    case 409:
      return new ApiError('conflict', text ?? MESSAGES.conflict, status, code);
    case 400:
    case 422:
      return new ApiError('validation', text ?? MESSAGES.validation, status, code);
    case 502:
    case 503:
    case 504:
      return new ApiError('unavailable', text ?? MESSAGES.unavailable, status, code);
    default:
      return new ApiError('unknown', text ?? MESSAGES.unknown, status, code);
  }
}

/** Что угодно (исключение fetch, AbortError, ApiError, PostgrestError) → ApiError. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return new ApiError('network', MESSAGES.timeout);
  }
  if (e instanceof TypeError || (e instanceof Error && isNetworkMessage(e.message))) {
    return new ApiError('network', MESSAGES.network);
  }
  if (e && typeof e === 'object') return fromPostgrest(e as PostgrestLike);
  return new ApiError('unknown', MESSAGES.unknown);
}

/** Заголовок и описание для блока ошибки. */
export function describeError(e: ApiError): { title: string; message: string } {
  switch (e.kind) {
    case 'forbidden':
      return { title: 'Нет доступа', message: e.message };
    case 'unauthorized':
      return { title: 'Нужно войти снова', message: e.message };
    case 'network':
      return { title: 'Нет связи с сервером', message: e.message };
    case 'db_outdated':
      return { title: 'База данных не обновлена', message: e.message };
    case 'not_found':
      return { title: 'Не найдено', message: e.message };
    case 'unavailable':
      return { title: 'Сервис недоступен', message: e.message };
    default:
      return { title: 'Не удалось загрузить данные', message: e.message };
  }
}
