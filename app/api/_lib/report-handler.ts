/// <reference types="node" />
// Общий обработчик «GET /api/reports/<форма>?farm_id=…&year=…[&month=…]» для форм с официальным бланком.
// Данные читаются от имени пользователя, поэтому RLS не даст выгрузить чужое хозяйство.
import type { FormCode } from '../../src/data/contract';
import { computeFermer1 } from '../../src/reports/fermer1';
import { computeFermer2 } from '../../src/reports/fermer2';
import { buildFermer3Input, computeFermer3 } from '../../src/reports/fermer3';
import { computeIp1 } from '../../src/reports/ip1';
import { computeKfh1 } from '../../src/reports/kfh1';
import {
  ApiError,
  bearerToken,
  guard,
  loadFarmData,
  parseFarmId,
  parsePeriod,
  userClient,
  xlsxResponse,
} from './context';
import { renderFermer1Xlsx } from './fermer1-xlsx';
import { renderFermer2Xlsx } from './fermer2-xlsx';
import { renderFermer3Xlsx } from './fermer3-xlsx';
import { renderMinselhozXlsx } from './minselhoz-xlsx';
import type { HeaderInfo } from './xlsx-helpers';

type Handler = (request: Request) => Promise<Response>;

export function xlsxReport(form: FormCode): Handler {
  return (request) =>
    guard(async () => {
      const url = new URL(request.url);
      const farmId = parseFarmId(url);
      const period = parsePeriod(url);
      if (form === '3-fermer-month' && !period.month) throw new ApiError(400, 'Для ежемесячной формы укажите month');
      if (['1-fermer', '2-fermer', '1-kfh', '1-ip'].includes(form) && period.month) {
        throw new ApiError(400, 'Эта форма годовая: параметр month не нужен');
      }

      const supabase = userClient(bearerToken(request));
      const data = await loadFarmData(supabase, farmId);
      const farm = data.farm;
      const header: HeaderInfo = {
        farmName: farm.name,
        address: [farm.region, farm.settlement, farm.address].filter(Boolean).join(', ') || null,
        okpo: farm.okpo,
        inn: farm.inn,
        headName: farm.head_name,
        headPosition: farm.legal_status === 'kfh' ? 'Глава КФХ' : farm.legal_status === 'ip' ? 'Индивидуальный предприниматель' : 'Глава ЛПХ',
        compiledOn: new Date(),
      };
      const suffix = `${period.year}${period.month ? `-${String(period.month).padStart(2, '0')}` : ''}`;

      switch (form) {
        case '3-fermer':
        case '3-fermer-month': {
          const result = computeFermer3(buildFermer3Input(data, period));
          const file = await renderFermer3Xlsx(result, {
            farmName: header.farmName,
            address: header.address,
            okpo: header.okpo,
            headName: header.headName,
            headPosition: header.headPosition,
            period,
            compiledOn: header.compiledOn,
          });
          return xlsxResponse(file, `3-fermer_${suffix}.xlsx`);
        }
        case '1-fermer':
          return xlsxResponse(await renderFermer1Xlsx(computeFermer1(data, period.year), period.year, header), `1-fermer_${suffix}.xlsx`);
        case '2-fermer':
          return xlsxResponse(await renderFermer2Xlsx(computeFermer2(data, period.year), period.year, header), `2-fermer_${suffix}.xlsx`);
        case '1-kfh':
          return xlsxResponse(await renderMinselhozXlsx('kfh', computeKfh1(data, period.year), header), `1-kfh_${suffix}.xlsx`);
        case '1-ip':
          return xlsxResponse(await renderMinselhozXlsx('ip', computeIp1(data, period.year), header), `1-ip_${suffix}.xlsx`);
        default:
          throw new ApiError(404, 'У этой формы нет официального бланка');
      }
    });
}
