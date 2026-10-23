// Расчёт обязательств, превью отчётов и сводки главного экрана из данных хозяйства.
// Чистый TS: одна и та же логика работает в приложении (офлайн) и в серверных функциях (снимок при отправке).
import type {
  DashboardSummary,
  FormCode,
  ReportObligation,
  ReportPeriod,
  ReportPreview,
  ReportPreviewRow,
  ReportStatus,
  Receipt,
} from '../data/contract';
import { authorityFor, DEADLINES, dueDate, isMonthly, plannedObligations } from './deadlines';
import { computeFermer1 } from './fermer1';
import { buildFermer3Input, computeFermer3 } from './fermer3';
import { computeFermer2 } from './fermer2';
import { fmtDayMonthShort, fmtNum, headsWord, horsesWord, monthName, monthNameLower, MONTHS_GEN } from './format';
import { computeIso1r } from './iso1r';
import { computeMinselhoz } from './minselhoz';
import {
  balanceOn,
  inRange,
  kgToLiters,
  monthEnd,
  monthStart,
  periodRange,
  round1,
  sumHeads,
  HORSES,
} from './period';
import { computeSh10 } from './sh10';
import { computeTabun1, tabunBalance } from './tabun1';
import type { FarmData, SubmissionRow } from './types';

export interface EngineCtx {
  data: FarmData;
  /** Сегодня, YYYY-MM-DD (в часовом поясе хозяйства). */
  today: string;
}

/** Сохранённая часть превью, фиксируемая при отправке отчёта. */
export interface PreviewSnapshot {
  respondent?: string;
  sections: ReportPreview['sections'];
  checks: ReportPreview['checks'];
  notes?: string[];
}

const row = (label: string, value: number | string, unit?: string): ReportPreviewRow => (unit ? { label, value, unit } : { label, value });
const headsRow = (label: string, n: number): ReportPreviewRow => row(label, n, headsWord(n));

export function findSubmission(data: FarmData, form: FormCode, period: ReportPeriod): SubmissionRow | undefined {
  return data.submissions.find(
    (s) => s.form_code === form && s.period_year === period.year && (s.period_month ?? 0) === (period.month ?? 0),
  );
}

function statusOf(sub: SubmissionRow | undefined, due: string, today: string): ReportStatus {
  if (sub?.status === 'submitted') return 'submitted';
  if (sub?.status === 'failed') return 'failed';
  if (due < today) return 'overdue';
  return sub?.status === 'draft' ? 'draft' : 'not_started';
}

export function buildObligation(ctx: EngineCtx, form: FormCode, period: ReportPeriod): ReportObligation {
  const { data, today } = ctx;
  const rule = DEADLINES[form];
  const status = data.farm.legal_status;
  const due = dueDate(form, period, status);
  const sub = findSubmission(data, form, period);
  const { authority } = authorityFor(form, status);
  let description = rule.description;
  if (form === '1-tabun' && period.month) {
    const total = computeTabun1(data, { year: period.year, month: period.month }).total;
    description = `Табунное коневодство · ${total} ${horsesWord(total)}`;
  }
  return {
    form_code: form,
    title: rule.title,
    description,
    authority,
    scope: rule.scope,
    period,
    due_on: due,
    status: statusOf(sub, due, today),
    submitted_at: sub?.status === 'submitted' ? sub.submitted_at : null,
    receipt_no: sub?.status === 'submitted' ? sub.receipt_no : null,
    // Месячные демо-версии (кроме 3-фермер (рег)) официального бланка не имеют.
    has_official_blank: rule.has_official_blank && (form === '3-fermer-month' || !isMonthly(form, status)),
  };
}


export function buildObligations(ctx: EngineCtx, year: number): ReportObligation[] {
  const planned = plannedObligations(ctx.data.farm.legal_status, year, ctx.today);
  return [...planned.federal, ...planned.regional].map((p) => buildObligation(ctx, p.form, p.period));
}

export function buildReceipt(data: FarmData, form: FormCode, period: ReportPeriod): Receipt | null {
  const sub = findSubmission(data, form, period);
  if (sub?.status !== 'submitted' || !sub.receipt_no || !sub.submitted_at) return null;
  return {
    receipt_no: sub.receipt_no,
    form_code: form,
    period,
    recipient: sub.recipient ?? authorityFor(form, data.farm.legal_status).recipient,
    submitted_at: sub.submitted_at,
  };
}

const FEED_GENITIVE: Record<string, string> = {
  hay: 'сена',
  haylage: 'сенажа',
  silage: 'силоса',
  grain: 'зерна',
  other: 'кормов',
};

