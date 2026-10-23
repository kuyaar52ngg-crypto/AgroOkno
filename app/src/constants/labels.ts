// Подписи доменных значений (виды животных, события, корма, культуры) — тексты из макета.
import type {
  CropOperation,
  FeedKind,
  FeedOperation,
  FormCode,
  LivestockGroup,
  MovementKind,
  ProductKind,
  ReportAuthority,
  EventType,
} from '@/data/contract';

export type SpeciesKey = 'cattle' | 'horses' | 'sheep' | 'goats' | 'pigs' | 'deer' | 'poultry' | 'rabbits';

export interface SpeciesDef {
  key: SpeciesKey;
  label: string;
  groups: { group: LivestockGroup; label: string }[];
}

export const SPECIES: SpeciesDef[] = [
  {
    key: 'cattle',
    label: 'КРС',
    groups: [
      { group: 'cattle_cows', label: 'Коровы' },
      { group: 'cattle_calves', label: 'Телята и молодняк' },
      { group: 'cattle_other', label: 'Быки и нетели' },
    ],
  },
  {
    key: 'horses',
    label: 'Лошадь',
    groups: [
      { group: 'horses_mares', label: 'Кобылы' },
      { group: 'horses_young', label: 'Молодняк до 3 лет' },
      { group: 'horses_stallions', label: 'Жеребцы' },
      { group: 'horses_other', label: 'Прочие лошади' },
    ],
  },
  { key: 'sheep', label: 'Овцы', groups: [{ group: 'sheep', label: 'Овцы' }] },
  { key: 'goats', label: 'Козы', groups: [{ group: 'goats', label: 'Козы' }] },
  {
    key: 'pigs',
    label: 'Свиньи',
    groups: [
      { group: 'pigs_sows', label: 'Свиноматки' },
      { group: 'pigs_other', label: 'Прочие свиньи' },
    ],
  },
  { key: 'deer', label: 'Олени', groups: [{ group: 'deer', label: 'Олени' }] },
  { key: 'poultry', label: 'Птица', groups: [{ group: 'poultry', label: 'Птица' }] },
  { key: 'rabbits', label: 'Кролики', groups: [{ group: 'rabbits', label: 'Кролики' }] },
];

export function speciesOfGroup(group: LivestockGroup): SpeciesDef {
  return SPECIES.find((s) => s.groups.some((g) => g.group === group)) ?? SPECIES[0];
}

export function groupLabel(group: LivestockGroup): string {
  for (const species of SPECIES) {
    const found = species.groups.find((g) => g.group === group);
    if (found) return found.label;
  }
  return group;
}

/** Группа, предлагаемая по умолчанию для вида и события. */
export function defaultGroup(species: SpeciesKey, kind: MovementKind): LivestockGroup {
  const def = SPECIES.find((s) => s.key === species) ?? SPECIES[0];
  if (species === 'cattle') return kind === 'birth' ? 'cattle_calves' : 'cattle_cows';
  if (species === 'horses') return kind === 'birth' ? 'horses_young' : 'horses_mares';
  return def.groups[0].group;
}

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  opening_balance: 'Начальный остаток',
  birth: 'Рождение',
  purchase: 'Покупка',
  transfer_in: 'Перевод (приход)',
  sale: 'Продажа',
  sale_slaughter: 'Продажа на забой',
  slaughter: 'Забой',
  death: 'Падеж',
  transfer_out: 'Перевод (расход)',
};

/** События, доступные в форме «Новое событие» (порядок как в макете). */
export const FORM_MOVEMENTS: MovementKind[] = ['birth', 'sale', 'death', 'slaughter', 'purchase'];

export const FEED_LABEL: Record<FeedKind, string> = {
  hay: 'Сено',
  haylage: 'Сенаж',
  silage: 'Силос',
  grain: 'Зерно на корм',
  other: 'Прочие корма',
};

export const FEED_GENITIVE: Record<FeedKind, string> = {
  hay: 'сена',
  haylage: 'сенажа',
  silage: 'силоса',
  grain: 'зерна',
  other: 'кормов',
};

export const FEED_OPERATION_LABEL: Record<FeedOperation, string> = {
  harvest: 'Заготовка',
  purchase: 'Покупка',
  use: 'Использование',
};

export const CROP_OPERATION_LABEL: Record<CropOperation, string> = {
  sowing: 'Посев',
  harvest: 'Сбор урожая',
};

export const CROPS = ['Картофель', 'Овощи открытого грунта', 'Зерновые', 'Кормовые травы', 'Многолетние травы', 'Прочее'];

const CROP_GENITIVE: Record<string, string> = {
  Картофель: 'картофеля',
  'Овощи открытого грунта': 'овощей',
  Зерновые: 'зерновых',
  'Кормовые травы': 'кормовых трав',
  'Многолетние травы': 'многолетних трав',
  Прочее: 'прочих культур',
};

export function cropGenitive(crop: string): string {
  return CROP_GENITIVE[crop] ?? crop.toLowerCase();
}

export const PRODUCT_LABEL: Record<ProductKind, string> = {
  milk: 'Молоко',
  eggs: 'Яйца',
  wool: 'Шерсть',
  honey: 'Мёд',
};

export const PRODUCT_GENITIVE: Record<ProductKind, string> = {
  milk: 'молока',
  eggs: 'яиц',
  wool: 'шерсти',
  honey: 'мёда',
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  livestock: 'Животные',
  product_output: 'Надой и продукция',
  product_sale: 'Продажа продукции',
  feed: 'Корма',
  crop: 'Растениеводство',
};

export const FORM_SHORT: Record<FormCode, string> = {
  '3-fermer': '3-фермер',
  '3-fermer-month': '3-фермер (рег)',
  '1-fermer': '1-фермер',
  '2-fermer': '2-фермер',
  '1-kfh': '1-КФХ',
  '1-ip': '1-ИП',
  '1-tabun': '1-ТАБУН',
  '10-sh': '10-СХ',
  '1-iso-r': '1-ИСО-р',
};

export const AUTHORITY_LABEL: Record<ReportAuthority, string> = {
  rosstat: 'Росстат',
  minselhoz: 'Минсельхоз',
  sakhastat: 'Сахастат',
};

export const RELATIONS = ['Супруга', 'Супруг', 'Сын', 'Дочь', 'Мать', 'Отец', 'Брат', 'Сестра', 'Другой родственник'];

export const SUPPORT_TOPICS = ['Вопрос по отправке отчета', 'Ошибка в данных', 'Проблема со входом', 'Меркурий', 'Другое'];

export const SUPPORT_SECTIONS = ['Отчетность · 1-ТАБУН', 'Отчетность · другая форма', 'Журнал учета', 'Мое ЛПХ', 'Меркурий', 'Профиль'];
