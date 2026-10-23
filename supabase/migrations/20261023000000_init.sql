-- AgroOkno: базовая схема для кейса 1 (единый ввод → отчёты Росстата/Минсельхоза + Меркурий).
-- Отчёты не хранятся: формы собираются из событий хозяйства за период.
-- Все таблицы рассчитаны на offline-first синхронизацию:
--   * id генерирует клиент (uuid), чтобы записи можно было создавать без сети;
--   * updated_at выставляется триггером — по нему клиент забирает изменения (pull);
--   * удаление мягкое (deleted_at), чтобы удаление тоже доехало до других устройств.

create extension if not exists moddatetime schema extensions;

-- ─── Справочные перечисления ────────────────────────────────────────────────

create type public.farm_kind as enum ('kfh', 'ip');

-- Группы животных в разрезе, нужном формам 3-фермер / 1-КФХ.
create type public.livestock_group as enum (
  'cattle_cows',    -- КРС: коровы
  'cattle_other',   -- КРС: прочее поголовье (быки, нетели, телята, молодняк)
  'pigs_sows',      -- свиньи: основные свиноматки
  'pigs_other',     -- свиньи: прочие
  'sheep',          -- овцы
  'goats',          -- козы
  'horses_mares',   -- лошади: кобылы
  'horses_other',   -- лошади: прочие (в т.ч. мясные табунные)
  'deer',           -- олени
  'poultry',        -- птица всех видов
  'rabbits'         -- кролики
);

create type public.movement_kind as enum (
  'opening_balance', -- остаток на начало учёта
  'birth',           -- приплод
  'purchase',        -- покупка
  'transfer_in',     -- перевод из другой группы (напр. нетель → корова)
  'sale',            -- продажа/выдача живым скотом (кроме продажи на убой)
  'sale_slaughter',  -- продажа на убой
  'slaughter',       -- забой на собственном хозяйстве
  'death',           -- падёж
  'transfer_out'     -- перевод в другую группу
);

-- Единицы учёта фиксированы, чтобы отчёты не пересчитывали единицы:
-- milk, wool, honey — кг; eggs — шт.
create type public.product_kind as enum ('milk', 'eggs', 'wool', 'honey');

-- Статус оформления ВСД в «Меркурии» (ФГИС ВетИС).
create type public.mercury_status as enum ('not_required', 'draft', 'pending', 'issued', 'error');

-- ─── Профиль и хозяйство ────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.farms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        public.farm_kind not null,
  name        text not null,
  inn         text check (inn ~ '^\d{10}(\d{2})?$'),
  ogrn        text check (ogrn ~ '^\d{13}(\d{2})?$'),
  okpo        text,
  oktmo       text,
  address     text,
  head_name   text,               -- глава КФХ / ИП, подписывает формы
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index farms_owner_idx on public.farms (owner_id);

-- ─── События хозяйства ──────────────────────────────────────────────────────

-- Движение поголовья. Знак операции определяется kind (см. livestock_balance).
create table public.livestock_movements (
  id              uuid primary key default gen_random_uuid(),
  farm_id         uuid not null references public.farms (id) on delete cascade,
  occurred_on     date not null,
  animal_group    public.livestock_group not null,
  kind            public.movement_kind not null,
  heads           integer not null check (heads > 0),
  live_weight_kg  numeric(12, 2) check (live_weight_kg >= 0),
  -- заполняется для продажи / покупки
  amount_rub      numeric(14, 2) check (amount_rub >= 0),
  counterparty    text,
  counterparty_inn text,
  -- перемещение (для Меркурия): откуда/куда и транспорт
  destination     text,
  vehicle_number  text,
  mercury_status  public.mercury_status not null default 'not_required',
  mercury_vsd_id  text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index livestock_movements_farm_date_idx on public.livestock_movements (farm_id, occurred_on);
create index livestock_movements_sync_idx on public.livestock_movements (farm_id, updated_at);

-- Произведённая продукция (надой, яйца, шерсть...) — обычно ежедневные/ежемесячные записи.
create table public.product_outputs (
  id           uuid primary key default gen_random_uuid(),
  farm_id      uuid not null references public.farms (id) on delete cascade,
  occurred_on  date not null,
  product      public.product_kind not null,
  quantity     numeric(14, 3) not null check (quantity >= 0), -- в единицах product_kind
  source_group public.livestock_group, -- от какой группы (молоко от коров и т.п.)
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index product_outputs_farm_date_idx on public.product_outputs (farm_id, occurred_on);
create index product_outputs_sync_idx on public.product_outputs (farm_id, updated_at);

-- Реализация продукции (не живого скота — он в livestock_movements с kind = 'sale').
create table public.product_sales (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms (id) on delete cascade,
  occurred_on      date not null,
  product          public.product_kind not null,
  quantity         numeric(14, 3) not null check (quantity > 0), -- в единицах product_kind
  amount_rub       numeric(14, 2) check (amount_rub >= 0),
  buyer            text,
  buyer_inn        text,
  destination      text,
  vehicle_number   text,
  mercury_status   public.mercury_status not null default 'not_required',
  mercury_vsd_id   text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index product_sales_farm_date_idx on public.product_sales (farm_id, occurred_on);
create index product_sales_sync_idx on public.product_sales (farm_id, updated_at);

-- ─── updated_at триггеры ────────────────────────────────────────────────────

create trigger set_updated_at before update on public.profiles
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.farms
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.livestock_movements
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.product_outputs
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.product_sales
  for each row execute procedure extensions.moddatetime (updated_at);

-- Профиль создаётся автоматически при регистрации.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Row Level Security ─────────────────────────────────────────────────────

-- Владелец хозяйства — единственный, кто видит и меняет его данные.
create function public.owns_farm(target_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.farms f
    where f.id = target_farm_id and f.owner_id = (select auth.uid())
  );
$$;

alter table public.profiles            enable row level security;
alter table public.farms               enable row level security;
alter table public.livestock_movements enable row level security;
alter table public.product_outputs     enable row level security;
alter table public.product_sales       enable row level security;

create policy "own profile: select" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own farms: select" on public.farms
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "own farms: insert" on public.farms
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own farms: update" on public.farms
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own farms: delete" on public.farms
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "farm data: all" on public.livestock_movements
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.product_outputs
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.product_sales
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));

-- ─── Аналитика ──────────────────────────────────────────────────────────────

-- Знак операции для подсчёта поголовья.
create function public.movement_sign(k public.movement_kind)
returns integer
language sql
immutable
as $$
  select case k
    when 'opening_balance' then 1
    when 'birth'           then 1
    when 'purchase'        then 1
    when 'transfer_in'     then 1
    else -1
  end;
$$;

-- Поголовье на дату (включительно). Основа для раздела 2 формы 3-фермер.
create function public.livestock_balance(p_farm_id uuid, p_on date)
returns table (animal_group public.livestock_group, heads bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.animal_group, sum(public.movement_sign(m.kind) * m.heads)::bigint
  from public.livestock_movements m
  where m.farm_id = p_farm_id
    and m.occurred_on <= p_on
    and m.deleted_at is null
  group by m.animal_group;
$$;