function respondentOf(data: FarmData): string {
  const f = data.farm;
  return [f.name, f.settlement].filter(Boolean).join(' · ');
}

/** Превью с учётом сохранённого снимка: сданные отчёты задним числом не пересчитываются. */
export function buildPreview(ctx: EngineCtx, form: FormCode, period: ReportPeriod): ReportPreview {
  const { data } = ctx;
  const obligation = buildObligation(ctx, form, period);
  const receipt = buildReceipt(data, form, period);
  const sub = findSubmission(data, form, period);
  const snapshot = sub?.status === 'submitted' ? (sub.snapshot as PreviewSnapshot | null) : null;
  if (snapshot && Array.isArray(snapshot.sections)) {
    return {
      form_code: form,
      period,
      obligation,
      sections: snapshot.sections,
      checks: snapshot.checks ?? [],
      respondent: snapshot.respondent ?? respondentOf(data),
      notes: snapshot.notes,
      receipt,
    };
  }
  const computed = computePreviewBody(ctx, form, period);
  return { form_code: form, period, obligation, receipt, respondent: respondentOf(data), ...computed };
}

export const toSnapshot = (preview: ReportPreview): PreviewSnapshot => ({
  respondent: preview.respondent,
  sections: preview.sections,
  checks: preview.checks,
  notes: preview.notes,
});

type Body = Pick<ReportPreview, 'sections' | 'checks'> & Partial<Pick<ReportPreview, 'notes' | 'respondent'>>;

function computePreviewBody(ctx: EngineCtx, form: FormCode, period: ReportPeriod): Body {
  const { data, today } = ctx;
  const month = period.month ?? 0;
  switch (form) {
    case '1-tabun':
      return tabunBody(ctx, period);
    case '10-sh':
      return sh10Body(ctx, period);
    case '1-iso-r': {
      const range = periodRange(period);
      const on = range.to > today && range.from <= today ? today : range.to;
      const iso = computeIso1r(data.movements, on);
      const items: [string, number][] = [
        ['Коровы', iso.cows],
        ['Телята', iso.calves],
        ['Лошади', iso.horses],
        ['Овцы', iso.sheep],
      ];
      const extras: [string, number][] = [
        ['КРС прочие', iso.cattleOther],
        ['Козы', iso.goats],
        ['Свиньи', iso.pigs],
        ['Олени', iso.deer],
        ['Птица', iso.poultry],
        ['Кролики', iso.rabbits],
      ];
      for (const e of extras) if (e[1] > 0) items.push(e);
      const formula = items.map(([, n]) => n).join(' + ');
      return {
        sections: [
          {
            title: 'Автозаполненные данные',
            rows: [...items.map(([label, n]) => headsRow(label, n)), headsRow('Всего животных', iso.total)],
          },
        ],
        checks: [
          { label: `Сумма по группам: ${formula} = ${iso.total}`, ok: iso.groupSum === iso.total },
          { label: 'Сведения совпадают с книгой ЛПХ', ok: iso.total === sumHeads(balanceOn(data.movements, on)) },
        ],
      };
    }
    case '3-fermer-month':
      return fermer3MonthBody(ctx, period);
    case '3-fermer':
      return fermer3YearBody(ctx, period);
    case '1-ip':
      if (data.farm.legal_status === 'lph' && month) return ipDemoBody(ctx, period);
      return minselhozBody(ctx, period, 'Показатели 1-ИП');
    case '1-kfh':
      return minselhozBody(ctx, period, 'Показатели 1-КФХ');
    case '1-fermer':
      return fermer1Body(ctx, period);
    case '2-fermer':
      return fermer2Body(ctx, period);
  }
}

function tabunBody(ctx: EngineCtx, period: ReportPeriod): Body {
  const h = computeTabun1(ctx.data, { year: period.year, month: period.month ?? 1 });
  const bal = tabunBalance(h);
  const rows = [headsRow('На начало периода', h.opening)];
  rows.push(headsRow('Родилось', h.born));
  if (h.purchased) rows.push(headsRow('Куплено', h.purchased));
  rows.push(headsRow('Пало', h.died), headsRow('Забито', h.slaughtered));
  if (h.sold) rows.push(headsRow('Продано', h.sold));
  rows.push(headsRow('На конец периода', h.total));
  return {
    sections: [
      { title: 'Движение табуна', rows },
      {
        title: 'Состав табуна',
        rows: [headsRow('Кобылы', h.mares), headsRow('Молодняк до 3 лет', h.young), headsRow('Взрослые жеребцы', h.stallions)],
      },
    ],
    checks: [{ label: `Баланс сходится: ${bal.formula}. Все движения уже учтены в журнале.`, ok: bal.ok }],
  };
}

