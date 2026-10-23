// Тестовые данные: ЛПХ Ивановых (как в макете и seed) и небольшое КФХ для годовых форм.
import type { Farm } from '../../data/contract';
import { emptyFarmData, type FarmData, type MovementRow } from '../types';

export const lphFarm: Farm = {
  id: 'f1',
  owner_id: 'u1',
  legal_status: 'lph',
  name: 'ЛПХ Ивановых',
  inn: '143512345660',
  ogrn: null,
  okpo: null,
  oktmo: null,
  region: 'Республика Саха (Якутия)',
  settlement: 'с. Намцы',
  address: 'ул. Луговая, 12',
  head_name: 'Иванов Иван Иванович',
  book_record_no: '0142',
  cadastral_no: '14:18:010001:1248',
  plot_area_m2: 2500,
};

export const kfhFarm: Farm = { ...lphFarm, id: 'f2', legal_status: 'kfh', name: 'КФХ «Эрилик»', book_record_no: null };

const mv = (
  occurred_on: string,
  animal_group: MovementRow['animal_group'],
  kind: MovementRow['kind'],
  heads: number,
  live_weight_kg: number | null = null,
  amount_rub: number | null = null,
): MovementRow => ({ occurred_on, animal_group, kind, heads, live_weight_kg, amount_rub });

const kg = (liters: number) => Math.round(liters * 1.03 * 1000) / 1000;

export function lphData(): FarmData {
  const d = emptyFarmData(lphFarm);
  d.movements = [
    mv('2026-01-01', 'cattle_cows', 'opening_balance', 15),
    mv('2026-01-01', 'cattle_calves', 'opening_balance', 8),
    mv('2026-01-01', 'horses_mares', 'opening_balance', 18),
    mv('2026-01-01', 'horses_young', 'opening_balance', 7),
    mv('2026-01-01', 'horses_stallions', 'opening_balance', 4),
    mv('2026-01-01', 'sheep', 'opening_balance', 24),
    mv('2026-10-05', 'horses_young', 'birth', 6),
    mv('2026-10-12', 'horses_young', 'death', 1),
    mv('2026-10-15', 'horses_young', 'slaughter', 2, 500),
  ];
  for (let day = 1; day <= 30; day++) {
    d.outputs.push({ occurred_on: `2026-09-${String(day).padStart(2, '0')}`, product: 'milk', quantity: kg(36), source_group: 'cattle_cows' });
  }
  for (let day = 1; day <= 18; day++) {
    d.outputs.push({ occurred_on: `2026-10-${String(day).padStart(2, '0')}`, product: 'milk', quantity: kg(60), source_group: 'cattle_cows' });
  }
  d.outputs.push(
    { occurred_on: '2026-10-19', product: 'milk', quantity: kg(38), source_group: 'cattle_cows' },
    { occurred_on: '2026-10-21', product: 'milk', quantity: kg(42), source_group: 'cattle_cows' },
    { occurred_on: '2026-10-23', product: 'milk', quantity: kg(40), source_group: 'cattle_cows' },
  );
  d.sales = [
    { occurred_on: '2026-09-08', product: 'milk', quantity: kg(400), amount_rub: 28000 },
    { occurred_on: '2026-09-17', product: 'milk', quantity: kg(380), amount_rub: 30400 },
    { occurred_on: '2026-09-27', product: 'milk', quantity: kg(300), amount_rub: 28000 },
  ];
  d.feed = [
    { occurred_on: '2026-09-12', feed: 'hay', operation: 'harvest', quantity_t: 18 },
    { occurred_on: '2026-09-20', feed: 'haylage', operation: 'harvest', quantity_t: 6 },
    { occurred_on: '2026-09-25', feed: 'grain', operation: 'harvest', quantity_t: 1.2 },
    { occurred_on: '2026-10-22', feed: 'hay', operation: 'harvest', quantity_t: 2.5 },
  ];
  d.crops = [
    { occurred_on: '2026-05-20', plot_name: 'Огород', crop: 'Картофель', operation: 'sowing', area_ha: 0.1, yield_t: null },
    { occurred_on: '2026-10-20', plot_name: 'Огород', crop: 'Картофель', operation: 'harvest', area_ha: 0.1, yield_t: 1.8 },
  ];
  d.members = [
    { full_name: 'Иван Иванов', is_head: true },
    { full_name: 'Мария Иванова', is_head: false },
    { full_name: 'Алексей Иванов', is_head: false },
  ];
  d.submissions = [
    { form_code: '10-sh', period_year: 2026, period_month: 9, status: 'submitted', recipient: 'Росстат', receipt_no: 'УЧ-10СХ-2026-015', submitted_at: '2026-10-15T10:15:00+09:00', snapshot: null },
    { form_code: '1-ip', period_year: 2026, period_month: 9, status: 'submitted', recipient: 'Росстат', receipt_no: 'УЧ-1ИП-2026-012', submitted_at: '2026-10-12T11:40:00+09:00', snapshot: null },
    { form_code: '3-fermer-month', period_year: 2026, period_month: 9, status: 'submitted', recipient: 'Сахастат', receipt_no: 'УЧ-ЗФР-2026-016', submitted_at: '2026-10-16T14:05:00+09:00', snapshot: null },
    { form_code: '1-iso-r', period_year: 2026, period_month: 10, status: 'draft', recipient: null, receipt_no: null, submitted_at: null, snapshot: null },
  ];
  return d;
}

