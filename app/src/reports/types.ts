// Строки данных хозяйства, с которыми работают мапперы отчётов.
// Чистый TS без зависимостей от React Native: используется и в приложении (офлайн-превью), и в API.
import type {
  CropOperation,
  Farm,
  FeedKind,
  FeedOperation,
  LivestockGroup,
  MercuryStatus,
  MovementKind,
  ProductKind,
} from '../data/contract';

export type {
  CropOperation,
  Farm,
  FeedKind,
  FeedOperation,
  LivestockGroup,
  MercuryStatus,
  MovementKind,
  ProductKind,
};

export interface MovementRow {
  id?: string;
  occurred_on: string;
  animal_group: LivestockGroup;
  kind: MovementKind;
  heads: number;
  live_weight_kg: number | null;
  amount_rub: number | null;
}

export interface OutputRow {
  occurred_on: string;
  product: ProductKind;
  /** кг (молоко, шерсть, мёд) или шт (яйца). */
  quantity: number;
  source_group: LivestockGroup | null;
}

export interface SaleRow {
  occurred_on: string;
  product: ProductKind;
  quantity: number;
  amount_rub: number | null;
}

export interface FeedRow {
  occurred_on: string;
  feed: FeedKind;
  operation: FeedOperation;
  quantity_t: number;
}

export interface CropRow {
  occurred_on: string;
  plot_name: string;
  crop: string;
  operation: CropOperation;
  area_ha: number;
  yield_t: number | null;
}

export interface MemberRow {
  full_name: string;
  is_head: boolean;
}

export interface SubmissionRow {
  form_code: string;
  period_year: number;
  period_month: number | null;
  status: 'draft' | 'submitted' | 'failed';
  recipient: string | null;
  receipt_no: string | null;
  submitted_at: string | null;
  snapshot: unknown;
}

/** Сведения демо-«Хорриота» для PDF-выписки (грузятся только там, где нужны). */
export interface HorriotInfo {
  status: 'not_connected' | 'connected_demo';
  synced_at: string | null;
  records: { kind: 'registration' | 'disposal'; animal_group: LivestockGroup; heads: number; registered_on: string; source_movement_id: string | null }[];
}

/** Все данные хозяйства, нужные для расчёта отчётов (без удалённых записей). */
export interface FarmData {
  farm: Farm;
  movements: MovementRow[];
  outputs: OutputRow[];
  sales: SaleRow[];
  feed: FeedRow[];
  crops: CropRow[];
  members: MemberRow[];
  submissions: SubmissionRow[];
  /** Только для выписки из книги (loadFarmData с { horriot: true }); undefined — сведений нет или не загружались. */
  horriot?: HorriotInfo;
}

export const emptyFarmData = (farm: Farm): FarmData => ({
  farm,
  movements: [],
  outputs: [],
  sales: [],
  feed: [],
  crops: [],
  members: [],
  submissions: [],
});
