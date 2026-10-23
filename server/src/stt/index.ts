import type { Env } from '../env';
import { mockStt } from './mock';
import { createOpenAiStt } from './openai';
import type { SttProvider } from './types';
import { createYandexStt } from './yandex';

export * from './types';

/** Выбор провайдера по STT_PROVIDER. */
export function createSttProvider(env: Env): SttProvider {
  switch (env.STT_PROVIDER) {
    case 'yandex':
      return createYandexStt({ apiKey: env.YANDEX_API_KEY!, folderId: env.YANDEX_FOLDER_ID! });
    case 'openai':
      return createOpenAiStt({ apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_STT_MODEL });
    default:
      return mockStt;
  }
}
