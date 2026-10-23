// Состояние формы «Новое событие», преобразование в NewEvent и обратно, валидация.
import { kgToLiters, litersToKg, parseNumber, todayIso } from '@/constants/format';
import { defaultGroup, speciesOfGroup } from '@/constants/labels';
import type { SpeciesKey } from '@/constants/labels';
import type {
  CropOperation,
  FeedKind,
  FeedOperation,
  HerdSummary,
  IsoDate,
  JournalEntry,
  LivestockGroup,
  MovementKind,
  NewEvent,
} from '@/data/contract';

export type FormTab = 'livestock' | 'crop' | 'feed';
/** Событие в блоке «Животноводство»: движение скота или надой. */
export type LivestockMode = MovementKind | 'milk';

export interface FormState {
  tab: FormTab;
  species: SpeciesKey;
  mode: LivestockMode;
  group: LivestockGroup;
  heads: number;
  amountRub: string;
  counterparty: string;
  liveWeight: string;
  milkGroup: LivestockGroup;
  liters: string;
  date: IsoDate;
  note: string;
  plot: string;
  crop: string;
  cropOp: CropOperation;
  areaHa: string;
  yieldT: string;
  feedKind: FeedKind;
  feedOp: FeedOperation;
  qtyT: string;
  storage: string;
}

export function initialForm(): FormState {
  return {
    tab: 'livestock',
    species: 'cattle',
    mode: 'birth',
    group: 'cattle_calves',
    heads: 2,
    amountRub: '',
    counterparty: '',
    liveWeight: '',
    milkGroup: 'cattle_cows',
    liters: '',
    date: todayIso(),
    note: '',
    plot: '',
    crop: 'Картофель',
    cropOp: 'harvest',
    areaHa: '',
    yieldT: '',
    feedKind: 'hay',
    feedOp: 'harvest',
    qtyT: '',
    storage: '',
  };
}

