// Правиловый разбор русских фраз — работает без ANTHROPIC_API_KEY и как запасной вариант при сбоях Claude.
// Понимает: надой, сбор яиц/шерсти/мёда, продажа продукции, приплод, падёж, забой, продажа скота,
// заготовка кормов, вопросы про сроки отчётов и «как проверить/подготовить отчёт».
import { litersToKg } from '../../../app/src/reports/period';
import { GROUP_LABEL, HELP_TEXT, MILK_CLARIFY, clarification, describeEvent, howToAnswer, reportStatusAnswer } from './answers';
import { cy, findNumbers, norm, parseDate, test, type FoundNumber } from './ru';
import type { AssistantContext, AssistantEngine, EngineOutput, LivestockGroup, NewEvent } from './types';

interface Animal {
  group: LivestockGroup;
  re: RegExp;
}

const ANIMALS: Animal[] = [
  { group: 'horses_young', re: /жеребен|жеребят|жеребч|молодняк[а-я]* лошад|стригун/ },
  { group: 'horses_stallions', re: /жеребц|жеребец/ },
  { group: 'horses_mares', re: /кобыл/ },
  { group: 'horses_other', re: /лошад|\bконь\b|коня|коней/ },
  { group: 'cattle_calves', re: /телен|телят|телк|бычок|бычк|молодняк/ },
  { group: 'cattle_other', re: /\bбык|нетел/ },
  { group: 'cattle_cows', re: /коров|буренк/ },
  { group: 'pigs_sows', re: /свиноматк/ },
  { group: 'pigs_other', re: /свин|поросен|поросят|кабан|хряк/ },
  { group: 'sheep', re: /овц|баран|ягнен|ягнят/ },
  { group: 'goats', re: /\bкоз[ауыеой]?\b|козел|козл|козлен|козлят/ },
  { group: 'deer', re: /олен/ },
  { group: 'poultry', re: /\bкур[ыуе]?\b|куриц|птиц|гус[ьяе]|утк|индюк|петух|цыпл/ },
  { group: 'rabbits', re: /кролик|крольч/ },
];

/** Животное, названное в фразе раньше всех (по позиции в тексте). */
function findAnimal(t: string): LivestockGroup | null {
  let best: { group: LivestockGroup; index: number } | null = null;
  for (const a of ANIMALS) {
    const m = cy(a.re).exec(t);
    if (m && (!best || m.index < best.index)) best = { group: a.group, index: m.index };
  }
  return best?.group ?? null;
}

const first = (list: FoundNumber[], ...kinds: FoundNumber['kind'][]) => list.find((n) => kinds.includes(n.kind));

function milkSource(t: string): LivestockGroup {
  if (test(/кобыл/, t)) return 'horses_mares';
  if (test(/\bкоз[ауыеой]?\b/, t)) return 'goats';
  if (test(/овц/, t)) return 'sheep';
  return 'cattle_cows';
}

const base = (occurred_on: string) => ({ occurred_on, note: null });

function parseProductSale(t: string, nums: FoundNumber[], today: string): EngineOutput | null {
  if (!test(/(продал|продали|продаж|реализова)/, t)) return null;
  const date = parseDate(t, today);
  const money = first(nums, 'money')?.value ?? null;
  if (test(/молок/, t)) {
    const l = first(nums, 'liters');
    const kg = first(nums, 'kg');
    const plain = nums.find((n) => n.kind === 'plain');
    const qtyKg = l ? litersToKg(l.value) : kg ? kg.value : plain ? litersToKg(plain.value) : null;
    if (qtyKg === null) return clarification('Сколько литров молока продали? Пока ничего не сохранил. Напишите количество — и я запишу продажу.');
    const e: NewEvent = {
      ...base(date), type: 'product_sale', product: 'milk', quantity: qtyKg, amount_rub: money, buyer: null, buyer_inn: null,
      destination: null, vehicle_number: null, mercury_status: 'not_required',
    };
    return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
  }
  const product = test(/яйц|яиц/, t) ? 'eggs' : test(/шерст/, t) ? 'wool' : test(/\bмед\b|\bмеда\b|\bмеду\b/, t) ? 'honey' : null;
  if (!product) return null;
  const q = product === 'eggs' ? first(nums, 'pieces', 'plain') : first(nums, 'kg', 'plain');
  if (!q) return clarification('Сколько продали? Пока ничего не сохранил. Напишите количество — и я запишу продажу.');
  const e: NewEvent = {
    ...base(date), type: 'product_sale', product, quantity: q.value, amount_rub: money, buyer: null, buyer_inn: null,
    destination: null, vehicle_number: null, mercury_status: 'not_required',
  };
  return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
}

