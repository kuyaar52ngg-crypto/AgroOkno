// zod-схемы событий строго по типу NewEvent из контракта (app/src/data/contract.ts).
import { z } from 'zod';

import type { NewEvent } from '../../../app/src/data/contract';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате YYYY-MM-DD');
const nullableText = z.string().max(300).nullable().default(null);
const nullableNum = z.number().nonnegative().nullable().default(null);

export const livestockGroup = z.enum([
  'cattle_cows', 'cattle_calves', 'cattle_other', 'pigs_sows', 'pigs_other', 'sheep', 'goats', 'horses_mares', 'horses_young',
  'horses_stallions', 'horses_other', 'deer', 'poultry', 'rabbits',
]);
export const movementKind = z.enum([
  'opening_balance', 'birth', 'purchase', 'transfer_in', 'sale', 'sale_slaughter', 'slaughter', 'death', 'transfer_out',
]);
const productKind = z.enum(['milk', 'eggs', 'wool', 'honey']);
const mercury = z.enum(['not_required', 'draft', 'pending', 'issued', 'error']).default('not_required');

const base = { occurred_on: date, note: nullableText };

export const livestockEvent = z.object({
  ...base,
  type: z.literal('livestock'),
  animal_group: livestockGroup,
  kind: movementKind,
  heads: z.number().int().positive().max(100000),
  live_weight_kg: nullableNum,
  amount_rub: nullableNum,
  counterparty: nullableText,
  counterparty_inn: nullableText,
  destination: nullableText,
  vehicle_number: nullableText,
  mercury_status: mercury,
});

export const productOutputEvent = z.object({
  ...base,
  type: z.literal('product_output'),
  product: productKind,
  /** Единицы ProductKind: кг (молоко, шерсть, мёд) или шт (яйца). */
  quantity: z.number().nonnegative(),
  source_group: livestockGroup.nullable().default(null),
});

export const productSaleEvent = z.object({
  ...base,
  type: z.literal('product_sale'),
  product: productKind,
  quantity: z.number().positive(),
  amount_rub: nullableNum,
  buyer: nullableText,
  buyer_inn: nullableText,
  destination: nullableText,
  vehicle_number: nullableText,
  mercury_status: mercury,
});

export const feedEvent = z.object({
  ...base,
  type: z.literal('feed'),
  feed: z.enum(['hay', 'haylage', 'silage', 'grain', 'other']),
  operation: z.enum(['harvest', 'purchase', 'use']),
  quantity_t: z.number().nonnegative(),
  storage_place: nullableText,
});

export const cropEvent = z.object({
  ...base,
  type: z.literal('crop'),
  plot_name: z.string().min(1).max(100),
  crop: z.string().min(1).max(100),
  operation: z.enum(['sowing', 'harvest']),
  area_ha: z.number().nonnegative(),
  yield_t: nullableNum,
});

export const newEventSchema = z.discriminatedUnion('type', [livestockEvent, productOutputEvent, productSaleEvent, feedEvent, cropEvent]);

/** Проверка совместимости со типом контракта на этапе компиляции. */
export function parseNewEvent(input: unknown): NewEvent {
  const parsed: NewEvent = newEventSchema.parse(input);
  return parsed;
}

export const safeParseNewEvent = (input: unknown): { ok: true; event: NewEvent } | { ok: false; error: string } => {
  const r = newEventSchema.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const event: NewEvent = r.data;
  return { ok: true, event };
};
