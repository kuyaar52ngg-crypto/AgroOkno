// Общие ответы помощника (одинаковые для Claude и правил): карточки сроков, «как подготовить отчёт»,
// подтверждение разобранного события. Тексты — по макету J1–J6.
import { headsWord, plural } from '../../../app/src/reports/format';
import { kgToLiters } from '../../../app/src/reports/period';
import { fmtDayMonth, monthDeadline } from './ru';
import type { AssistantContext, ChatCard, EngineOutput, NewEvent } from './types';

export const GROUP_LABEL: Record<string, string> = {
  cattle_cows: 'Коровы', cattle_calves: 'Телята', cattle_other: 'КРС прочие', pigs_sows: 'Свиноматки', pigs_other: 'Свиньи',
  sheep: 'Овцы', goats: 'Козы', horses_mares: 'Кобылы', horses_young: 'Молодняк лошадей', horses_stallions: 'Жеребцы',
  horses_other: 'Лошади', deer: 'Олени', poultry: 'Птица', rabbits: 'Кролики',
};

const KIND_LABEL: Record<string, string> = {
  birth: 'приплод', death: 'падёж', slaughter: 'забой', sale: 'продажу', sale_slaughter: 'продажу на убой',
  purchase: 'покупку', transfer_in: 'перевод', transfer_out: 'перевод',
};

export const PRODUCT_LABEL: Record<string, { out: string; sale: string; unit: string }> = {
  milk: { out: 'надой', sale: 'продажу молока', unit: 'л' },
  eggs: { out: 'сбор яиц', sale: 'продажу яиц', unit: 'шт' },
  wool: { out: 'сбор шерсти', sale: 'продажу шерсти', unit: 'кг' },
  honey: { out: 'сбор мёда', sale: 'продажу мёда', unit: 'кг' },
};

const FEED_LABEL: Record<string, string> = { hay: 'сено', haylage: 'сенаж', silage: 'силос', grain: 'зерно', other: 'корма' };
const FEED_OP: Record<string, string> = { harvest: 'заготовку', purchase: 'покупку', use: 'расход' };

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** «Сохранил надой: 120 л за 23 октября» — текст подтверждения по событию. */
export function describeEvent(e: NewEvent): string {
  const when = fmtDayMonth(e.occurred_on);
  switch (e.type) {
    case 'product_output': {
      const p = PRODUCT_LABEL[e.product]!;
      const qty = e.product === 'milk' ? `${kgToLiters(e.quantity)} л` : `${fmt(e.quantity)} ${p.unit}`;
      return `Сохранил ${p.out}: ${qty} за ${when}`;
    }
    case 'product_sale': {
      const p = PRODUCT_LABEL[e.product]!;
      const qty = e.product === 'milk' ? `${kgToLiters(e.quantity)} л` : `${fmt(e.quantity)} ${p.unit}`;
      return `Сохранил ${p.sale}: ${qty}${e.amount_rub ? ` на ${fmt(e.amount_rub)} ₽` : ''} за ${when}`;
    }
    case 'livestock':
      return `Сохранил ${KIND_LABEL[e.kind] ?? 'событие'}: ${e.heads} ${headsWord(e.heads)} · ${GROUP_LABEL[e.animal_group] ?? e.animal_group}${
        e.amount_rub ? ` на ${fmt(e.amount_rub)} ₽` : ''
      } за ${when}`;
    case 'feed':
      return `Сохранил ${FEED_OP[e.operation]}: ${FEED_LABEL[e.feed]} ${fmt(e.quantity_t)} т за ${when}`;
    case 'crop':
      return `Сохранил запись по культуре «${e.crop}» (${e.plot_name}) за ${when}`;
  }
}

export const GREETING = (name: string | null) =>
  `Здравствуйте${name ? `, ${name}` : ''}! Скажите: «Сегодня коровы дали 120 литров молока». Я запишу надой в журнал.`;

export const HELP_TEXT =
  'Я помогаю с отчетами и сроками и записываю события со слов: надой, приплод, падёж, забой, продажу. ' +
  'Например: «Сегодня коровы дали 120 литров молока» или «Какие отчеты скоро сдавать?».';

export const MILK_CLARIFY = 'Сколько литров молока получили сегодня? Пока ничего не сохранил. Напишите количество — и я запишу надой в журнал.';

export const clarification = (text: string): EngineOutput => ({ text, proposed_events: [], needs_clarification: true });

export const HOW_TO_STEPS = ['Откройте черновик отчета.', 'Проверьте период, цифры и получателя.', 'Подтвердите отправку в самом отчете.'];

export const howToCard = (title = 'Как подготовить отчет'): ChatCard => ({ kind: 'how_to', title, steps: HOW_TO_STEPS });

/** Ответ «Какие отчеты скоро сдавать?» (J6): ближайшие сроки, просрочки и памятка. */
export function reportStatusAnswer(context: AssistantContext, userText = '', formCodes?: string[]): EngineOutput {
  let list = context.deadlines;
  if (formCodes?.length) list = list.filter((d) => formCodes.includes(d.form_code));
  const monthLimit = monthDeadline(userText.toLowerCase());
  if (monthLimit) {
    const year = Number(context.today.slice(0, 4));
    const end = `${year}-${String(monthLimit).padStart(2, '0')}-31`;
    list = list.filter((d) => d.days_left < 0 || d.due_on <= end);
  }
  list = list.slice(0, 6);
  const farmName = context.farm?.name ?? 'вашего хозяйства';
  if (list.length === 0) {
    return {
      text: 'Ближайших сроков и просрочек нет — все отчеты в порядке. Помощник не отправляет отчеты за вас: отправку вы подтверждаете сами.',
      proposed_events: [],
      needs_clarification: false,
    };
  }
  const upcoming = list.filter((d) => d.days_left >= 0).length;
  const overdue = list.length - upcoming;
  const parts: string[] = [];
  if (upcoming) parts.push(upcoming === 1 ? 'один ближайший срок' : `${upcoming} ${plural(upcoming, ['ближайший срок', 'ближайших срока', 'ближайших сроков'])}`);
  if (overdue) parts.push(overdue === 1 ? 'один уже истекший' : `${overdue} ${plural(overdue, ['уже истекший', 'уже истекших', 'уже истекших'])}`);
  const text =
    `По вашим отчетам — ${parts.join(' и ')}:` +
    `\n\nПеред отправкой уточните актуальную применимость форм для ${farmName}. Помощник не отправляет отчеты за вас.`;
  return {
    text,
    proposed_events: [],
    needs_clarification: false,
    cards: [...list.map((reminder): ChatCard => ({ kind: 'deadline', reminder })), howToCard()],
  };
}

export function howToAnswer(title: string): EngineOutput {
  return {
    text: 'Отчет всегда отправляете вы сами — помощник только подсказывает. Вот порядок:',
    proposed_events: [],
    needs_clarification: false,
    cards: [howToCard(title)],
  };
}
