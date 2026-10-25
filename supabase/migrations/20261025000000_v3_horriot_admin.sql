-- AgroOkno v3: ВетИС «Хорриот» (учебная сверка «книга ЛПХ ↔ Хорриот») и админ-панель выбора модели помощника.
-- Хорриот — демо, как «Меркурий»: реальной интеграции с ФГИС ВетИС нет. RLS обеих таблиц — public.owns_farm().
-- Модель помощника (OpenRouter) — глобальная настройка в app_settings, меняют только администраторы из app_admins.

-- ─── Хорриот ────────────────────────────────────────────────────────────────

create table public.horriot_connections (
  farm_id     uuid primary key references public.farms (id) on delete cascade,
  status      text not null default 'not_connected' check (status in ('not_connected', 'connected_demo')),
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index horriot_connections_sync_idx on public.horriot_connections (farm_id, updated_at);

-- Учебные записи «Хорриота»: регистрация (рождение, покупка, начальный остаток, поступление) и выбытие животных.
create table public.horriot_records (
  id                  uuid primary key default gen_random_uuid(),
  farm_id             uuid not null references public.farms (id) on delete cascade,
  number              text not null,                       -- УЧ-ХР-001
  kind                text not null check (kind in ('registration', 'disposal')),
  animal_group        public.livestock_group not null,
  heads               integer not null check (heads > 0),
  reason              text not null,                       -- «Рождение», «Продажа», «Начальный остаток»
  registered_on       date not null,
  source_movement_id  uuid,                                -- запись журнала поголовья, из которой создана (идемпотентность)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create unique index horriot_records_number_uq on public.horriot_records (farm_id, number) where deleted_at is null;
create unique index horriot_records_source_uq on public.horriot_records (source_movement_id)
  where deleted_at is null and source_movement_id is not null;
create index horriot_records_sync_idx on public.horriot_records (farm_id, updated_at);

create trigger set_updated_at before update on public.horriot_connections
  for each row execute procedure extensions.moddatetime (updated_at);
create trigger set_updated_at before update on public.horriot_records
  for each row execute procedure extensions.moddatetime (updated_at);

alter table public.horriot_connections enable row level security;
alter table public.horriot_records     enable row level security;
create policy "farm data: all" on public.horriot_connections
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));
create policy "farm data: all" on public.horriot_records
  for all to authenticated using (public.owns_farm(farm_id)) with check (public.owns_farm(farm_id));

comment on table public.horriot_connections is 'Подключение хозяйства к демо-«Хорриоту» (учебный режим, реальной интеграции нет)';
comment on table public.horriot_records is 'Учебные записи «Хорриота»: регистрация и выбытие животных по записям журнала поголовья';

-- ─── Администраторы и глобальные настройки ──────────────────────────────────

-- Администраторы приложения. Права даёт только user_id: email в профиле пользователь меняет сам, а код регистрации
-- в демо-режиме приходит в ответе, поэтому по email права не выдаются. email — справочно (кому предназначена запись);
-- user_id проставляет координатор вручную после регистрации аккаунта.
create table public.app_admins (
  email       text primary key check (email <> '' and email = lower(btrim(email))),
  user_id     uuid unique references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;

-- Глобальные настройки приложения (ключ → JSON). Сейчас: assistant_model — модель помощника и запасные модели.
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text                                         -- email администратора
);
alter table public.app_settings enable row level security;
create trigger set_updated_at before update on public.app_settings
  for each row execute procedure extensions.moddatetime (updated_at);

comment on table public.app_admins is 'Администраторы приложения (по user_id; email справочно). Прямой доступ к таблице — только у администраторов';
comment on table public.app_settings is 'Глобальные настройки приложения; читать модель помощника могут все через get_assistant_model_settings()';

-- Текущий пользователь — администратор: его user_id есть в app_admins.
create function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Прямой доступ к таблицам администраторов и настроек — только админам; остальные работают через RPC ниже.
create policy "admins: all" on public.app_admins
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "settings: all" on public.app_settings
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

-- Настройка модели помощника в формате AssistantModelSettings. Читают все пользователи: серверу нужна модель при запросе
-- любого пользователя. Нет записи — значения по умолчанию.
create function public.get_assistant_model_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'model', coalesce(nullif(btrim(s.value ->> 'model'), ''), 'anthropic/claude-haiku-5.5'),
    'fallback_models', case when jsonb_typeof(s.value -> 'fallback_models') = 'array' then s.value -> 'fallback_models' else '[]'::jsonb end,
    'updated_at', s.updated_at,
    'updated_by', s.updated_by
  )
  from (select 1) d
  left join public.app_settings s on s.key = 'assistant_model';
$$;
revoke execute on function public.get_assistant_model_settings() from public, anon;
grant execute on function public.get_assistant_model_settings() to authenticated, service_role;

-- Смена модели помощника для всех пользователей (только администратор).
create function public.set_assistant_model_settings(p_model text, p_fallbacks text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_model text := btrim(coalesce(p_model, ''));
  v_fallbacks text[] := '{}';
  v_raw text;
  v_item text;
  v_email text;
begin
  if (select auth.uid()) is null or not public.is_app_admin() then
    raise exception 'Менять модель помощника могут только администраторы' using errcode = '42501';
  end if;
  if v_model = '' then
    raise exception 'Укажите модель помощника' using errcode = '22023';
  end if;
  if v_model !~ '^[~A-Za-z0-9][A-Za-z0-9._:/~+-]{0,198}$' then
    raise exception 'Некорректный идентификатор модели: %', v_model using errcode = '22023';
  end if;
  foreach v_raw in array coalesce(p_fallbacks, '{}') loop
    v_item := btrim(coalesce(v_raw, ''));
    if v_item = '' then
      raise exception 'Запасная модель не может быть пустой' using errcode = '22023';
    end if;
    if v_item !~ '^[~A-Za-z0-9][A-Za-z0-9._:/~+-]{0,198}$' then
      raise exception 'Некорректный идентификатор запасной модели: %', v_item using errcode = '22023';
    end if;
    if v_item = v_model or v_item = any (v_fallbacks) then
      raise exception 'Модели не должны повторяться: %', v_item using errcode = '22023';
    end if;
    v_fallbacks := v_fallbacks || v_item;
  end loop;
  if coalesce(array_length(v_fallbacks, 1), 0) > 3 then
    raise exception 'Запасных моделей — не больше трёх' using errcode = '22023';
  end if;

  select a.email into v_email
  from public.app_admins a
  where a.user_id = (select auth.uid());

  insert into public.app_settings (key, value, updated_by)
  values ('assistant_model', jsonb_build_object('model', v_model, 'fallback_models', to_jsonb(v_fallbacks)), v_email)
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  return public.get_assistant_model_settings();
end;
$$;
revoke execute on function public.set_assistant_model_settings(text, text[]) from public, anon;
grant execute on function public.set_assistant_model_settings(text, text[]) to authenticated;

-- ─── Сид ────────────────────────────────────────────────────────────────────

insert into public.app_admins (email) values ('kuyaar52ngg@gmail.com') on conflict do nothing;

-- Основная модель — Claude Haiku 5.5 через OpenRouter; запасные — бесплатные модели с поддержкой tool calling
-- (id проверены по GET https://openrouter.ai/api/v1/models).
insert into public.app_settings (key, value) values (
  'assistant_model',
  jsonb_build_object(
    'model', 'anthropic/claude-haiku-5.5',
    'fallback_models', jsonb_build_array('google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free')
  )
) on conflict (key) do nothing;
