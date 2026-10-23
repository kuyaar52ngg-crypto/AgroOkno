// Форма № 1-ИП (Минсельхоз России, приказ № 165): «Информация о производственной деятельности
// индивидуальных предпринимателей». Коды строк — 24xxxx. Для ЛПХ-демо показывается упрощённое
// ежемесячное превью (см. engine.ts), для ИП — годовой бланк.
import { computeMinselhoz, type MinselhozResult } from './minselhoz';
import type { FarmData } from './types';

export const IP1_PREFIX = '24';
export type Ip1Result = MinselhozResult;

export const computeIp1 = (data: FarmData, year: number): Ip1Result => computeMinselhoz(data, year);