type Kind = 'birth' | 'death' | 'slaughter' | 'sale';

function movementKind(t: string): { kind: Kind; singular: boolean } | null {
  if (test(/(отелил|ожеребил|окотил|опоросил)/, t)) return { kind: 'birth', singular: true };
  if (test(/(приплод|родил|появил)/, t)) return { kind: 'birth', singular: false };
  if (test(/(падеж|\bпал[аио]?\b|сдох|погиб|умер)/, t)) {
    return { kind: 'death', singular: test(/\b(пал|пала|сдохла|сдох|погиб|погибла|умер|умерла)\b/, t) };
  }
  if (test(/(забой|забил|зарезал|на мясо)/, t)) return { kind: 'slaughter', singular: false };
  if (test(/(продал|продаж|реализова)/, t)) return { kind: 'sale', singular: false };
  return null;
}

function parseLivestock(t: string, nums: FoundNumber[], today: string): EngineOutput | null {
  const mk = movementKind(t);
  if (!mk) return null;
  const animal = findAnimal(t);
  if (!animal) {
    const what = { birth: 'приплод', death: 'падёж', slaughter: 'забой', sale: 'продажу' }[mk.kind];
    return clarification(`Какие животные? Напишите, например: «корова», «кобыла», «овцы». Пока ничего не сохранил (${what}).`);
  }
  let group: LivestockGroup = animal;
  if (mk.kind === 'birth') {
    // приплод учитывается в молодняке
    if (animal === 'cattle_cows' || animal === 'cattle_other') group = 'cattle_calves';
    else if (animal === 'horses_mares' || animal === 'horses_other' || animal === 'horses_stallions') group = 'horses_young';
    else if (animal === 'pigs_sows') group = 'pigs_other';
  }
  const headsNum = first(nums, 'heads') ?? nums.find((n) => n.kind === 'plain' && Number.isInteger(n.value) && n.value > 0);
  let heads = headsNum?.value ?? null;
  if (heads === null && mk.singular) heads = 1;
  if (heads === null || !Number.isInteger(heads) || heads <= 0) {
    return clarification(`Сколько голов (${GROUP_LABEL[group]!.toLowerCase()})? Пока ничего не сохранил. Напишите количество — и я запишу событие.`);
  }
  const money = first(nums, 'money')?.value ?? null;
  const weight = first(nums, 'kg')?.value ?? null;
  const e: NewEvent = {
    ...base(parseDate(t, today)), type: 'livestock', animal_group: group, kind: mk.kind, heads,
    live_weight_kg: mk.kind === 'sale' || mk.kind === 'slaughter' ? weight : null,
    amount_rub: mk.kind === 'sale' ? money : null, counterparty: null, counterparty_inn: null, destination: null, vehicle_number: null,
    mercury_status: 'not_required',
  };
  return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
}

function parseMilk(t: string, nums: FoundNumber[], today: string): EngineOutput | null {
  if (!test(/(молок|надо[ийяе]|надаил|удо[йя]|подо[ие])/, t)) return null;
  const l = first(nums, 'liters');
  const kg = first(nums, 'kg');
  const plain = nums.find((n) => n.kind === 'plain');
  const quantity = l ? litersToKg(l.value) : kg ? kg.value : plain ? litersToKg(plain.value) : null;
  if (quantity === null || quantity <= 0) return clarification(MILK_CLARIFY);
  const e: NewEvent = { ...base(parseDate(t, today)), type: 'product_output', product: 'milk', quantity, source_group: milkSource(t) };
  return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
}

