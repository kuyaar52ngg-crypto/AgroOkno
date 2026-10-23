/** Провайдер распознавания речи (ru-RU). */
export interface SttProvider {
  readonly name: 'mock' | 'yandex' | 'openai';
  transcribe(audio: Buffer, mimeType: string, filename?: string): Promise<string>;
}

/** Распознавание не настроено / недоступно → 503 с понятным текстом. */
export class SttUnavailableError extends Error {
  readonly status = 503;
  constructor(message = 'Распознавание речи не настроено — напишите текстом') {
    super(message);
  }
}

/** Формат записи не подходит выбранному провайдеру → 415. */
export class SttFormatError extends Error {
  readonly status = 415;
}

/** Ошибка внешнего провайдера → 502. */
export class SttProviderError extends Error {
  readonly status = 502;
}
