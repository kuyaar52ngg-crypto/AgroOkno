-- Коды подтверждения: несколько действующих кодов и защита от повторной отправки.
-- Письма с кодами приходят не по порядку (двойное нажатие, «Отправить повторно»), поэтому принимаем любой
-- из последних кодов, пока не истёк срок. Выдачу делает одна функция под блокировкой строки, чтобы
-- одновременные запросы не затирали код друг друга.

alter table public.recovery_codes
  add column if not exists prev_hashes text[] not null default '{}',
  add column if not exists sent_at timestamptz not null default now();

-- Возвращает 0, если код сохранён, иначе — сколько секунд подождать до следующей отправки.
create or replace function public.push_recovery_code(
  p_user uuid,
  p_hash text,
  p_ttl_seconds integer default 600,
  p_gap_seconds integer default 30,
  p_keep integer default 5
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recovery_codes;
begin
  select * into r from public.recovery_codes where user_id = p_user for update;
  if found and r.expires_at > now() and r.sent_at > now() - make_interval(secs => p_gap_seconds) then
    return greatest(1, ceil(extract(epoch from (r.sent_at + make_interval(secs => p_gap_seconds) - now())))::integer);
  end if;

  insert into public.recovery_codes as rc (user_id, code_hash, prev_hashes, expires_at, sent_at, attempts)
  values (p_user, p_hash, '{}', now() + make_interval(secs => p_ttl_seconds), now(), 0)
  on conflict (user_id) do update set
    prev_hashes = case
      when rc.expires_at > now() then (array[rc.code_hash] || rc.prev_hashes)[1:greatest(p_keep - 1, 0)]
      else '{}'::text[]
    end,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    sent_at = excluded.sent_at,
    attempts = 0;
  return 0;
end;
$$;

revoke all on function public.push_recovery_code(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.push_recovery_code(uuid, text, integer, integer, integer) to service_role;
