import { SttUnavailableError, type SttProvider } from './types';

/** Заглушка: распознавание не настроено — клиент предлагает написать текстом (экран J7). */
export const mockStt: SttProvider = {
  name: 'mock',
  async transcribe() {
    throw new SttUnavailableError();
  },
};