function sh10Body(ctx: EngineCtx, period: ReportPeriod): Body {
  const month = period.month ?? 1;
  const r = computeSh10(ctx.data, { year: period.year, month });
  const rows: ReportPreviewRow[] = [row('Сено', fmtNum(r.hay, 1), 'т'), row('Сенаж', fmtNum(r.haylage, 1), 'т')];
  if (r.silage) rows.push(row('Силос', fmtNum(r.silage, 1), 'т'));
  rows.push(row('Зерно на корм', fmtNum(r.grain, 1), 'т'));
  if (r.other) rows.push(row('Прочие корма', fmtNum(r.other, 1), 'т'));
  rows.push(row('Всего, натуральный вес', fmtNum(r.total, 1), 'т'));

  const end = monthEnd(period.year, month);
  const later = ctx.data.feed
    .filter((f) => f.operation === 'harvest' && f.occurred_on > end && f.occurred_on <= ctx.today)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    .slice(0, 3);
  const notes: string[] = [];
  if (later.length > 0) {
    const text = later.map((f) => `${fmtNum(f.quantity_t, 1)} т ${FEED_GENITIVE[f.feed]} от ${fmtDayMonthShort(f.occurred_on)}`).join(', ');
    notes.push(`Сохраненная версия на дату сдачи. Заготовка ${text} относится к следующему периоду и здесь не учтена.`);
  }
  return { sections: [{ title: 'Заготовка кормов', rows }], checks: [], notes };
}

function fermer3MonthBody(ctx: EngineCtx, period: ReportPeriod): Body {
  const { data, today } = ctx;
  const month = period.month ?? 1;
  const range = periodRange(period);
  const b = balanceOn(data.movements, range.to);
  const milkKg = data.outputs.filter((o) => o.product === 'milk' && inRange(o.occurred_on, range)).reduce((s, o) => s + o.quantity, 0);
  const mName = monthNameLower(month);
  const rows: ReportPreviewRow[] = [
    headsRow('Коровы на конец периода', b.cattle_cows ?? 0),
    headsRow('Телята', (b.cattle_calves ?? 0) + (b.cattle_other ?? 0)),
    headsRow('Лошади', sumHeads(b, HORSES)),
    headsRow('Овцы', b.sheep ?? 0),
  ];
  if (b.goats) rows.push(headsRow('Козы', b.goats));
  const pigs = (b.pigs_sows ?? 0) + (b.pigs_other ?? 0);
  if (pigs) rows.push(headsRow('Свиньи', pigs));
  rows.push(row(`Надой за ${mName}`, fmtNum(kgToLiters(milkKg)), 'л'));

  const notes: string[] = [];
  const sub = findSubmission(data, '3-fermer-month', period);
  const curMonth = Number(today.slice(5, 7));
  const curYear = Number(today.slice(0, 4));
  if (sub?.status === 'submitted' && (period.year < curYear || month < curMonth)) {
    const cur = { from: monthStart(curYear, curMonth), to: monthEnd(curYear, curMonth) };
    const curMilk = kgToLiters(data.outputs.filter((o) => o.product === 'milk' && inRange(o.occurred_on, cur)).reduce((s, o) => s + o.quantity, 0));
    const curHorses = sumHeads(balanceOn(data.movements, cur.to), HORSES);
    notes.push(
      `Учебные данные прошлого периода. Надой ${fmtNum(curMilk)} л и ${curHorses} ${horsesWord(curHorses)} из текущего ${MONTHS_GEN[curMonth - 1]} не заменят сохраненную версию этого отчета.`,
    );
  }
  return { sections: [{ title: `Показатели за ${mName}`, rows }], checks: [], notes };
}

