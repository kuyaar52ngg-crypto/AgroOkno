// Единая точка доступа к API. В режиме заглушек (VITE_MOCK=1 / npm run dev:mock) подключается src/api/mock.ts;
// в обычной сборке условие вычисляется на этапе сборки и файл заглушек в бандл не попадает.
import { realApi } from './real';
import type { AdminApi } from './types';

async function load(): Promise<AdminApi> {
  if (import.meta.env.VITE_MOCK === '1') {
    return (await import('./mock')).mockApi;
  }
  return realApi;
}

export const api: AdminApi = await load();

export { ApiError, describeError, toApiError } from './errors';
export type * from './types';
