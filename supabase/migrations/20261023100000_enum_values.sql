-- Новые значения перечислений. Вынесено в отдельную миграцию: новое значение enum
-- нельзя использовать в той же транзакции, где оно добавлено.
alter type public.farm_kind add value if not exists 'lph';

alter type public.livestock_group add value if not exists 'cattle_calves';   -- КРС: телята, молодняк
alter type public.livestock_group add value if not exists 'horses_young';    -- молодняк лошадей до 3 лет
alter type public.livestock_group add value if not exists 'horses_stallions'; -- взрослые жеребцы