function parseOtherProduct(t: string, nums: FoundNumber[], today: string): EngineOutput | null {
  const product = test(/яйц|яиц/, t) ? 'eggs' : test(/шерст|настриг/, t) ? 'wool' : test(/\bмед\b|\bмеда\b|\bмеду\b|откачал/, t) ? 'honey' : null;
  if (!product) return null;
  if (!test(/(собрал|получил|настриг|откачал|дали|снесл)/, t)) return null;
  const q = product === 'eggs' ? first(nums, 'pieces', 'plain') : first(nums, 'kg', 'plain');
  if (!q) {
    const what = { eggs: 'яиц', wool: 'килограммов шерсти', honey: 'килограммов мёда' }[product];
    return clarification(`Сколько ${what}? Пока ничего не сохранил. Напишите количество — и я запишу в журнал.`);
  }
  const e: NewEvent = {
    ...base(parseDate(t, today)), type: 'product_output', product, quantity: q.value,
    source_group: product === 'eggs' ? 'poultry' : product === 'wool' ? 'sheep' : null,
  };
  return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
}

function parseFeed(t: string, nums: FoundNumber[], today: string): EngineOutput | null {
  const feed = test(/сенаж/, t) ? 'haylage' : test(/силос/, t) ? 'silage' : test(/\bсен[оа]\b/, t) ? 'hay' : test(/зерн|\bовес\b|\bовса\b|ячмен/, t) ? 'grain' : null;
  if (!feed) return null;
  const operation = test(/(заготов|накосил|скосил)/, t) ? 'harvest' : test(/(купил|закупил|приобрел)/, t) ? 'purchase' : test(/(скормил|израсходовал|потратил|раздал)/, t) ? 'use' : null;
  if (!operation) return null;
  const tons = first(nums, 'tons') ?? nums.find((n) => n.kind === 'plain');
  const kg = first(nums, 'kg');
  const q = tons ? tons.value : kg ? kg.value / 1000 : null;
  if (q === null) return clarification('Сколько тонн? Пока ничего не сохранил. Напишите количество — и я запишу в журнал.');
  const e: NewEvent = { ...base(parseDate(t, today)), type: 'feed', feed, operation, quantity_t: q, storage_place: null };
  return { text: describeEvent(e), proposed_events: [e], needs_clarification: false };
}

export function parseRules(text: string, context: AssistantContext): EngineOutput {
  const t = norm(text);
  if (!t) return { text: HELP_TEXT, proposed_events: [], needs_clarification: false };
  const nums = findNumbers(t);

  // «как проверить / подготовить / сдать отчёт»
  if (test(/как (проверить|подготовить|заполнить|сдать|отправить)\b.*(отчет|форм)/, t)) {
    return howToAnswer(test(/проверить/, t) ? 'Как проверить отчет' : 'Как подготовить отчет');
  }
  // «какие отчёты скоро сдавать», «какие сроки», «что просрочено»
  const aboutReports = test(/(отчет|\bсрок|просроч|\bформ[аыу]?\b)/, t);
  const asking = test(/(какие|какой|что|когда|скоро|нужно|надо|ближайш|просроч|сдава|сдат|до конца|покажи)/, t);
  if (aboutReports && asking && !test(/(продал|продали|надой|молок)/, t)) return reportStatusAnswer(context, text);

  for (const handler of [parseProductSale, parseLivestock, parseMilk, parseOtherProduct, parseFeed]) {
    const r = handler(t, nums, context.today);
    if (r) return r;
  }
  if (test(/(запиши|запишите|внеси|добавь)/, t) && test(/надой/, t)) return clarification(MILK_CLARIFY);

  if (test(/^(привет|здравствуй|добрый|помощь|помоги|что умеешь|что ты умеешь)/, t)) {
    return { text: HELP_TEXT, proposed_events: [], needs_clarification: false };
  }
  return { text: `Не совсем понял. ${HELP_TEXT}`, proposed_events: [], needs_clarification: true };
}

export const rulesEngine: AssistantEngine = {
  name: 'rules',
  async respond({ text, context }) {
    return parseRules(text, context);
  },
};
