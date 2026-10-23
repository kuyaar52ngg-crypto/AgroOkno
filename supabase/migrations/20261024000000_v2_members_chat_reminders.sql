-- AgroOkno v2: участники хозяйства, запросы доступа, регистрация/онбординг, чат-помощник, напоминания и push.
-- RLS всех таблиц хозяйства остаётся на public.owns_farm(), но теперь функция проверяет членство
-- (владелец или одобренный участник) через farm_members, а не только farms.owner_id.

-- ─── Участники хозяйства ────────────────────────────────────────────────────

create table public.farm_members (
  farm_id     uuid not null references public.farms (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (farm_id, user_id)
);
create index farm_members_user_idx on public.farm_members (user_id);
alter table public.farm_members enable row level security;

-- Перенос существующих владельцев.
insert into public.farm_members (farm_id, user_id, role)
select f.id, f.owner_id, 'owner' from public.farms f
on conflict do nothing;

-- Код приглашения: AGRO-<номер записи книги> (у демо-ЛПХ AGRO-0142).
alter table public.farms add column invite_code text;
create unique index farms_invite_code_uq on public.farms (invite_code);
create sequence public.farm_code_seq start 1000;

update public.farms set invite_code = 'AGRO-' || lpad(book_record_no, 4, '0') where book_record_no ~ '^\d+$';
update public.farms f set invite_code = 'AGRO-' || lpad((200 + s.n)::text, 4, '0')
from (select id, row_number() over (order by created_at, id) as n from public.farms where invite_code is null) s
where f.id = s.id;

-- Доступ: владелец или одобренный участник. Имя функции сохранено — политики остальных таблиц не меняются.
create or replace function public.owns_farm(target_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.farm_members m
    where m.farm_id = target_farm_id and m.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.farms f
    where f.id = target_farm_id and f.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_farm_owner(target_farm_id uuid)
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
revoke execute on function public.is_farm_owner(uuid) from public, anon;
grant execute on function public.is_farm_owner(uuid) to authenticated;

-- Владелец хозяйства автоматически становится его участником (в т.ч. при вставке через синхронизацию v1).
create function public.farms_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.farm_members (farm_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  if new.invite_code is null then
    update public.farms set invite_code = 'AGRO-' || lpad(nextval('public.farm_code_seq')::text, 4, '0') where id = new.id;
  end if;
  return new;
end;
$$;
create trigger farms_add_owner_member after insert on public.farms
  for each row execute procedure public.farms_add_owner_member();
revoke execute on function public.farms_add_owner_member() from public, anon, authenticated;

-- Клиент не меняет код приглашения (дополнение защитного триггера).
create or replace function public.farms_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.book_record_no := old.book_record_no;
    new.owner_id := old.owner_id;
    new.invite_code := old.invite_code;
  end if;
  return new;
end;
$$;

-- farms: видят владелец, участники и специалист сельсовета; правят владелец и участники; удаляет только владелец.
drop policy "farms: select" on public.farms;
create policy "farms: select" on public.farms
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.owns_farm(id) or public.is_council_for(id));
drop policy "own farms: update" on public.farms;
create policy "farms: update" on public.farms
  for update to authenticated
  using (public.owns_farm(id)) with check (public.owns_farm(id));

create policy "members: select own or owner" on public.farm_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_farm_owner(farm_id));

-- ─── Запросы доступа ────────────────────────────────────────────────────────

create table public.farm_join_requests (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  farm_name        text not null,
  farm_settlement  text,
  contact          text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid references auth.users (id) on delete set null
);
create unique index farm_join_requests_pending_uq on public.farm_join_requests (farm_id, user_id) where status = 'pending';
create index farm_join_requests_user_idx on public.farm_join_requests (user_id, updated_at);
create index farm_join_requests_farm_idx on public.farm_join_requests (farm_id, status);
create index farm_join_requests_decided_by_idx on public.farm_join_requests (decided_by);
create trigger set_updated_at before update on public.farm_join_requests
  for each row execute procedure extensions.moddatetime (updated_at);
alter table public.farm_join_requests enable row level security;
create policy "join requests: select" on public.farm_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_farm_owner(farm_id));

-- ─── RPC: онбординг и доступ ────────────────────────────────────────────────

-- Хозяйство текущего пользователя (владелец или участник): одна учётная запись — одно хозяйство.
create function public.my_farm_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.farm_id from public.farm_members m
  join public.farms f on f.id = m.farm_id and f.deleted_at is null
  where m.user_id = (select auth.uid())
  order by (m.role = 'owner') desc, m.created_at
  limit 1;
$$;
revoke execute on function public.my_farm_id() from public, anon;
grant execute on function public.my_farm_id() to authenticated;

