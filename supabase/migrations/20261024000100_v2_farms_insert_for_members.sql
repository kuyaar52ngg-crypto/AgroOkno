-- upsert хозяйства участником (синхронизация правок): INSERT ... ON CONFLICT проверяет политику вставки.
drop policy "own farms: insert" on public.farms;
create policy "farms: insert" on public.farms
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.owns_farm(id));
