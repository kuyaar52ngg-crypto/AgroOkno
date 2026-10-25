// Единый формат ошибок API: { error: "текст по-русски", code?: "..." }.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Ошибки Postgres/PostgREST (RPC с raise exception) → HTTP-статусы. */
export function fromPostgres(error: { code?: string; message: string }): HttpError {
  switch (error.code) {
    case '42501':
      return new HttpError(403, error.message);
    case '23505':
      return new HttpError(409, error.message);
    case 'P0002':
      return new HttpError(404, error.message);
    case '22023':
    case '23514':
    case '22P02':
      return new HttpError(400, error.message);
    case 'PGRST202':
    case 'PGRST205':
      // функции или таблицы нет в схеме: миграция базы данных ещё не применена
      return new HttpError(503, 'База данных ещё не обновлена до нужной версии. Обратитесь к администратору', 'db_outdated');
    default:
      return new HttpError(500, 'Не удалось выполнить запрос к базе данных');
  }
}
