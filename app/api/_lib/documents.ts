/// <reference types="node" />
// Содержимое PDF: учебная квитанция об отправке отчёта и выписка из похозяйственной книги.
import type { Farm, FormCode, ReportPeriod } from '../../src/data/contract';
import { DEADLINES } from '../../src/reports/deadlines';
import { fmtDate, fmtNum, headsWord, monthName } from '../../src/reports/format';
import { pendingHorriotSources, reconcileHorriot } from '../../src/reports/horriot';
import { balanceOn, HORSES, PIGS, sumHeads } from '../../src/reports/period';
import type { FarmData } from '../../src/reports/types';
import { createPdf, finish, heading, pair, paragraph, sectionTitle, subtitle, table, type PdfCtx } from './pdf';

/** Дата и время в часовом поясе хозяйства (Якутск, UTC+9): «23.10.2026, 09:41». */
export function fmtYakutsk(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const periodLabel = (p: ReportPeriod) => (p.month ? `${monthName(p.month)} ${p.year}` : `${p.year} год`);

export interface ReceiptInfo {
  receipt_no: string;
  form_code: FormCode;
  period: ReportPeriod;
  recipient: string;
  submitted_at: string;
  farm_name: string;
}

export async function buildReceiptPdf(r: ReceiptInfo): Promise<Buffer> {
  const ctx = await createPdf(`Квитанция ${r.receipt_no}`);
  heading(ctx, 'Учебная квитанция');
  subtitle(ctx, 'Подтверждение приёма отчёта (демонстрационный режим)');
  pair(ctx, 'Номер квитанции', r.receipt_no);
  pair(ctx, 'Получатель', r.recipient);
  pair(ctx, 'Форма', DEADLINES[r.form_code].title.replace('Форма ', ''));
  pair(ctx, 'Отчётный период', periodLabel(r.period));
  pair(ctx, 'Хозяйство', r.farm_name);
  pair(ctx, 'Дата и время отправки', fmtYakutsk(r.submitted_at));
  ctx.y -= 12;
  paragraph(
    ctx,
    'Квитанция сформирована приложением «АгроОкно» в учебных целях. Отчёт в ведомство фактически не передавался: внешних интеграций нет. Документ не имеет юридической силы.',
    { muted: true, size: 10.5 },
  );
  return finish(ctx);
}

const headsLine = (n: number) => `${fmtNum(n)} ${headsWord(n)}`;

/** Расхождение со знаком: «+3» (не передано в Хорриот), «−2» (в Хорриоте больше), «0». */
const signed = (n: number) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));

/** Раздел выписки «Хорриот»: статус подключения, дата синхронизации и сверка книги с учебными записями по группам. */
function addHorriotSection(ctx: PdfCtx, data: FarmData, today: string): void {
  const info = data.horriot!;
  sectionTitle(ctx, 'Сведения ФГИС ВетИС «Хорриот» (учебные)');
  pair(ctx, 'Статус подключения', info.status === 'connected_demo' ? 'Подключено (учебный режим)' : 'Не подключено');
  pair(ctx, 'Дата синхронизации', info.synced_at ? fmtYakutsk(info.synced_at) : '—');
  const registered = new Set(info.records.map((r) => r.source_movement_id).filter((id): id is string => !!id));
  const pending = pendingHorriotSources(
    data.movements.map((m) => ({ id: m.id ?? '', occurred_on: m.occurred_on, animal_group: m.animal_group, kind: m.kind, heads: m.heads })),
    registered,
  ).length;
  pair(ctx, 'Записей в «Хорриоте»', fmtNum(info.records.length));

  const rec = reconcileHorriot(data.movements, info.records, today);
  if (rec.length === 0) {
    paragraph(ctx, 'Поголовья для сверки нет: в книге и в «Хорриоте» нет животных.', { size: 10.5, muted: true });
  } else {
    paragraph(ctx, `Сверка «книга ЛПХ — Хорриот» на ${fmtDate(today)}, голов:`, { size: 11 });
    const body = rec.map((r) => [r.label, fmtNum(r.book_heads), fmtNum(r.horriot_heads), signed(r.diff)]);
    const sum = (pick: (r: (typeof rec)[number]) => number) => rec.reduce((s, r) => s + pick(r), 0);
    body.push(['Всего', fmtNum(sum((r) => r.book_heads)), fmtNum(sum((r) => r.horriot_heads)), signed(sum((r) => r.diff))]);
    table(
      ctx,
      [
        { title: 'Группа', width: 0.4 },
        { title: 'Книга', width: 0.18, align: 'right' },
        { title: 'Хорриот', width: 0.2, align: 'right' },
        { title: 'Расхождение', width: 0.22, align: 'right' },
      ],
      body,
      { totalRow: true },
    );
    const mismatch = rec.filter((r) => r.diff !== 0).length;
    const note = mismatch === 0 ? 'Расхождений нет: данные книги и «Хорриота» совпадают.' : `Групп с расхождением: ${mismatch}. Передайте данные в «Хорриот» в приложении.`;
    paragraph(ctx, pending > 0 ? `${note} Записей журнала не передано: ${fmtNum(pending)}.` : note, { size: 10.5 });
  }
  paragraph(
    ctx,
    'Учебный режим: реальной интеграции с ФГИС ВетИС нет. Расхождение = книга − Хорриот.',
    { muted: true, size: 10 },
  );
}

