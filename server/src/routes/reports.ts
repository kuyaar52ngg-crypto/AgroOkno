// Адаптер существующих обработчиков app/api/** (Web-стандарт GET/POST(request): Response) — без дублирования кода.
// Каждый маршрут доступен по двум путям: /v1/<путь> и совместимому /api/<путь> (его используют ссылки приложения и Vercel).
import type { FastifyPluginAsync } from 'fastify';

import { GET as household } from '../../../app/api/household/extract';
import { POST as mercurySync } from '../../../app/api/mercury/sync';
import { GET as receipt } from '../../../app/api/receipts/[no]';
import { GET as r1fermer } from '../../../app/api/reports/1-fermer';
import { GET as r1ip } from '../../../app/api/reports/1-ip';
import { GET as r1kfh } from '../../../app/api/reports/1-kfh';
import { GET as r2fermer } from '../../../app/api/reports/2-fermer';
import { GET as r3fermer } from '../../../app/api/reports/3-fermer';
import { GET as r3fermerMonth } from '../../../app/api/reports/3-fermer-month';
import { POST as submit } from '../../../app/api/reports/submit';
import { webHandler, type WebHandler } from '../adapter';

interface Route {
  method: 'GET' | 'POST';
  path: string;
  handler: WebHandler;
  summary: string;
}

export const REPORT_ROUTES: Route[] = [
  { method: 'GET', path: '/reports/3-fermer', handler: r3fermer, summary: 'XLSX 3-фермер' },
  { method: 'GET', path: '/reports/3-fermer-month', handler: r3fermerMonth, summary: 'XLSX 3-фермер (рег, ежемесячная)' },
  { method: 'GET', path: '/reports/1-fermer', handler: r1fermer, summary: 'XLSX 1-фермер' },
  { method: 'GET', path: '/reports/2-fermer', handler: r2fermer, summary: 'XLSX 2-фермер' },
  { method: 'GET', path: '/reports/1-kfh', handler: r1kfh, summary: 'XLSX 1-КФХ' },
  { method: 'GET', path: '/reports/1-ip', handler: r1ip, summary: 'XLSX 1-ИП' },
  { method: 'POST', path: '/reports/submit', handler: submit, summary: 'Демо-отправка отчёта, квитанция' },
  { method: 'GET', path: '/receipts/:no', handler: receipt, summary: 'PDF квитанции' },
  { method: 'GET', path: '/household/extract', handler: household, summary: 'PDF выписки из похозяйственной книги' },
  { method: 'POST', path: '/mercury/sync', handler: mercurySync, summary: 'Демо-синхронизация «Меркурия»' },
];

export const reportRoutes = (): FastifyPluginAsync => async (app) => {
  for (const route of REPORT_ROUTES) {
    const handler = webHandler(route.handler);
    for (const prefix of ['/v1', '/api']) {
      app.route({
        method: route.method,
        url: `${prefix}${route.path}`,
        schema: { tags: ['reports'], summary: route.summary, security: [{ bearer: [] }], hide: prefix === '/api' },
        handler,
      });
    }
  }
};
