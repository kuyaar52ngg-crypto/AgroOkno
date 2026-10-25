-- Смена модели помощника пишется в журнал действий администраторов (action = assistant.model_update).
create or replace function public.set_assistant_model_settings(p_model text, p_fallbacks text[] default '{}')
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
  v_before jsonb;
  v_after jsonb;
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

  v_before := public.get_assistant_model_settings();

  insert into public.app_settings (key, value, updated_by)
  values ('assistant_model', jsonb_build_object('model', v_model, 'fallback_models', to_jsonb(v_fallbacks)), v_email)
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  v_after := public.get_assistant_model_settings();
  if (v_before -> 'model') is distinct from (v_after -> 'model')
     or (v_before -> 'fallback_models') is distinct from (v_after -> 'fallback_models') then
    perform public.admin_audit(
      'assistant.model_update', 'assistant_model', v_after ->> 'model',
      jsonb_build_object(
        'from', jsonb_build_object('model', v_before -> 'model', 'fallback_models', v_before -> 'fallback_models'),
        'to', jsonb_build_object('model', v_after -> 'model', 'fallback_models', v_after -> 'fallback_models')
      )
    );
  end if;

  return v_after;
end;
$$;
revoke execute on function public.set_assistant_model_settings(text, text[]) from public, anon;
grant execute on function public.set_assistant_model_settings(text, text[]) to authenticated;
