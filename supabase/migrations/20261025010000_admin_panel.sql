-- AgroOkno · веб-панель администратора (admin/): сводка, пользователи, хозяйства, отчёты, сроки, поддержка, рассылки, журнал.
-- Права — public.is_app_admin() (таблица app_admins по user_id, см. миграцию v3). Все RPC ниже — security definer,
-- search_path = '', первая проверка — is_app_admin() (42501), доступ только у authenticated; изменяющие RPC пишут
-- строку в admin_audit_log. Блокировка пользователей (auth.users.banned_until) и Expo push делает сервер сервисным ключом,
-- здесь только чтение banned_until. Технический email auth.users наружу не отдаётся (email — из profiles.email).
-- Границы дат — по часовому поясу Asia/Yakutsk (как TZ_REGION сервера).

-- ─── Поддержка: статус и ответ администратора ───────────────────────────────

alter table public.support_tickets
  add column status       text not null default 'new' check (status in ('new', 'in_progress', 'answered', 'closed')),
  add column admin_reply  text,
  add column replied_at   timestamptz,
  add column replied_by   uuid references auth.users (id) on delete set null;
create index support_tickets_replied_by_idx on public.support_tickets (replied_by);
create index support_tickets_status_idx on public.support_tickets (status) where deleted_at is null;

-- Обращения пользователь создаёт сам (RLS «farm data: all»), но статус и ответ меняет только администратор
-- (admin_reply_ticket) или сервер: для клиентских запросов эти поля возвращаются к прежним значениям / значениям по умолчанию.
-- При upsert клиента (INSERT … ON CONFLICT DO UPDATE) значения сбрасываются дважды — триггером вставки и затем триггером обновления.
create function public.support_tickets_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_app_admin() then
    if tg_op = 'INSERT' then
      new.status := 'new';
      new.admin_reply := null;
      new.replied_at := null;
      new.replied_by := null;
    else
      new.status := old.status;
      new.admin_reply := old.admin_reply;
      new.replied_at := old.replied_at;
      new.replied_by := old.replied_by;
    end if;
  end if;
  return new;
end;
$$;
create trigger support_tickets_guard before insert or update on public.support_tickets
  for each row execute procedure public.support_tickets_guard();
revoke execute on function public.support_tickets_guard() from public, anon, authenticated;

comment on column public.support_tickets.status is 'Статус обращения: new, in_progress, answered, closed (меняет только администратор)';
comment on column public.support_tickets.admin_reply is 'Ответ администратора; пользователь получает его уведомлением (kind = admin)';

-- ─── Уведомления: kind = 'admin' (рассылки и ответы поддержки) ──────────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('overdue', 'deadline', 'sync', 'submitted', 'admin'));

-- ─── Журнал действий администраторов и рассылки ─────────────────────────────

-- Журнал пишут RPC (security definer) и сервер (сервисный ключ); админы только читают. admin_id без внешнего ключа:
-- запись остаётся, даже если учётную запись удалили.
create table public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid,
  admin_email  text,
  action       text not null,                 -- user.block, user.unblock, user.grant_admin, user.revoke_admin, deadline.update, ticket.reply, broadcast.send
  target_type  text,                          -- user | farm | deadline | ticket | broadcast
  target_id    text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_action_idx on public.admin_audit_log (action, created_at desc);

create table public.admin_broadcasts (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  body             text not null,
  target           jsonb not null,            -- { target: all|status|farms, status: kfh|ip|lph|null, farm_ids: [uuid]|null }
  farms_count      integer not null default 0,
  push_sent        integer not null default 0, -- обновляет сервер после Expo push (сервисный ключ)
  created_by       uuid,
  created_by_email text,
  created_at       timestamptz not null default now()
);
create index admin_broadcasts_created_idx on public.admin_broadcasts (created_at desc);

alter table public.admin_audit_log enable row level security;
alter table public.admin_broadcasts enable row level security;
create policy "audit: admins read" on public.admin_audit_log
  for select to authenticated using (public.is_app_admin());
create policy "broadcasts: admins read" on public.admin_broadcasts
  for select to authenticated using (public.is_app_admin());
revoke all on public.admin_audit_log, public.admin_broadcasts from anon, authenticated;
grant select on public.admin_audit_log, public.admin_broadcasts to authenticated;

comment on table public.admin_audit_log is 'Журнал действий администраторов: запись только из RPC admin_* и сервером (service role); читают администраторы';
comment on table public.admin_broadcasts is 'История рассылок администратора (уведомление хозяйствам + Expo push)';

-- ─── Служебные функции (наружу не выдаются: вызывают только admin_* RPC) ─────

