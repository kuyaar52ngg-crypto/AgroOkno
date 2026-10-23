-- Справочник сроков сдачи, ослабление периодичности 1-ИП, уточнения submit_report.
-- Сроки: 3-фермер — с 4 по 10 января (бланк Росстата); 1-фермер — до 15 июня (бланк);
-- 2-фермер — до 21 ноября (бланк). Сроки 1-КФХ/1-ИП (Минсельхоз, приказ № 165) и республиканских
-- форм Сахастата не удалось прочитать в сканах приказов — значения демонстрационные, как в макете.

alter table public.report_deadlines drop constraint report_deadlines_period_kind_check;
alter table public.report_deadlines
  add constraint report_deadlines_period_kind_check check (period_kind in ('year', 'month', 'any'));

insert into public.report_deadlines
  (form_code, title, description, authority, recipient, scope, receipt_code, period_kind,
   period_shift_months, due_month_offset, due_year_offset, due_month, due_day, has_official_blank, comment)
values
  ('3-fermer',       'Форма 3-фермер',        'Производство продукции животноводства и поголовье скота', 'rosstat',   'Росстат',            'federal',  '3Ф',     'year',  0, 0, 1, 1,  10, true,  'Бланк Росстата: с 4 по 10 января после отчётного периода'),
  ('3-fermer-month', 'Форма 3-фермер (рег)',  'Производство продукции · региональная',                   'sakhastat', 'Сахастат',           'regional', 'ЗФР',    'month', -1, 1, 0, null, 20, true, 'Ежемесячная версия; срок демонстрационный'),
  ('1-fermer',       'Форма 1-фермер',        'Сведения об итогах сева под урожай',                      'rosstat',   'Росстат',            'federal',  '1Ф',     'year',  0, 0, 0, 6,  15, true,  'Бланк Росстата: с 30 апреля по 15 июня'),
  ('2-fermer',       'Форма 2-фермер',        'Сведения о сборе урожая сельскохозяйственных культур',    'rosstat',   'Росстат',            'federal',  '2Ф',     'year',  0, 0, 0, 11, 21, true,  'Бланк Росстата: с 13 октября по 21 ноября'),
  ('1-kfh',          'Форма 1-КФХ',           'Информация о производственной деятельности глав КФХ',     'minselhoz', 'Минсельхоз России',  'federal',  '1КФХ',   'year',  0, 0, 1, 2,  25, true,  'Срок не прочитан в скане приказа Минсельхоза № 165 — демонстрационный'),
  ('1-ip',           'Форма 1-ИП',            'Сведения о деятельности хозяйства',                       'rosstat',   'Росстат',            'federal',  '1ИП',    'any',   -1, 1, 0, 2, 15, true,  'Для ЛПХ — ежемесячное демо-превью (как в макете); для ИП — годовая форма Минсельхоза'),
  ('1-tabun',        'Форма 1-ТАБУН',         'Табунное коневодство',                                    'sakhastat', 'Сахастат',           'regional', 'ТАБУН',  'month', 0, 0, 0, null, 20, false, 'Республиканская форма Сахастата, бланка нет — только превью'),
  ('10-sh',          'Форма 10-СХ',           'Сведения о заготовке кормов',                             'rosstat',   'Росстат',            'federal',  '10СХ',   'month', -1, 1, 0, null, 15, false, 'Бланка нет — только превью'),
  ('1-iso-r',        'Форма 1-ИСО-р',         'Сведения о поголовье животных',                           'rosstat',   'Росстат',            'federal',  'ИСО',    'month', 0, 0, 0, null, 30, false, 'Бланка нет — только превью')
on conflict (form_code) do nothing;

create or replace function public.submit_report(
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
  v_recipient text;
  v_at timestamptz := now();
  v_existing public.report_submissions;
  v_status public.farm_kind;
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

  select f.legal_status into v_status from public.farms f where f.id = p_farm_id;
  v_recipient := case when p_form_code = '1-ip' and v_status <> 'lph' then 'Минсельхоз России' else d.recipient end;

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
       set status = 'submitted', recipient = v_recipient, receipt_no = v_receipt,
           submitted_at = v_at, snapshot = p_snapshot
     where s.id = v_existing.id;
  else
    insert into public.report_submissions (farm_id, form_code, period_year, period_month, status, recipient, receipt_no, submitted_at, snapshot)
    values (p_farm_id, p_form_code, p_year, p_month, 'submitted', v_recipient, v_receipt, v_at, p_snapshot);
  end if;

  insert into public.notifications (farm_id, kind, title, body, form_code)
  values (p_farm_id, 'submitted', replace(d.title, 'Форма ', '') || ' сдан',
          'Учебная квитанция ' || v_receipt || ' доступна в отчёте.', p_form_code);

  return query select v_receipt, v_at, v_recipient;
end;
$$;
revoke execute on function public.submit_report(uuid, text, integer, integer, jsonb) from public, anon;
grant execute on function public.submit_report(uuid, text, integer, integer, jsonb) to authenticated;
