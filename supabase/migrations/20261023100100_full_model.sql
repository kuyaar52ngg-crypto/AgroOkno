-- AgroOkno: полная модель данных (роли, ЛПХ, корма, растениеводство, отчётность, Меркурий, уведомления).
-- Дополняет init: клиентские uuid, updated_at через moddatetime, мягкое удаление (deleted_at),
-- индексы (farm_id, updated_at) для синхронизации, RLS через owns_farm().

-- ─── Перечисления ───────────────────────────────────────────────────────────

create type public.user_role as enum ('farm_head', 'lph_owner', 'council_specialist');
create type public.feed_kind as enum ('hay', 'haylage', 'silage', 'grain', 'other');
create type public.feed_operation as enum ('harvest', 'purchase', 'use');
create type public.crop_operation as enum ('sowing', 'harvest');

-- ─── Профиль и хозяйство ────────────────────────────────────────────────────

alter table public.profiles
  add column email text,                 -- реальный контакт для восстановления доступа
  add column role public.user_role,
  add column settlement text;            -- населённый пункт специалиста сельсовета

alter table public.farms rename column kind to legal_status;
alter table public.farms
  add column region text,
  add column settlement text,
  add column book_record_no text,        -- номер записи похозяйственной книги (только чтение для клиента)
  add column cadastral_no text,
  add column plot_area_m2 numeric(12, 2) check (plot_area_m2 >= 0);

-- Одна учётная запись = одно хозяйство.
create unique index farms_one_per_owner_idx on public.farms (owner_id) where deleted_at is null;
create index farms_settlement_idx on public.farms (settlement) where legal_status = 'lph';

-- ─── Члены хозяйства (похозяйственная книга) ────────────────────────────────

