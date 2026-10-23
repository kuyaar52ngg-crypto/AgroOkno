// Точка входа слоя данных: реальная offline-first реализация (expo-sqlite + Supabase).
// Демо-моки агента B остаются в ./mock для разработки UI и скриншотов — чтобы вернуться к ним,
// замените './impl' на './mock' в двух местах ниже.
import type { DataModule } from './contract';
import * as impl from './impl';

// Проверка на этапе компиляции: реализация полностью соответствует контракту.
const _contract: DataModule = impl;
void _contract;

export * from './impl';