function fermer3YearBody(ctx: EngineCtx, period: ReportPeriod): Body {
  const result = computeFermer3(buildFermer3Input(ctx.data, period));
  const heads = (label: string, key: string): ReportPreviewRow[] => (result.herd[key] ? [headsRow(label, result.herd[key])] : []);
  const qty = (label: string, v: number | undefined, unit: string): ReportPreviewRow[] => (v ? [row(label, fmtNum(v, 1), unit)] : []);
  return {
    sections: [
      {
        title: 'Поголовье на конец года',
        rows: [
          ...heads('Крупный рогатый скот', '21'),
          ...heads('в том числе коровы', '22'),
          ...heads('Свиньи', '25'),
          ...heads('Овцы', '26'),
          ...heads('Козы', '28'),
          ...heads('Лошади', '30'),
          ...heads('Птица', '31'),
          ...heads('Олени', '34'),
          ...heads('Кролики', '36'),
        ],
      },
      {
        title: 'Произведено',
        rows: [
          ...qty('Скот и птица на убой (в живом весе)', result.produced['01'], 'ц'),
          ...qty('Молоко', result.produced['08'], 'ц'),
          ...qty('Яйца', result.produced['12'], 'тыс. шт.'),
          ...qty('Шерсть', result.produced['14'], 'ц'),
          ...qty('Мёд', result.produced['16'], 'кг'),
        ],
      },
      {
        title: 'Реализовано',
        rows: [
          ...qty('Скот и птица (в живом весе)', result.sold['50'], 'ц'),
          ...qty('Молоко', result.sold['56'], 'ц'),
          ...qty('Яйца', result.sold['57'], 'тыс. шт.'),
          ...qty('Шерсть', result.sold['58'], 'ц'),
        ],
      },
    ].filter((s) => s.rows.length > 0),
    checks: [],
    notes: ['Заполненный бланк 3-фермер можно скачать в формате XLSX.'],
  };
}

function ipDemoBody(ctx: EngineCtx, period: ReportPeriod): Body {
  const { data } = ctx;
  const range = periodRange(period);
  const revenue =
    data.sales.filter((s) => inRange(s.occurred_on, range)).reduce((s, x) => s + (x.amount_rub ?? 0), 0) +
    data.movements
      .filter((m) => (m.kind === 'sale' || m.kind === 'sale_slaughter') && inRange(m.occurred_on, range))
      .reduce((s, m) => s + (m.amount_rub ?? 0), 0);
  const workers = data.members.filter((m) => !m.is_head).length;
  return {
    respondent: `ИП «Учебный респондент» · ${data.farm.settlement ?? ''}`.trim(),
    sections: [
      {
        title: 'ИП «Учебный респондент»',
        description: `ИНН ${data.farm.inn ?? '—'} · учебный пример\nРеспондент КФХ / ИП в том же демонстрационном рабочем пространстве.`,
        rows: [],
      },
      {
        title: 'Показатели деятельности',
        rows: [row('Вид деятельности', 'Сельское хозяйство'), row('Работники', workers, 'чел.'), row('Выручка за период', fmtNum(round1(revenue / 1000), 1), 'тыс. ₽')],
      },
    ],
    checks: [],
    notes: [`Не является обязанностью любого ЛПХ. Форма показана для отдельного учебного респондента КФХ / ИП, а не для статуса ${data.farm.name}.`],
  };
}

function minselhozBody(ctx: EngineCtx, period: ReportPeriod, title: string): Body {
  const r = computeMinselhoz(ctx.data, period.year);
  const income = r.income['1100'];
  const crops = (code: string, label: string): ReportPreviewRow[] =>
    r.crops[code]?.produced_c ? [row(label, fmtNum(r.crops[code].produced_c, 1), 'ц')] : [];
  const live = (code: string, label: string, unit = 'ц'): ReportPreviewRow[] =>
    r.livestock[code]?.produced_c ? [row(label, fmtNum(r.livestock[code].produced_c, 1), unit)] : [];
  const headRows = (code: string, label: string): ReportPreviewRow[] =>
    r.heads[code]?.end ? [headsRow(label, r.heads[code].end)] : [];
  const cattleBlock = r.dairy ? '621' : '622';
  return {
    sections: [
      {
        title: `${title} за ${period.year} год`,
        rows: [row('Доходы от реализации продукции', fmtNum(income.cur, 1), 'тыс. ₽'), row(`Доходы за ${period.year - 1} год`, fmtNum(income.prev, 1), 'тыс. ₽')],
      },
      {
        title: 'Растениеводство · произведено',
        rows: [
          ...crops('5110', 'Зерновые и зернобобовые'),
          ...crops('5153', 'Картофель'),
          ...crops('5151', 'Овощи открытого грунта'),
          ...crops('5162', 'Сено'),
          ...crops('5163', 'Зелёная масса, сенаж, силос'),
        ],
      },
      {
        title: 'Животноводство · произведено',
        rows: [
          ...live('6110', 'Скот и птица в живой массе'),
          ...live('6120', 'Молоко сырое'),
          ...live('6130', 'Яйца', 'тыс. шт.'),
          ...live('6140', 'Шерсть'),
        ],
      },
      {
        title: 'Поголовье на конец года',
        rows: [
          ...headRows(`${cattleBlock}0`, 'Крупный рогатый скот'),
          ...headRows('6230', 'Свиньи'),
          ...headRows('6240', 'Овцы'),
          ...headRows('6250', 'Козы'),
          ...headRows('6290', 'Лошади'),
          ...headRows('6260', 'Птица'),
        ],
      },
    ].filter((s) => s.rows.length > 0),
    checks: [],
    notes: ['Заполненный бланк можно скачать в формате XLSX. Разделы расходов и задолженности заполняются вручную.'],
  };
}