create table public.household_members (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms (id) on delete cascade,
  full_name   text not null,
  birth_date  date,
  relation    text not null,             -- «Глава ЛПХ», «Супруга», «Сын»…
  is_head     boolean not null default false,
  consent     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index household_members_sync_idx on public.household_members (farm_id, updated_at);

-- ─── Корма и растениеводство ────────────────────────────────────────────────

create table public.feed_events (
  id             uuid primary key default gen_random_uuid(),
  farm_id        uuid not null references public.farms (id) on delete cascade,
  occurred_on    date not null,
  feed           public.feed_kind not null,
  operation      public.feed_operation not null,
  quantity_t     numeric(12, 3) not null check (quantity_t >= 0),
  storage_place  text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index feed_events_farm_date_idx on public.feed_events (farm_id, occurred_on);
create index feed_events_sync_idx on public.feed_events (farm_id, updated_at);

create table public.crop_events (
  id           uuid primary key default gen_random_uuid(),
  farm_id      uuid not null references public.farms (id) on delete cascade,
  occurred_on  date not null,
  plot_name    text not null,
  crop         text not null,
  operation    public.crop_operation not null,
  area_ha      numeric(12, 3) not null check (area_ha >= 0),
  yield_t      numeric(12, 3) check (yield_t >= 0),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index crop_events_farm_date_idx on public.crop_events (farm_id, occurred_on);
create index crop_events_sync_idx on public.crop_events (farm_id, updated_at);

-- ─── Справочник сроков и отчётность ─────────────────────────────────────────

create table public.report_deadlines (
  form_code       text primary key,
  title           text not null,
  description     text not null,
  authority       text not null check (authority in ('rosstat', 'minselhoz', 'sakhastat')),
  recipient       text not null,
  scope           text not null check (scope in ('federal', 'regional')),
  receipt_code    text not null,            -- «ТАБУН» в УЧ-ТАБУН-2026-023
  period_kind     text not null check (period_kind in ('year', 'month')),
  -- Для месячных: период = текущий месяц + period_shift_months (0 или -1);
  -- срок = due_day числа месяца (период + due_month_offset). Для годовых: срок = due_day.due_month года (период + due_year_offset).
  period_shift_months int not null default 0,
  due_month_offset    int not null default 0,
  due_year_offset     int not null default 0,
  due_month           int,
  due_day             int not null,
  has_official_blank  boolean not null default false,
  comment         text
);
alter table public.report_deadlines enable row level security;
create policy "deadlines: read" on public.report_deadlines
  for select to authenticated using (true);

create table public.report_submissions (
  id            uuid primary key default gen_random_uuid(),
  farm_id       uuid not null references public.farms (id) on delete cascade,
  form_code     text not null references public.report_deadlines (form_code),
  period_year   integer not null check (period_year between 2000 and 2100),
  period_month  integer check (period_month between 1 and 12),
  status        text not null check (status in ('draft', 'submitted', 'failed')),
  recipient     text,
  receipt_no    text,
  submitted_at  timestamptz,
  snapshot      jsonb,                      -- состав отправленного отчёта: задним числом не пересчитывается
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index report_submissions_period_uq
  on public.report_submissions (farm_id, form_code, period_year, coalesce(period_month, 0))
  where deleted_at is null;
create unique index report_submissions_receipt_uq on public.report_submissions (receipt_no) where receipt_no is not null;
create index report_submissions_sync_idx on public.report_submissions (farm_id, updated_at);
create index report_submissions_form_idx on public.report_submissions (form_code);

create table public.receipt_counters (
  farm_id  uuid not null references public.farms (id) on delete cascade,
  year     integer not null,
  last_no  integer not null default 0,
  primary key (farm_id, year)
);
alter table public.receipt_counters enable row level security; -- без политик: только security definer

-- ─── Меркурий ───────────────────────────────────────────────────────────────

create table public.mercury_connections (
  farm_id     uuid primary key references public.farms (id) on delete cascade,
  status      text not null default 'not_connected' check (status in ('not_connected', 'connected_demo')),
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index mercury_connections_sync_idx on public.mercury_connections (farm_id, updated_at);

create table public.mercury_documents (
  id           uuid primary key default gen_random_uuid(),
  farm_id      uuid not null references public.farms (id) on delete cascade,
  number       text not null,               -- УЧ-ВСД-023
  product      text not null,
  quantity     numeric(14, 3) not null,
  unit         text not null,
  status       text not null check (status in ('issued', 'redeemed')),
  issued_on    date not null,
  produced_on  date,
  sender       text not null,
  recipient    text not null,
  source_kind  text check (source_kind in ('product_sale', 'livestock')),
  source_id    uuid,                        -- событие, из которого создан документ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index mercury_documents_number_uq on public.mercury_documents (farm_id, number) where deleted_at is null;
create index mercury_documents_sync_idx on public.mercury_documents (farm_id, updated_at);

-- ─── Уведомления, настройки, поддержка ──────────────────────────────────────

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms (id) on delete cascade,
  kind        text not null check (kind in ('overdue', 'deadline', 'sync', 'submitted')),
  title       text not null,
  body        text not null,
  form_code   text,
  read        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index notifications_sync_idx on public.notifications (farm_id, updated_at);

create table public.user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  push_enabled       boolean not null default true,
  deadline_reminders boolean not null default true,
  sound              boolean not null default false,
  text_size          text not null default 'standard' check (text_size in ('standard', 'large')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index user_settings_sync_idx on public.user_settings (user_id, updated_at);

create table public.support_tickets (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms (id) on delete cascade,
  number           text not null,           -- AGRO-2026-0142
  topic            text not null,
  related_section  text,
  message          text not null,
  attachment_uri   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index support_tickets_sync_idx on public.support_tickets (farm_id, updated_at);

-- Коды восстановления доступа (демо-режим: код проверяет Edge Function с service role).
create table public.recovery_codes (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0
);
alter table public.recovery_codes enable row level security; -- без политик: только service role

-- ─── updated_at ─────────────────────────────────────────────────────────────

create trigger set_updated_at before update on public.household_members
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.feed_events
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.crop_events
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.report_submissions
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.mercury_connections
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.mercury_documents
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.notifications
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.user_settings
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.support_tickets
  for each row execute procedure extensions.moddatetime (updated_at);

-- ─── Функции доступа ────────────────────────────────────────────────────────

-- Специалист сельсовета читает только ЛПХ своего поселения.
create function public.is_council_for(target_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.farms f
    join public.profiles p on p.id = (select auth.uid())
    where f.id = target_farm_id
      and f.deleted_at is null
      and f.legal_status = 'lph'
      and p.role = 'council_specialist'
      and p.settlement is not null
      and f.settlement = p.settlement
  );
$$;

revoke execute on function public.owns_farm(uuid) from public, anon;
grant execute on function public.owns_farm(uuid) to authenticated;
revoke execute on function public.is_council_for(uuid) from public, anon;
grant execute on function public.is_council_for(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ─── Защитные триггеры ──────────────────────────────────────────────────────

-- Клиент не может менять номер записи книги и владельца хозяйства.
create function public.farms_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.book_record_no := old.book_record_no;
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;
create trigger farms_guard before update on public.farms
  for each row execute procedure public.farms_guard();

-- Роль задаётся один раз (шаг A7). Для специалиста сельсовета поселение берётся из хозяйства
-- пользователя (демо-упрощение; в продакшене роль выдаёт администратор).
create function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if new.role is distinct from old.role and old.role is not null then
      new.role := old.role;
    end if;
    if new.role = 'council_specialist' then
      new.settlement := (select f.settlement from public.farms f where f.owner_id = new.id and f.deleted_at is null limit 1);
    else
      new.settlement := old.settlement;
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute procedure public.profiles_guard();
revoke execute on function public.profiles_guard() from public, anon, authenticated;
revoke execute on function public.farms_guard() from public, anon, authenticated;

-- Отправленный отчёт неизменяем.
create function public.submissions_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.status = 'submitted' and new.deleted_at is not distinct from old.deleted_at then
    raise exception 'Отправленный отчёт нельзя изменить' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger submissions_guard before update on public.report_submissions
  for each row execute procedure public.submissions_guard();
revoke execute on function public.submissions_guard() from public, anon, authenticated;

-- ─── Демо-отправка отчёта с квитанцией ──────────────────────────────────────

create function public.submit_report(
  p_farm_id uuid,
  p_form_code text,
  p_year integer,
  p_month integer,
  p_snapshot jsonb
)
returns table (out_receipt_no text, out_submitted_at timestamptz, out_recipient text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.report_deadlines;
  v_no integer;
  v_receipt text;
  v_at timestamptz := now();
  v_existing public.report_submissions;
begin
  if not public.owns_farm(p_farm_id) then
    raise exception 'Нет доступа к хозяйству' using errcode = '42501';
  end if;
  select * into d from public.report_deadlines where form_code = p_form_code;
  if not found then
    raise exception 'Неизвестная форма %', p_form_code using errcode = '22023';
  end if;
  if d.period_kind = 'month' and (p_month is null or p_month not between 1 and 12) then
    raise exception 'Для формы % нужен месяц отчётного периода', p_form_code using errcode = '22023';
  end if;
  if d.period_kind = 'year' and p_month is not null then
    raise exception 'Форма % годовая', p_form_code using errcode = '22023';
  end if;

  select * into v_existing from public.report_submissions s
   where s.farm_id = p_farm_id and s.form_code = p_form_code and s.period_year = p_year
     and coalesce(s.period_month, 0) = coalesce(p_month, 0) and s.deleted_at is null
   for update;
  if v_existing.id is not null and v_existing.status = 'submitted' then
    raise exception 'Отчёт за этот период уже отправлен (квитанция %)', v_existing.receipt_no using errcode = '23505';
  end if;

  insert into public.receipt_counters (farm_id, year, last_no)
  values (p_farm_id, extract(year from v_at)::int, 1)
  on conflict (farm_id, year) do update set last_no = public.receipt_counters.last_no + 1
  returning last_no into v_no;

  v_receipt := 'УЧ-' || d.receipt_code || '-' || extract(year from v_at)::int || '-' || lpad(v_no::text, 3, '0');

  if v_existing.id is not null then
    update public.report_submissions s
       set status = 'submitted', recipient = d.recipient, receipt_no = v_receipt,
           submitted_at = v_at, snapshot = p_snapshot
     where s.id = v_existing.id;
  else
    insert into public.report_submissions (farm_id, form_code, period_year, period_month, status, recipient, receipt_no, submitted_at, snapshot)
    values (p_farm_id, p_form_code, p_year, p_month, 'submitted', d.recipient, v_receipt, v_at, p_snapshot);
  end if;

  insert into public.notifications (farm_id, kind, title, body, form_code)
  values (p_farm_id, 'submitted', d.title || ' сдан',
          'Учебная квитанция ' || v_receipt || ' доступна в отчёте.', p_form_code);

  return query select v_receipt, v_at, d.recipient;
end;
$$;
revoke execute on function public.submit_report(uuid, text, integer, integer, jsonb) from public, anon;
grant execute on function public.submit_report(uuid, text, integer, integer, jsonb) to authenticated;

-- ─── Row Level Security ─────────────────────────────────────────────────────

alter table public.household_members   enable row level security;
alter table public.feed_events         enable row level security;
alter table public.crop_events         enable row level security;
alter table public.report_submissions  enable row level security;
alter table public.mercury_connections enable row level security;
alter table public.mercury_documents   enable row level security;
alter table public.notifications       enable row level security;
alter table public.user_settings       enable row level security;
alter table public.support_tickets     enable row level security;

-- farms: владелец + специалист сельсовета (чтение ЛПХ своего поселения).
drop policy "own farms: select" on public.farms;
create policy "farms: select" on public.farms
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_council_for(id));

-- profiles: добавляем вставку на случай, если триггер не сработал (идемпотентность клиента).
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- Таблицы со чтением для специалиста: livestock_movements, household_members.
drop policy "farm data: all" on public.livestock_movements;
create policy "movements: select" on public.livestock_movements
  for select to authenticated using (public.owns_farm(farm_id) or public.is_council_for(farm_id));
create policy "movements: insert" on public.livestock_movements
  for insert to authenticated with check (public.owns_farm(farm_id));
create policy "movements: update" on public.livestock_movements
  for update to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "movements: delete" on public.livestock_movements
  for delete to authenticated using (public.owns_farm(farm_id));

create policy "members: select" on public.household_members
  for select to authenticated using (public.owns_farm(farm_id) or public.is_council_for(farm_id));
create policy "members: insert" on public.household_members
  for insert to authenticated with check (public.owns_farm(farm_id));
create policy "members: update" on public.household_members
  for update to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "members: delete" on public.household_members
  for delete to authenticated using (public.owns_farm(farm_id));

-- Остальное — только владелец.
create policy "farm data: all" on public.feed_events
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.crop_events
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.mercury_connections
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.mercury_documents
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.notifications
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.support_tickets
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));

-- Отчёты: читать/черновики — владелец; статус «сдан» выставляет только submit_report().
create policy "submissions: select" on public.report_submissions
  for select to authenticated using (public.owns_farm(farm_id));
create policy "submissions: insert draft" on public.report_submissions
  for insert to authenticated with check (public.owns_farm(farm_id) and status = 'draft' and receipt_no is null);
create policy "submissions: update" on public.report_submissions
  for update to authenticated
  using (public.owns_farm(farm_id) and status <> 'submitted')
  with check (public.owns_farm(farm_id) and status <> 'submitted' and receipt_no is null);
create policy "submissions: delete" on public.report_submissions
  for delete to authenticated using (public.owns_farm(farm_id) and status <> 'submitted');

create policy "own settings: all" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Явные права: клиенты работают только через authenticated; anon не видит данных.
revoke all on all tables in schema public from anon;