export function kfhData(): FarmData {
  const d = emptyFarmData(kfhFarm);
  d.movements = [
    mv('2025-01-01', 'cattle_cows', 'opening_balance', 40),
    mv('2025-01-01', 'cattle_calves', 'opening_balance', 22),
    mv('2025-01-01', 'horses_mares', 'opening_balance', 70),
    mv('2025-01-01', 'sheep', 'opening_balance', 60),
    mv('2025-04-10', 'cattle_calves', 'birth', 34),
    mv('2025-02-14', 'cattle_calves', 'death', 3),
    mv('2025-10-25', 'cattle_calves', 'slaughter', 10, 3000),
    mv('2025-11-12', 'cattle_calves', 'sale_slaughter', 12, 3400, 680000),
    mv('2025-09-20', 'sheep', 'slaughter', 35, 1600),
    mv('2026-01-15', 'sheep', 'sale', 5, 250, 30000),
  ];
  d.outputs = [
    { occurred_on: '2025-06-28', product: 'milk', quantity: 5200, source_group: 'cattle_cows' },
    { occurred_on: '2025-07-28', product: 'milk', quantity: 5400, source_group: 'cattle_cows' },
    { occurred_on: '2025-06-20', product: 'wool', quantity: 85, source_group: 'sheep' },
    { occurred_on: '2025-07-28', product: 'eggs', quantity: 1500, source_group: 'poultry' },
  ];
  d.sales = [
    { occurred_on: '2025-07-01', product: 'milk', quantity: 7000, amount_rub: 364000 },
    { occurred_on: '2025-07-02', product: 'wool', quantity: 80, amount_rub: 36000 },
  ];
  d.crops = [
    { occurred_on: '2025-05-20', plot_name: 'Поле №1', crop: 'Картофель', operation: 'sowing', area_ha: 0.8, yield_t: null },
    { occurred_on: '2025-09-15', plot_name: 'Поле №1', crop: 'Картофель', operation: 'harvest', area_ha: 0.8, yield_t: 14.4 },
    { occurred_on: '2025-05-18', plot_name: 'Поле №3', crop: 'Ячмень яровой', operation: 'sowing', area_ha: 6, yield_t: null },
    { occurred_on: '2025-09-05', plot_name: 'Поле №3', crop: 'Ячмень яровой', operation: 'harvest', area_ha: 6, yield_t: 12.6 },
    { occurred_on: '2025-05-22', plot_name: 'Поле №2', crop: 'Овощи открытого грунта', operation: 'sowing', area_ha: 0.3, yield_t: null },
    { occurred_on: '2025-05-25', plot_name: 'Поле №4', crop: 'Пшеница яровая', operation: 'sowing', area_ha: 2, yield_t: null },
    { occurred_on: '2024-09-01', plot_name: 'Поле №5', crop: 'Пшеница озимая', operation: 'sowing', area_ha: 1.5, yield_t: null },
    { occurred_on: '2025-09-30', plot_name: 'Поле №5', crop: 'Пшеница озимая', operation: 'sowing', area_ha: 9, yield_t: null },
  ];
  d.feed = [
    { occurred_on: '2025-07-25', feed: 'hay', operation: 'harvest', quantity_t: 90 },
    { occurred_on: '2025-08-15', feed: 'haylage', operation: 'harvest', quantity_t: 40 },
    { occurred_on: '2025-12-01', feed: 'hay', operation: 'use', quantity_t: 60 },
  ];
  return d;
}