const FERMER1_LABELS: Record<string, string> = {
  '1': 'Посеяно озимых осенью прошлого года',
  '2': 'в том числе озимая пшеница на зерно',
  '3': 'прочие озимые зерновые',
  '7': 'Сохранилось озимых к концу сева яровых',
  '8': 'Яровая пшеница',
  '9': 'Прочие яровые зерновые и зернобобовые',
  '10': 'Яровые зерновые и зернобобовые — всего',
  '11': 'Подсолнечник на зерно',
  '12': 'Рапс',
  '14': 'Сахарная свекла',
  '15': 'Лен-долгунец',
  '16': 'Прочие технические культуры',
  '17': 'Технические культуры — всего',
  '18': 'Картофель',
  '19': 'Овощи открытого грунта',
  '20': 'Овощи — всего',
  '21': 'Бахчевые продовольственные культуры',
  '23': 'Кормовые культуры (кроме многолетних трав)',
  '24': 'Многолетние травы прошлых лет (укосная площадь)',
  '25': 'Кормовые культуры — всего',
  '26': 'Всего посеяно озимых и яровых под урожай',
};

function fermer1Body(ctx: EngineCtx, period: ReportPeriod): Body {
  const { lines } = computeFermer1(ctx.data, period.year);
  const rows = Object.keys(FERMER1_LABELS)
    .filter((k) => lines[k])
    .map((k) => row(FERMER1_LABELS[k], fmtNum(lines[k], 2), 'га'));
  return { sections: [{ title: `Итоги сева под урожай ${period.year} года`, rows }], checks: [] };
}

const FERMER2_LABELS: Record<string, string> = {
  '1140': 'Зерновые и зернобобовые — всего',
  '1104': 'Пшеница озимая',
  '1110': 'Пшеница яровая',
  '1112': 'Ячмень яровой',
  '1113': 'Овёс',
  '1121': 'Гречиха',
  '1238': 'Технические культуры',
  '1218': 'Подсолнечник на зерно',
  '1301': 'Картофель',
  '1302': 'Овощи открытого грунта',
  '1320': 'Бахчевые продовольственные культуры',
  '1434': 'Кормовые культуры — всего',
  '1501': 'Естественные сенокосы · сено',
  '1502': 'Естественные сенокосы · зелёная масса, сенаж',
};

function fermer2Body(ctx: EngineCtx, period: ReportPeriod): Body {
  const { lines } = computeFermer2(ctx.data, period.year);
  const rows: ReportPreviewRow[] = [];
  for (const [code, label] of Object.entries(FERMER2_LABELS)) {
    const l = lines[code];
    if (!l) continue;
    const area = l.harvested_ha ? ` · ${fmtNum(l.harvested_ha, 2)} га` : '';
    rows.push(row(`${label}${area}`, fmtNum(l.gross_c, 1), 'ц'));
  }
  return {
    sections: [{ title: `Сбор урожая за ${period.year} год`, rows }],
    checks: [],
    notes: ['Показан валовой сбор в первоначально оприходованном весе, ц.'],
  };
}

/** Сводка главного экрана. updated_at заполняет слой данных (время последней синхронизации). */
export function buildDashboard(ctx: EngineCtx): Omit<DashboardSummary, 'updated_at'> {
  const { data, today } = ctx;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const obligations = buildObligations(ctx, year);
  const federal = obligations.filter((o) => o.scope === 'federal');
  const regional = obligations.filter((o) => o.scope === 'regional');
  const range = { from: monthStart(year, month), to: monthEnd(year, month) };
  const milkKg = data.outputs.filter((o) => o.product === 'milk' && inRange(o.occurred_on, range)).reduce((s, o) => s + o.quantity, 0);
  const b = balanceOn(data.movements, today);
  return {
    month_label: `${monthName(month)} ${year}`,
    federal: { submitted: federal.filter((o) => o.status === 'submitted').length, total: federal.length },
    regional: { overdue: regional.filter((o) => o.status === 'overdue').length, total: regional.length },
    milk_month_l: kgToLiters(milkKg),
    household: data.farm.legal_status === 'lph' ? { name: data.farm.name, cows: b.cattle_cows ?? 0, horses: sumHeads(b, HORSES) } : null,
  };
}