-- R5: создать хозяйство. Для ЛПХ создаётся запись книги и глава хозяйства.
create function public.create_farm(
  p_name text,
  p_legal_status text,
  p_region text,
  p_settlement text,
  p_inn text default null
)
returns public.farms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_no bigint;
  v_farm public.farms;
  v_status public.farm_kind;
  v_name text := btrim(coalesce(p_name, ''));
  v_head text;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Укажите название хозяйства' using errcode = '22023';
  end if;
  if p_legal_status not in ('kfh', 'ip', 'lph') then
    raise exception 'Неизвестная форма хозяйства' using errcode = '22023';
  end if;
  v_status := p_legal_status::public.farm_kind;
  if nullif(btrim(p_inn), '') is not null and btrim(p_inn) !~ '^(\d{10}|\d{12})$' then
    raise exception 'ИНН — 10 или 12 цифр' using errcode = '22023';
  end if;
  if public.my_farm_id() is not null then
    raise exception 'У вас уже есть хозяйство' using errcode = '23505';
  end if;

  select full_name into v_head from public.profiles where id = v_uid;
  v_no := nextval('public.farm_code_seq');

  insert into public.farms (owner_id, legal_status, name, inn, region, settlement, head_name, book_record_no, invite_code)
  values (
    v_uid, v_status, v_name, nullif(btrim(p_inn), ''), nullif(btrim(p_region), ''), nullif(btrim(p_settlement), ''),
    v_head,
    case when v_status = 'lph' then lpad(v_no::text, 4, '0') end,
    'AGRO-' || lpad(v_no::text, 4, '0')
  )
  returning * into v_farm;

  if v_status = 'lph' then
    insert into public.household_members (farm_id, full_name, relation, is_head, consent)
    values (v_farm.id, coalesce(nullif(v_head, ''), 'Глава хозяйства'), 'Глава ЛПХ', true, true);
  end if;

  -- Специалисту сельсовета поселение берётся из хозяйства (profiles_guard).
  update public.profiles set settlement = v_farm.settlement where id = v_uid and role = 'council_specialist';
  return v_farm;
end;
$$;
revoke execute on function public.create_farm(text, text, text, text, text) from public, anon;
grant execute on function public.create_farm(text, text, text, text, text) to authenticated;