-- Шаблон для ILIKE: экранирует \ % _ ; пустая строка → null.
create function public.admin_like(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(p_text, '')) = '' then null
    else '%' || replace(replace(replace(left(btrim(p_text), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;
revoke execute on function public.admin_like(text) from public, anon, authenticated, service_role;

-- Строка журнала от имени текущего администратора (email — из app_admins, а не из редактируемого профиля).
create function public.admin_audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, details)
  values (
    (select auth.uid()),
    (select a.email from public.app_admins a where a.user_id = (select auth.uid())),
    p_action, p_target_type, p_target_id, p_details
  );
end;
$$;
revoke execute on function public.admin_audit(text, text, text, jsonb) from public, anon, authenticated, service_role;

-- AdminUser: профиль + данные auth.users (вход, блокировка). email — profiles.email.
create function public.admin_user_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'phone', p.phone,
    'role', p.role,
    'settlement', p.settlement,
    'created_at', p.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'banned_until', u.banned_until,
    'is_admin', exists (select 1 from public.app_admins a where a.user_id = p.id),
    'farms_count', (
      select count(*) from public.farm_members m
      join public.farms f on f.id = m.farm_id and f.deleted_at is null
      where m.user_id = p.id
    )
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_id;
$$;
revoke execute on function public.admin_user_json(uuid) from public, anon, authenticated, service_role;

-- AdminFarm: реквизиты, владелец, участники, последняя активность (события журнала и отчёты), статусы Меркурия/Хорриота.
create function public.admin_farm_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'inn', f.inn,
    'legal_status', f.legal_status,
    'region', f.region,
    'settlement', f.settlement,
    'owner', jsonb_build_object('id', f.owner_id, 'full_name', o.full_name, 'email', o.email),
    'members_count', (select count(*) from public.farm_members m where m.farm_id = f.id),
    'created_at', f.created_at,
    'last_activity_at', (
      select max(a.t) from (
        select max(e.updated_at) as t from public.livestock_movements e where e.farm_id = f.id
        union all select max(e.updated_at) from public.product_outputs e where e.farm_id = f.id
        union all select max(e.updated_at) from public.product_sales e where e.farm_id = f.id
        union all select max(e.updated_at) from public.feed_events e where e.farm_id = f.id
        union all select max(e.updated_at) from public.crop_events e where e.farm_id = f.id
        union all select max(e.updated_at) from public.report_submissions e where e.farm_id = f.id
      ) a
    ),
    'mercury_status', coalesce((select c.status from public.mercury_connections c where c.farm_id = f.id and c.deleted_at is null), 'not_connected'),
    'horriot_status', coalesce((select c.status from public.horriot_connections c where c.farm_id = f.id and c.deleted_at is null), 'not_connected'),
    'reports_submitted', (
      select count(*) from public.report_submissions s
      where s.farm_id = f.id and s.status = 'submitted' and s.deleted_at is null
    )
  )
  from public.farms f
  left join public.profiles o on o.id = f.owner_id
  where f.id = p_id;
$$;
revoke execute on function public.admin_farm_json(uuid) from public, anon, authenticated, service_role;

-- Обращение для админ-списка. Автор обращения в таблице не хранится — берётся владелец хозяйства.
create function public.admin_ticket_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'number', t.number,
    'topic', t.topic,
    'related_section', t.related_section,
    'message', t.message,
    'status', t.status,
    'admin_reply', t.admin_reply,
    'replied_at', t.replied_at,
    'replied_by', t.replied_by,
    'created_at', t.created_at,
    'farm_id', t.farm_id,
    'farm_name', f.name,
    'user_full_name', o.full_name,
    'user_email', o.email
  )
  from public.support_tickets t
  join public.farms f on f.id = t.farm_id
  left join public.profiles o on o.id = f.owner_id
  where t.id = p_id;
$$;
revoke execute on function public.admin_ticket_json(uuid) from public, anon, authenticated, service_role;

-- ─── Сводка ─────────────────────────────────────────────────────────────────

create function public.admin_stats(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_tz constant text := 'Asia/Yakutsk';
  v_to date := coalesce(p_to, (now() at time zone c_tz)::date);
  v_from date;
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_users_total integer;
  v_users_new integer;
  v_farms_total integer;
  v_by_status jsonb;
  v_events integer;
  v_reports jsonb;
  v_mercury integer;
  v_horriot integer;
  v_messages integer;
  v_tickets integer;
  v_daily jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  v_from := coalesce(p_from, v_to - 29);
  if v_from > v_to then
    raise exception 'Начало периода позже его конца' using errcode = '22023';
  end if;
  if v_to - v_from > 400 then
    raise exception 'Период не может быть длиннее 400 дней' using errcode = '22023';
  end if;
  v_ts_from := v_from::timestamp at time zone c_tz;
  v_ts_to := (v_to + 1)::timestamp at time zone c_tz;

  select count(*) into v_users_total
  from public.profiles p join auth.users u on u.id = p.id;
  select count(*) into v_users_new
  from public.profiles p join auth.users u on u.id = p.id
  where p.created_at >= v_ts_from and p.created_at < v_ts_to;

  select count(*),
         jsonb_build_object(
           'kfh', count(*) filter (where f.legal_status::text = 'kfh'),
           'ip',  count(*) filter (where f.legal_status::text = 'ip'),
           'lph', count(*) filter (where f.legal_status::text = 'lph')
         )
    into v_farms_total, v_by_status
  from public.farms f
  where f.deleted_at is null;

  -- События журнала за период (по дате события): поголовье, продукция, реализация, корма, растениеводство.
  with ev as (
    select occurred_on as d from public.livestock_movements where deleted_at is null and occurred_on between v_from and v_to
    union all select occurred_on from public.product_outputs where deleted_at is null and occurred_on between v_from and v_to
    union all select occurred_on from public.product_sales where deleted_at is null and occurred_on between v_from and v_to
    union all select occurred_on from public.feed_events where deleted_at is null and occurred_on between v_from and v_to
    union all select occurred_on from public.crop_events where deleted_at is null and occurred_on between v_from and v_to
  ),
  ev_day as (select d, count(*) as c from ev group by d),
  usr_day as (
    select (p.created_at at time zone c_tz)::date as d, count(*) as c
    from public.profiles p join auth.users u on u.id = p.id
    where p.created_at >= v_ts_from and p.created_at < v_ts_to
    group by 1
  )
  select (select count(*) from ev),
         coalesce(jsonb_agg(
           jsonb_build_object('date', to_char(g.d, 'YYYY-MM-DD'), 'events', coalesce(e.c, 0), 'new_users', coalesce(u.c, 0))
           order by g.d
         ), '[]'::jsonb)
    into v_events, v_daily
  from (select v_from + n as d from generate_series(0, v_to - v_from) n) g
  left join ev_day e on e.d = g.d
  left join usr_day u on u.d = g.d;

  -- Сданные отчёты по формам: все формы справочника, в том числе с нулём.
  select coalesce(jsonb_agg(jsonb_build_object('form_code', x.form_code, 'count', x.c) order by x.c desc, x.form_code), '[]'::jsonb)
    into v_reports
  from (
    select d.form_code, count(s.id) as c
    from public.report_deadlines d
    left join public.report_submissions s
      on s.form_code = d.form_code and s.status = 'submitted' and s.deleted_at is null
     and s.submitted_at >= v_ts_from and s.submitted_at < v_ts_to
    group by d.form_code
  ) x;

  select count(*) into v_mercury
  from public.mercury_connections c join public.farms f on f.id = c.farm_id and f.deleted_at is null
  where c.status = 'connected_demo' and c.deleted_at is null;
  select count(*) into v_horriot
  from public.horriot_connections c join public.farms f on f.id = c.farm_id and f.deleted_at is null
  where c.status = 'connected_demo' and c.deleted_at is null;

  select count(*) into v_messages
  from public.chat_messages m
  where m.role = 'user' and m.deleted_at is null and m.created_at >= v_ts_from and m.created_at < v_ts_to;

  select count(*) into v_tickets
  from public.support_tickets t
  where t.deleted_at is null and t.status in ('new', 'in_progress');

  return jsonb_build_object(
    'users_total', v_users_total,
    'users_new', v_users_new,
    'farms_total', v_farms_total,
    'farms_by_status', v_by_status,
    'events_count', v_events,
    'reports_by_form', v_reports,
    'mercury_connected', v_mercury,
    'horriot_connected', v_horriot,
    'assistant_messages', v_messages,
    'open_tickets', v_tickets,
    'daily', v_daily
  );
end;
$$;

-- ─── Пользователи ───────────────────────────────────────────────────────────

create function public.admin_list_users(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := public.admin_like(p_search);
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
  v_phone boolean := btrim(coalesce(p_search, '')) ~ '^[0-9+() -]+$' and length(regexp_replace(coalesce(p_search, ''), '\D', '', 'g')) >= 3;
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;

  -- Поиск: ФИО, email, телефон (в т.ч. по цифрам), ИНН и название хозяйства пользователя.
  with f as (
    select p.id, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where v_like is null
       or p.full_name ilike v_like
       or p.email ilike v_like
       or p.phone ilike v_like
       or (v_phone and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
       or exists (
         select 1 from public.farm_members m
         join public.farms fm on fm.id = m.farm_id and fm.deleted_at is null
         where m.user_id = p.id and (fm.inn ilike v_like or fm.name ilike v_like)
       )
  ),
  pg as (select id, created_at from f order by created_at desc, id limit v_limit offset v_offset)
  select (select count(*) from f),
         coalesce((select jsonb_agg(public.admin_user_json(pg.id) order by pg.created_at desc, pg.id) from pg), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user jsonb;
  v_today date := (now() at time zone 'Asia/Yakutsk')::date;
  v_farm_ids uuid[];
  v_farms jsonb;
  v_tickets jsonb;
  v_events integer;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  v_user := public.admin_user_json(p_user_id);
  if v_user is null then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(m.farm_id), '{}'::uuid[]),
         coalesce(jsonb_agg(
           jsonb_build_object('id', f.id, 'name', f.name, 'inn', f.inn, 'legal_status', f.legal_status, 'member_role', m.role)
           order by (m.role = 'owner') desc, f.created_at
         ), '[]'::jsonb)
    into v_farm_ids, v_farms
  from public.farm_members m
  join public.farms f on f.id = m.farm_id and f.deleted_at is null
  where m.user_id = p_user_id;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', x.id, 'number', x.number, 'topic', x.topic, 'status', x.status, 'created_at', x.created_at)
           order by x.created_at desc
         ), '[]'::jsonb)
    into v_tickets
  from (
    select t.id, t.number, t.topic, t.status, t.created_at
    from public.support_tickets t
    where t.farm_id = any (v_farm_ids) and t.deleted_at is null
    order by t.created_at desc
    limit 20
  ) x;

  -- События в хозяйствах пользователя за последние 30 дней (включая сегодня).
  select count(*) into v_events from (
    select 1 from public.livestock_movements e where e.farm_id = any (v_farm_ids) and e.deleted_at is null and e.occurred_on between v_today - 29 and v_today
    union all select 1 from public.product_outputs e where e.farm_id = any (v_farm_ids) and e.deleted_at is null and e.occurred_on between v_today - 29 and v_today
    union all select 1 from public.product_sales e where e.farm_id = any (v_farm_ids) and e.deleted_at is null and e.occurred_on between v_today - 29 and v_today
    union all select 1 from public.feed_events e where e.farm_id = any (v_farm_ids) and e.deleted_at is null and e.occurred_on between v_today - 29 and v_today
    union all select 1 from public.crop_events e where e.farm_id = any (v_farm_ids) and e.deleted_at is null and e.occurred_on between v_today - 29 and v_today
  ) ev;

  return v_user || jsonb_build_object('farms', v_farms, 'tickets', v_tickets, 'events_30d', v_events);
end;
$$;

-- Выдать или снять права администратора. Выдача: запись app_admins с user_id (email — из профиля; если в app_admins уже есть
-- заготовка с этим email без user_id, она привязывается к пользователю). Снять права с себя нельзя (22023).
create function public.admin_set_admin(p_user_id uuid, p_grant boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self uuid := (select auth.uid());
  v_email text;
  v_changed boolean := false;
  v_n integer;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if p_user_id is null or p_grant is null then
    raise exception 'Укажите пользователя и действие' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p join auth.users u on u.id = p.id where p.id = p_user_id) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;

  if p_grant then
    if not exists (select 1 from public.app_admins a where a.user_id = p_user_id) then
      select nullif(lower(btrim(p.email)), '') into v_email from public.profiles p where p.id = p_user_id;
      if v_email is not null then
        update public.app_admins set user_id = p_user_id where email = v_email and user_id is null;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_changed := true;
        elsif exists (select 1 from public.app_admins a where a.email = v_email) then
          v_email := null;   -- такой email уже закреплён за другим администратором
        end if;
      end if;
      if not v_changed then
        insert into public.app_admins (email, user_id)
        values (coalesce(v_email, 'id-' || p_user_id::text || '@agrookno.local'), p_user_id);
        v_changed := true;
      end if;
    end if;
  else
    if p_user_id = v_self then
      raise exception 'Нельзя снять права администратора с себя' using errcode = '22023';
    end if;
    delete from public.app_admins where user_id = p_user_id;
    v_changed := found;
  end if;

  if v_changed then
    perform public.admin_audit(
      case when p_grant then 'user.grant_admin' else 'user.revoke_admin' end,
      'user', p_user_id::text, '{}'::jsonb
    );
  end if;
  return public.admin_user_json(p_user_id);
end;
$$;

-- ─── Хозяйства ──────────────────────────────────────────────────────────────

create function public.admin_list_farms(p_search text default null, p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := public.admin_like(p_search);
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('kfh', 'ip', 'lph') then
    raise exception 'Неизвестный статус хозяйства: %', v_status using errcode = '22023';
  end if;

  -- Поиск: название, ИНН, регион, населённый пункт, код приглашения, ФИО/email/телефон владельца.
  with f as (
    select fm.id, fm.created_at
    from public.farms fm
    left join public.profiles o on o.id = fm.owner_id
    where fm.deleted_at is null
      and (v_status is null or fm.legal_status::text = v_status)
      and (v_like is null
        or fm.name ilike v_like
        or fm.inn ilike v_like
        or fm.region ilike v_like
        or fm.settlement ilike v_like
        or fm.invite_code ilike v_like
        or o.full_name ilike v_like
        or o.email ilike v_like
        or o.phone ilike v_like)
  ),
  pg as (select id, created_at from f order by created_at desc, id limit v_limit offset v_offset)
  select (select count(*) from f),
         coalesce((select jsonb_agg(public.admin_farm_json(pg.id) order by pg.created_at desc, pg.id) from pg), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create function public.admin_get_farm(p_farm_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_farm jsonb;
  v_extra jsonb;
  v_members jsonb;
  v_requests jsonb;
  v_submissions jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  select public.admin_farm_json(f.id),
         jsonb_build_object('address', f.address, 'ogrn', f.ogrn, 'oktmo', f.oktmo, 'book_record_no', f.book_record_no, 'invite_code', f.invite_code)
    into v_farm, v_extra
  from public.farms f
  where f.id = p_farm_id and f.deleted_at is null;
  if v_farm is null then
    raise exception 'Хозяйство не найдено' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('user_id', m.user_id, 'full_name', p.full_name, 'email', p.email, 'role', m.role)
           order by (m.role = 'owner') desc, m.created_at
         ), '[]'::jsonb)
    into v_members
  from public.farm_members m
  left join public.profiles p on p.id = m.user_id
  where m.farm_id = p_farm_id;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', x.id, 'user_id', x.user_id, 'full_name', x.full_name, 'status', x.status, 'created_at', x.created_at)
           order by x.created_at desc
         ), '[]'::jsonb)
    into v_requests
  from (
    select r.id, r.user_id, p.full_name, r.status, r.created_at
    from public.farm_join_requests r
    left join public.profiles p on p.id = r.user_id
    where r.farm_id = p_farm_id
    order by r.created_at desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(
           jsonb_build_object('id', x.id, 'form_code', x.form_code, 'period_year', x.period_year, 'period_month', x.period_month,
                              'receipt_no', x.receipt_no, 'submitted_at', x.submitted_at)
           order by x.submitted_at desc nulls last, x.id
         ), '[]'::jsonb)
    into v_submissions
  from (
    select s.id, s.form_code, s.period_year, s.period_month, s.receipt_no, s.submitted_at
    from public.report_submissions s
    where s.farm_id = p_farm_id and s.status = 'submitted' and s.deleted_at is null
    order by s.submitted_at desc nulls last, s.id
    limit 100
  ) x;

  return v_farm || v_extra || jsonb_build_object('members', v_members, 'join_requests', v_requests, 'submissions', v_submissions);
end;
$$;

-- ─── Отчёты ─────────────────────────────────────────────────────────────────

-- Сданные отчёты (status = submitted) всех хозяйств; поиск — название, ИНН хозяйства, номер квитанции.
create function public.admin_list_submissions(
  p_form text default null,
  p_year integer default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := public.admin_like(p_search);
  v_form text := nullif(btrim(coalesce(p_form, '')), '');
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;

  with f as (
    select s.id, s.farm_id, fm.name as farm_name, fm.inn, s.form_code, s.period_year, s.period_month, s.status,
           s.recipient, s.receipt_no, s.submitted_at
    from public.report_submissions s
    join public.farms fm on fm.id = s.farm_id and fm.deleted_at is null
    where s.deleted_at is null
      and s.status = 'submitted'
      and (v_form is null or s.form_code = v_form)
      and (p_year is null or s.period_year = p_year)
      and (v_like is null or fm.name ilike v_like or fm.inn ilike v_like or s.receipt_no ilike v_like)
  ),
  pg as (select * from f order by submitted_at desc nulls last, id limit v_limit offset v_offset)
  select (select count(*) from f),
         coalesce((
           select jsonb_agg(
             jsonb_build_object('id', pg.id, 'farm_id', pg.farm_id, 'farm_name', pg.farm_name, 'inn', pg.inn, 'form_code', pg.form_code,
                                'period_year', pg.period_year, 'period_month', pg.period_month, 'status', pg.status,
                                'recipient', pg.recipient, 'receipt_no', pg.receipt_no, 'submitted_at', pg.submitted_at)
             order by pg.submitted_at desc nulls last, pg.id
           ) from pg
         ), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ─── Сроки сдачи отчётов ────────────────────────────────────────────────────

-- Правка справочника report_deadlines. Разрешены ключи title, description, comment, due_month, due_day, due_month_offset,
-- due_year_offset; прочие ключи — 22023. Возвращает строку справочника целиком.
create function public.admin_update_deadline(p_form_code text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_allowed constant text[] := array['title', 'description', 'comment', 'due_month', 'due_day', 'due_month_offset', 'due_year_offset'];
  d public.report_deadlines;
  v_new public.report_deadlines;
  v_key text;
  v_title text;
  v_description text;
  v_comment text;
  v_month integer;
  v_day integer;
  v_month_offset integer;
  v_year_offset integer;
  v_changes jsonb := '{}'::jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'Передайте поля для изменения' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (c_allowed)) then
      raise exception 'Поле нельзя менять: %', v_key using errcode = '22023';
    end if;
  end loop;

  select * into d from public.report_deadlines where form_code = p_form_code for update;
  if not found then
    raise exception 'Форма не найдена: %', p_form_code using errcode = 'P0002';
  end if;

  v_title := d.title;
  v_description := d.description;
  v_comment := d.comment;
  v_month := d.due_month;
  v_day := d.due_day;
  v_month_offset := d.due_month_offset;
  v_year_offset := d.due_year_offset;

  if p_patch ? 'title' then
    if jsonb_typeof(p_patch -> 'title') <> 'string' then
      raise exception 'Название должно быть строкой' using errcode = '22023';
    end if;
    v_title := btrim(p_patch ->> 'title');
    if v_title = '' or char_length(v_title) > 200 then
      raise exception 'Название — от 1 до 200 символов' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'description' then
    if jsonb_typeof(p_patch -> 'description') <> 'string' then
      raise exception 'Описание должно быть строкой' using errcode = '22023';
    end if;
    v_description := btrim(p_patch ->> 'description');
    if v_description = '' or char_length(v_description) > 1000 then
      raise exception 'Описание — от 1 до 1000 символов' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'comment' then
    if jsonb_typeof(p_patch -> 'comment') = 'null' then
      v_comment := null;
    elsif jsonb_typeof(p_patch -> 'comment') = 'string' then
      v_comment := nullif(btrim(p_patch ->> 'comment'), '');
      if char_length(coalesce(v_comment, '')) > 1000 then
        raise exception 'Комментарий — не длиннее 1000 символов' using errcode = '22023';
      end if;
    else
      raise exception 'Комментарий должен быть строкой или null' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'due_month' then
    if jsonb_typeof(p_patch -> 'due_month') = 'null' then
      v_month := null;
    elsif jsonb_typeof(p_patch -> 'due_month') = 'number' and (p_patch ->> 'due_month') ~ '^\d{1,3}$' then
      v_month := (p_patch ->> 'due_month')::integer;
      if v_month not between 1 and 12 then
        raise exception 'Месяц срока — от 1 до 12' using errcode = '22023';
      end if;
    else
      raise exception 'Месяц срока должен быть целым числом или null' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'due_day' then
    if jsonb_typeof(p_patch -> 'due_day') = 'number' and (p_patch ->> 'due_day') ~ '^\d{1,3}$' then
      v_day := (p_patch ->> 'due_day')::integer;
      if v_day not between 1 and 31 then
        raise exception 'День срока — от 1 до 31' using errcode = '22023';
      end if;
    else
      raise exception 'День срока должен быть целым числом' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'due_month_offset' then
    if jsonb_typeof(p_patch -> 'due_month_offset') = 'number' and (p_patch ->> 'due_month_offset') ~ '^\d{1,3}$' then
      v_month_offset := (p_patch ->> 'due_month_offset')::integer;
      if v_month_offset not between 0 and 12 then
        raise exception 'Смещение срока в месяцах — от 0 до 12' using errcode = '22023';
      end if;
    else
      raise exception 'Смещение срока в месяцах должно быть целым числом' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'due_year_offset' then
    if jsonb_typeof(p_patch -> 'due_year_offset') = 'number' and (p_patch ->> 'due_year_offset') ~ '^\d{1,3}$' then
      v_year_offset := (p_patch ->> 'due_year_offset')::integer;
      if v_year_offset not between 0 and 3 then
        raise exception 'Смещение срока в годах — от 0 до 3' using errcode = '22023';
      end if;
    else
      raise exception 'Смещение срока в годах должно быть целым числом' using errcode = '22023';
    end if;
  end if;

  -- Годовая форма: срок = день.месяц года, поэтому месяц обязателен, а день должен существовать в этом месяце.
  if d.period_kind = 'year' then
    if v_month is null then
      raise exception 'Для годовой формы укажите месяц срока' using errcode = '22023';
    end if;
    if v_day > extract(day from (make_date(2024, v_month, 1) + interval '1 month' - interval '1 day'))::integer then
      raise exception 'В выбранном месяце нет дня %', v_day using errcode = '22023';
    end if;
  end if;

  update public.report_deadlines
     set title = v_title, description = v_description, comment = v_comment, due_month = v_month, due_day = v_day,
         due_month_offset = v_month_offset, due_year_offset = v_year_offset
   where form_code = p_form_code
  returning * into v_new;

  foreach v_key in array c_allowed loop
    if (to_jsonb(d) -> v_key) is distinct from (to_jsonb(v_new) -> v_key) then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', to_jsonb(d) -> v_key, 'to', to_jsonb(v_new) -> v_key));
    end if;
  end loop;
  if v_changes <> '{}'::jsonb then
    perform public.admin_audit('deadline.update', 'deadline', p_form_code, jsonb_build_object('changes', v_changes));
  end if;

  return to_jsonb(v_new);
end;
$$;

-- ─── Поддержка ──────────────────────────────────────────────────────────────

create function public.admin_list_tickets(
  p_status text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text := public.admin_like(p_search);
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if v_status is not null and v_status not in ('new', 'in_progress', 'answered', 'closed') then
    raise exception 'Неизвестный статус обращения: %', v_status using errcode = '22023';
  end if;

  with f as (
    select t.id, t.created_at
    from public.support_tickets t
    join public.farms fm on fm.id = t.farm_id
    left join public.profiles o on o.id = fm.owner_id
    where t.deleted_at is null
      and (v_status is null or t.status = v_status)
      and (v_like is null
        or t.number ilike v_like
        or t.topic ilike v_like
        or t.message ilike v_like
        or fm.name ilike v_like
        or o.full_name ilike v_like
        or o.email ilike v_like)
  ),
  pg as (select id, created_at from f order by created_at desc, id limit v_limit offset v_offset)
  select (select count(*) from f),
         coalesce((select jsonb_agg(public.admin_ticket_json(pg.id) order by pg.created_at desc, pg.id) from pg), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- Ответ на обращение и/или смена статуса. Непустой новый ответ уходит хозяйству уведомлением kind = 'admin'
-- «Ответ поддержки · <номер>». p_reply = null — ответ не меняется; p_status = null — 'answered' при новом ответе, иначе без изменений.
create function public.admin_reply_ticket(p_ticket_id uuid, p_reply text default null, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
  v_status text;
  v_notify boolean;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if v_reply is not null and char_length(v_reply) > 4000 then
    raise exception 'Ответ — не длиннее 4000 символов' using errcode = '22023';
  end if;

  select * into t from public.support_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found then
    raise exception 'Обращение не найдено' using errcode = 'P0002';
  end if;

  v_status := coalesce(nullif(btrim(coalesce(p_status, '')), ''), case when v_reply is not null then 'answered' else t.status end);
  if v_status not in ('new', 'in_progress', 'answered', 'closed') then
    raise exception 'Неизвестный статус обращения: %', v_status using errcode = '22023';
  end if;
  v_notify := v_reply is not null and v_reply is distinct from t.admin_reply;

  update public.support_tickets
     set status = v_status,
         admin_reply = coalesce(v_reply, admin_reply),
         replied_at = case when v_notify then now() else replied_at end,
         replied_by = case when v_notify then (select auth.uid()) else replied_by end
   where id = p_ticket_id;

  if v_notify then
    insert into public.notifications (farm_id, kind, title, body)
    values (t.farm_id, 'admin', 'Ответ поддержки · ' || t.number, v_reply);
  end if;

  perform public.admin_audit(
    'ticket.reply', 'ticket', p_ticket_id::text,
    jsonb_build_object('number', t.number, 'status', v_status, 'replied', v_notify, 'farm_id', t.farm_id)
  );
  return public.admin_ticket_json(p_ticket_id);
end;
$$;

-- ─── Рассылки ───────────────────────────────────────────────────────────────

-- Уведомление kind = 'admin' каждому хозяйству выбранной группы. user_ids — владельцы и одобренные участники этих хозяйств
-- (получатели push); сам push отправляет сервер (Expo, сервисный ключ) и записывает push_sent.
create function public.admin_broadcast(
  p_title text,
  p_body text,
  p_target text,
  p_status text default null,
  p_farm_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_farms uuid[];
  v_users uuid[];
  v_id uuid;
  v_target jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  if v_title = '' or char_length(v_title) > 120 then
    raise exception 'Заголовок — от 1 до 120 символов' using errcode = '22023';
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'Текст — от 1 до 2000 символов' using errcode = '22023';
  end if;

  if p_target = 'all' then
    select array_agg(f.id) into v_farms from public.farms f where f.deleted_at is null;
    v_status := null;
  elsif p_target = 'status' then
    if v_status is null or v_status not in ('kfh', 'ip', 'lph') then
      raise exception 'Выберите статус хозяйства: kfh, ip или lph' using errcode = '22023';
    end if;
    select array_agg(f.id) into v_farms from public.farms f where f.deleted_at is null and f.legal_status::text = v_status;
  elsif p_target = 'farms' then
    if p_farm_ids is null or cardinality(p_farm_ids) = 0 then
      raise exception 'Выберите хозяйства для рассылки' using errcode = '22023';
    end if;
    select array_agg(f.id) into v_farms from public.farms f where f.deleted_at is null and f.id = any (p_farm_ids);
    v_status := null;
  else
    raise exception 'Неизвестный тип получателей: %', coalesce(p_target, 'null') using errcode = '22023';
  end if;
  if v_farms is null or cardinality(v_farms) = 0 then
    raise exception 'Нет хозяйств для рассылки' using errcode = '22023';
  end if;

  v_target := jsonb_build_object(
    'target', p_target,
    'status', v_status,
    'farm_ids', case when p_target = 'farms' then to_jsonb(v_farms) else null end
  );
  insert into public.admin_broadcasts (title, body, target, farms_count, created_by, created_by_email)
  values (
    v_title, v_body, v_target, cardinality(v_farms), (select auth.uid()),
    (select a.email from public.app_admins a where a.user_id = (select auth.uid()))
  )
  returning id into v_id;

  insert into public.notifications (farm_id, kind, title, body)
  select fid, 'admin', v_title, v_body from unnest(v_farms) as fid;

  select coalesce(array_agg(distinct s.u), '{}'::uuid[]) into v_users
  from (
    select m.user_id as u from public.farm_members m where m.farm_id = any (v_farms)
    union
    select f.owner_id from public.farms f where f.id = any (v_farms)
  ) s;

  perform public.admin_audit(
    'broadcast.send', 'broadcast', v_id::text,
    jsonb_build_object('title', v_title, 'target', v_target, 'farms_count', cardinality(v_farms))
  );
  return jsonb_build_object('broadcast_id', v_id, 'farms_count', cardinality(v_farms), 'user_ids', to_jsonb(v_users));
end;
$$;

create function public.admin_list_broadcasts(p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  select count(*) into v_total from public.admin_broadcasts;
  select coalesce(jsonb_agg(
           jsonb_build_object('id', x.id, 'title', x.title, 'body', x.body, 'target', x.target, 'farms_count', x.farms_count,
                              'push_sent', x.push_sent, 'created_by', x.created_by, 'created_by_email', x.created_by_email,
                              'created_at', x.created_at)
           order by x.created_at desc, x.id
         ), '[]'::jsonb)
    into v_items
  from (
    select b.* from public.admin_broadcasts b order by b.created_at desc, b.id limit v_limit offset v_offset
  ) x;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ─── Журнал действий ────────────────────────────────────────────────────────

create function public.admin_list_audit(p_action text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_total integer;
  v_items jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Только для администраторов' using errcode = '42501';
  end if;
  select count(*) into v_total from public.admin_audit_log l where v_action is null or l.action = v_action;
  select coalesce(jsonb_agg(
           jsonb_build_object('id', x.id, 'admin_id', x.admin_id, 'admin_email', x.admin_email, 'action', x.action,
                              'target_type', x.target_type, 'target_id', x.target_id, 'details', x.details, 'created_at', x.created_at)
           order by x.created_at desc, x.id
         ), '[]'::jsonb)
    into v_items
  from (
    select l.* from public.admin_audit_log l
    where v_action is null or l.action = v_action
    order by l.created_at desc, l.id
    limit v_limit offset v_offset
  ) x;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ─── Права на RPC ───────────────────────────────────────────────────────────

revoke execute on function public.admin_stats(date, date) from public, anon;
grant execute on function public.admin_stats(date, date) to authenticated;
revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
revoke execute on function public.admin_list_farms(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_farms(text, text, integer, integer) to authenticated;
revoke execute on function public.admin_get_farm(uuid) from public, anon;
grant execute on function public.admin_get_farm(uuid) to authenticated;
revoke execute on function public.admin_list_submissions(text, integer, text, integer, integer) from public, anon;
grant execute on function public.admin_list_submissions(text, integer, text, integer, integer) to authenticated;
revoke execute on function public.admin_update_deadline(text, jsonb) from public, anon;
grant execute on function public.admin_update_deadline(text, jsonb) to authenticated;
revoke execute on function public.admin_list_tickets(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_tickets(text, text, integer, integer) to authenticated;
revoke execute on function public.admin_reply_ticket(uuid, text, text) from public, anon;
grant execute on function public.admin_reply_ticket(uuid, text, text) to authenticated;
revoke execute on function public.admin_broadcast(text, text, text, text, uuid[]) from public, anon;
grant execute on function public.admin_broadcast(text, text, text, text, uuid[]) to authenticated;
revoke execute on function public.admin_list_broadcasts(integer, integer) from public, anon;
grant execute on function public.admin_list_broadcasts(integer, integer) to authenticated;
revoke execute on function public.admin_list_audit(text, integer, integer) from public, anon;
grant execute on function public.admin_list_audit(text, integer, integer) to authenticated;
