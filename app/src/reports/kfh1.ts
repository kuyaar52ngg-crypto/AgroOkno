// Форма № 1-КФХ (Минсельхоз России, приказ № 165): «Информация о производственной деятельности глав
// крестьянских (фермерских) хозяйств — индивидуальных предпринимателей». Коды строк — 23xxxx.
import { computeMinselhoz, type MinselhozResult } from './minselhoz';
import type { FarmData } from './types';

export const KFH1_PREFIX = '23';
export type Kfh1Result = MinselhozResult;

export const computeKfh1 = (data: FarmData, year: number): Kfh1Result => computeMinselhoz(data, year);