function numToText(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

/** Заполняет форму из существующей записи (редактирование из B3). */
export function formFromEntry(entry: JournalEntry): FormState {
  const base = { ...initialForm(), date: entry.occurred_on, note: entry.note ?? '' };
  switch (entry.type) {
    case 'livestock':
      return {
        ...base,
        tab: 'livestock',
        species: speciesOfGroup(entry.animal_group).key,
        mode: entry.kind,
        group: entry.animal_group,
        heads: entry.heads,
        amountRub: numToText(entry.amount_rub),
        counterparty: entry.counterparty ?? '',
        liveWeight: numToText(entry.live_weight_kg),
      };
    case 'product_output':
      return {
        ...base,
        tab: 'livestock',
        mode: 'milk',
        milkGroup: entry.source_group ?? 'cattle_cows',
        liters: entry.product === 'milk' ? numToText(kgToLiters(entry.quantity)) : numToText(entry.quantity),
      };
    case 'feed':
      return {
        ...base,
        tab: 'feed',
        feedKind: entry.feed,
        feedOp: entry.operation,
        qtyT: numToText(entry.quantity_t),
        storage: entry.storage_place ?? '',
      };
    case 'crop':
      return {
        ...base,
        tab: 'crop',
        plot: entry.plot_name,
        crop: entry.crop,
        cropOp: entry.operation,
        areaHa: numToText(entry.area_ha),
        yieldT: numToText(entry.yield_t),
      };
    case 'product_sale':
      return { ...base, tab: 'livestock', mode: 'milk', liters: numToText(kgToLiters(entry.quantity)) };
  }
}

/** Запись → NewEvent (для блока «Куда попадут данные» в B3). */
export function toNewEvent(entry: JournalEntry): NewEvent {
  const copy: Record<string, unknown> = { ...entry };
  delete copy.id;
  delete copy.farm_id;
  delete copy.created_at;
  delete copy.pending_sync;
  return copy as unknown as NewEvent;
}

/** Собирает NewEvent из формы (даже если форма заполнена не полностью — для превью «Куда попадут данные»). */
export function buildEvent(form: FormState, defaultPlot: string): NewEvent {
  const note = form.note.trim() === '' ? null : form.note.trim();
  if (form.tab === 'crop') {
    return {
      type: 'crop',
      occurred_on: form.date,
      note,
      plot_name: form.plot || defaultPlot,
      crop: form.crop,
      operation: form.cropOp,
      area_ha: parseNumber(form.areaHa) ?? 0,
      yield_t: form.cropOp === 'harvest' ? (parseNumber(form.yieldT) ?? 0) : null,
    };
  }
  if (form.tab === 'feed') {
    return {
      type: 'feed',
      occurred_on: form.date,
      note,
      feed: form.feedKind,
      operation: form.feedOp,
      quantity_t: parseNumber(form.qtyT) ?? 0,
      storage_place: form.storage.trim() === '' ? null : form.storage.trim(),
    };
  }
  if (form.mode === 'milk') {
    return {
      type: 'product_output',
      occurred_on: form.date,
      note,
      product: 'milk',
      quantity: litersToKg(parseNumber(form.liters) ?? 0),
      source_group: form.milkGroup,
    };
  }
  const priced = form.mode === 'sale' || form.mode === 'purchase' || form.mode === 'sale_slaughter';
  return {
    type: 'livestock',
    occurred_on: form.date,
    note,
    animal_group: form.group,
    kind: form.mode,
    heads: form.heads,
    live_weight_kg: form.mode === 'slaughter' || form.mode === 'sale_slaughter' ? parseNumber(form.liveWeight) : null,
    amount_rub: priced ? parseNumber(form.amountRub) : null,
    counterparty: priced && form.counterparty.trim() !== '' ? form.counterparty.trim() : null,
    counterparty_inn: null,
    destination: null,
    vehicle_number: null,
    mercury_status: 'not_required',
  };
}

export type FormErrors = Partial<Record<'heads' | 'liters' | 'date' | 'areaHa' | 'yieldT' | 'qtyT' | 'amountRub', string>>;

const OUTGOING_MODES: LivestockMode[] = ['sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out'];

export function validate(form: FormState, herd: HerdSummary | undefined): FormErrors {
  const errors: FormErrors = {};
  if (!form.date) errors.date = 'Выберите дату события';
  else if (form.date > todayIso()) errors.date = 'Дата не может быть в будущем';

  if (form.tab === 'livestock') {
    if (form.mode === 'milk') {
      const liters = parseNumber(form.liters);
      if (liters === null) errors.liters = 'Введите объем надоя';
      else if (liters <= 0) errors.liters = 'Объем должен быть больше нуля';
      else if (liters > 10000) errors.liters = 'Проверьте объем: значение слишком большое';
    } else {
      if (form.heads < 1) errors.heads = 'Укажите количество голов';
      if (OUTGOING_MODES.includes(form.mode)) {
        const available = herd?.groups.find((g) => g.group === form.group)?.heads;
        if (available !== undefined && form.heads > available) {
          errors.heads = `В группе только ${available} гол. Уменьшите количество`;
        }
      }
      if (form.amountRub.trim() !== '' && parseNumber(form.amountRub) === null) errors.amountRub = 'Введите сумму числом';
    }
  } else if (form.tab === 'crop') {
    const area = parseNumber(form.areaHa);
    if (area === null || area <= 0) errors.areaHa = 'Укажите площадь';
    if (form.cropOp === 'harvest') {
      const yieldT = parseNumber(form.yieldT);
      if (yieldT === null || yieldT < 0) errors.yieldT = 'Укажите урожай';
    }
  } else {
    const qty = parseNumber(form.qtyT);
    if (qty === null || qty <= 0) errors.qtyT = 'Укажите количество';
  }
  return errors;
}

export function resetGroupForKind(form: FormState, species: SpeciesKey, mode: LivestockMode): LivestockGroup {
  if (mode === 'milk') return form.milkGroup;
  return defaultGroup(species, mode);
}