export async function buildExtractPdf(data: FarmData, today: string): Promise<Buffer> {
  const farm: Farm = data.farm;
  const ctx = await createPdf('Выписка из похозяйственной книги');
  heading(ctx, 'Выписка из похозяйственной книги', 18);
  subtitle(ctx, `Запись № ${farm.book_record_no ?? '—'} · ${fmtDate(today)}`);

  sectionTitle(ctx, farm.name);
  paragraph(ctx, [farm.region, farm.settlement, farm.address].filter(Boolean).join(', ') || 'Адрес не указан');
  if (farm.plot_area_m2) pair(ctx, 'Участок', `${fmtNum(farm.plot_area_m2)} кв.м`);
  if (farm.cadastral_no) paragraph(ctx, `Кадастровый номер: ${farm.cadastral_no}`, { size: 10.5, muted: true });

  const members = [...data.members].sort((a, b) => Number(b.is_head) - Number(a.is_head));
  sectionTitle(ctx, `Члены хозяйства · ${members.length} ${members.length === 1 ? 'человек' : 'человека'}`);
  for (const m of members) paragraph(ctx, `${m.full_name} — ${m.is_head ? 'глава ЛПХ' : 'член ЛПХ'}`, { size: 11 });

  const b = balanceOn(data.movements, today);
  sectionTitle(ctx, `Поголовье на ${fmtDate(today)}`);
  const rows: [string, number][] = [
    ['Коровы', b.cattle_cows ?? 0],
    ['Телята', b.cattle_calves ?? 0],
    ['КРС прочие', b.cattle_other ?? 0],
    ['Лошади', sumHeads(b, HORSES)],
    ['Овцы', b.sheep ?? 0],
    ['Козы', b.goats ?? 0],
    ['Свиньи', sumHeads(b, PIGS)],
    ['Олени', b.deer ?? 0],
    ['Птица', b.poultry ?? 0],
    ['Кролики', b.rabbits ?? 0],
  ];
  const core = new Set(['Коровы', 'Телята', 'Лошади', 'Овцы']);
  let total = 0;
  for (const [label, n] of rows) {
    total += n;
    if (n > 0 || core.has(label)) pair(ctx, label, headsLine(n));
  }
  pair(ctx, 'Всего', headsLine(total));

  if (data.horriot) addHorriotSection(ctx, data, today);

  ctx.y -= 8;
  paragraph(
    ctx,
    'Сведения сформированы из демонстрационной записи хозяйства. Документ не имеет юридической силы, без официальной подписи, печати и QR-кода.',
    { muted: true, size: 10.5 },
  );
  return finish(ctx);
}