-- R7: поиск хозяйства по коду приглашения или ИНН. Возвращает только название и населённый пункт.
create function public.find_farm(p_query text)
returns table (farm_id uuid, name text, region text, settlement text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := upper(btrim(coalesce(p_query, '')));
  digits text := regexp_replace(q, '\D', '', 'g');
begin
  if (select auth.uid()) is null or length(q) < 3 then
    return;
  end if;
  return query
    select f.id, f.name, f.region, f.settlement
    from public.farms f
    where f.deleted_at is null
      and (
        f.invite_code = q
        or (q ~ '^\d{1,6}$' and f.invite_code = 'AGRO-' || lpad(q, 4, '0'))
        or (digits ~ '^(\d{10}|\d{12})$' and f.inn = digits)
      )
    limit 1;
end;
$$;
revoke execute on function public.find_farm(text) from public, anon;
grant execute on function public.find_farm(text) to authenticated;

-- R7→R8: запросить доступ к хозяйству.
create function public.request_farm_access(p_farm_id uuid)
returns public.farm_join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_farm public.farms;
  v_contact text;
  v_req public.farm_join_requests;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;
  select * into v_farm from public.farms where id = p_farm_id and deleted_at is null;
  if not found then
    raise exception 'Хозяйство не найдено' using errcode = 'P0002';
  end if;
  if public.my_farm_id() is not null then
    raise exception 'У вас уже есть хозяйство' using errcode = '23505';
  end if;
  select coalesce(p.email, p.phone) into v_contact from public.profiles p where p.id = v_uid;

  select * into v_req from public.farm_join_requests
   where farm_id = p_farm_id and user_id = v_uid and status = 'pending';
  if found then
    return v_req;
  end if;

  insert into public.farm_join_requests (farm_id, user_id, farm_name, farm_settlement, contact)
  values (p_farm_id, v_uid, v_farm.name, v_farm.settlement, v_contact)
  returning * into v_req;

  insert into public.notifications (farm_id, kind, title, body)
  values (p_farm_id, 'sync', 'Запрос доступа к хозяйству',
          'Пользователь ' || coalesce(v_contact, 'без контакта') || ' просит доступ. Подтвердите запрос в разделе «Участники».');
  return v_req;
end;
$$;
revoke execute on function public.request_farm_access(uuid) from public, anon;
grant execute on function public.request_farm_access(uuid) to authenticated;

-- Решение владельца по запросу.
create function public.resolve_join_request(p_id uuid, p_approve boolean)
returns public.farm_join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.farm_join_requests;
begin
  select * into v_req from public.farm_join_requests where id = p_id for update;
  if not found then
    raise exception 'Запрос не найден' using errcode = 'P0002';
  end if;
  if v_uid is null or not public.is_farm_owner(v_req.farm_id) then
    raise exception 'Решение может принять только владелец хозяйства' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Запрос уже обработан' using errcode = '23505';
  end if;
  if p_approve and exists (select 1 from public.farm_members m where m.user_id = v_req.user_id) then
    raise exception 'У пользователя уже есть хозяйство' using errcode = '23505';
  end if;

  update public.farm_join_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = v_uid
   where id = p_id
  returning * into v_req;

  if p_approve then
    insert into public.farm_members (farm_id, user_id, role) values (v_req.farm_id, v_req.user_id, 'member')
    on conflict do nothing;
  end if;
  return v_req;
end;
$$;
revoke execute on function public.resolve_join_request(uuid, boolean) from public, anon;
grant execute on function public.resolve_join_request(uuid, boolean) to authenticated;

-- ─── Вход по ИНН / email / телефону ─────────────────────────────────────────

create index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_phone_tail_idx on public.profiles ((right(regexp_replace(phone, '\D', '', 'g'), 10)));

-- Возвращает технический email учётной записи для signInWithPassword. Реальные контакты наружу не отдаются.
-- Для неизвестного идентификатора возвращается заведомо несуществующий адрес — ошибка входа та же, что при неверном пароле.
create function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ident text := btrim(coalesce(p_identifier, ''));
  digits text := regexp_replace(ident, '\D', '', 'g');
  v_email text;
begin
  if ident = '' then
    return 'unknown@invalid.agrookno.app';
  end if;

  if digits ~ '^(\d{10}|\d{12})$' and position('@' in ident) = 0 then
    select u.email into v_email
    from public.farms f join auth.users u on u.id = f.owner_id
    where f.inn = digits and f.deleted_at is null
    limit 1;
  end if;

  if v_email is null and position('@' in ident) > 0 then
    select u.email into v_email
    from public.profiles p join auth.users u on u.id = p.id
    where lower(p.email) = lower(ident)
    order by p.created_at
    limit 1;
  end if;

  if v_email is null and length(digits) >= 10 then
    select u.email into v_email
    from public.profiles p join auth.users u on u.id = p.id
    where p.phone is not null and right(regexp_replace(p.phone, '\D', '', 'g'), 10) = right(digits, 10)
    order by p.created_at
    limit 1;
  end if;

  return coalesce(v_email, 'unknown@invalid.agrookno.app');
end;
$$;
revoke execute on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ─── Настройки напоминаний (J8) ─────────────────────────────────────────────

alter table public.user_settings
  add column reminders_in_chat boolean not null default true,
  add column remind_7_days     boolean not null default true,
  add column remind_1_day      boolean not null default true;

-- ─── Push-токены и журнал напоминаний ───────────────────────────────────────

create table public.push_tokens (
  user_id     uuid not null references auth.users (id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  updated_at  timestamptz not null default now(),
  primary key (token)
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "own push tokens: select" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own push tokens: delete" on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- Токен привязывается к текущему пользователю (устройство могло сменить владельца).
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values ((select auth.uid()), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create table public.reminder_log (
  farm_id    uuid not null references public.farms (id) on delete cascade,
  form_code  text not null,
  period     text not null,           -- '2026' или '2026-10'
  kind       text not null check (kind in ('7d', '1d', 'overdue')),
  sent_at    timestamptz not null default now(),
  primary key (farm_id, form_code, period, kind)
);
alter table public.reminder_log enable row level security; -- без политик: только service role

-- ─── Чат-помощник ───────────────────────────────────────────────────────────

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  farm_id      uuid not null references public.farms (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  text         text not null,
  cards        jsonb,
  from_voice   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index chat_messages_user_idx on public.chat_messages (user_id, updated_at);
create index chat_messages_farm_idx on public.chat_messages (farm_id);
create trigger set_updated_at before update on public.chat_messages
  for each row execute procedure extensions.moddatetime (updated_at);
alter table public.chat_messages enable row level security;
create policy "chat: own messages" on public.chat_messages
  for all to authenticated
  using (user_id = (select auth.uid()) and public.owns_farm(farm_id))
  with check (user_id = (select auth.uid()) and public.owns_farm(farm_id));

-- Хранение 90 дней: очистку вызывает серверная задача напоминаний (service role).
create function public.purge_old_chat_messages()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.chat_messages where created_at < now() - interval '90 days' returning 1)
  select count(*)::int from d;
$$;
revoke execute on function public.purge_old_chat_messages() from public, anon, authenticated;

-- ─── Права ──────────────────────────────────────────────────────────────────

revoke all on public.farm_members, public.farm_join_requests, public.push_tokens, public.reminder_log, public.chat_messages from anon;
grant select on public.farm_members, public.farm_join_requests to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
