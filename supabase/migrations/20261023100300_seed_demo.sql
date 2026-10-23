-- Демо-данные АгроОкно (учебные). Пароль всех демо-аккаунтов: AgroOkno2026!
--   143512345660 — «ЛПХ Ивановы» (ЛПХ, с. Намцы) — данные как в макете Figma;
--   143500987654 — КФХ «Эрилик» (глава КФХ) — события 2025–2026 для годовых форм 3/1/2-фермер, 1-КФХ;
--   143500111222 — новый пользователь без роли и без данных (проверка шага A7).
-- Молоко в БД хранится в кг (1 л = 1,03 кг).

do $seed$
declare
  pw constant text := 'AgroOkno2026!';
  u1 constant uuid := 'a0000000-0000-4000-8000-000000000001';
  u2 constant uuid := 'a0000000-0000-4000-8000-000000000002';
  u3 constant uuid := 'a0000000-0000-4000-8000-000000000003';
  f1 constant uuid := 'f0000000-0000-4000-8000-000000000001';
  f2 constant uuid := 'f0000000-0000-4000-8000-000000000002';
  f3 constant uuid := 'f0000000-0000-4000-8000-000000000003';
  rec record;
  d date;
begin
  -- ── Пользователи Auth ───────────────────────────────────────────────────
  for rec in
    select * from (values
      (u1, '143512345660', 'Иван Иванов'),
      (u2, '143500987654', 'Пётр Петров'),
      (u3, '143500111222', 'Новый пользователь')
    ) as t(id, inn, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated',
      rec.inn || '@agrookno.app', extensions.crypt(pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', rec.full_name), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), rec.id,
            jsonb_build_object('sub', rec.id::text, 'email', rec.inn || '@agrookno.app', 'email_verified', true),
            'email', rec.id::text, now(), now(), now());
  end loop;

  update public.profiles set email = 'ivan@example.com', role = 'lph_owner', full_name = 'Иван Иванов' where id = u1;
  update public.profiles set email = 'petrov@example.com', phone = '+79140000002', role = 'farm_head', full_name = 'Пётр Петров' where id = u2;

  -- ── Хозяйства ───────────────────────────────────────────────────────────
  insert into public.farms (id, owner_id, legal_status, name, inn, region, settlement, address, head_name, book_record_no, cadastral_no, plot_area_m2)
  values (f1, u1, 'lph', 'ЛПХ Ивановых', '143512345660', 'Республика Саха (Якутия)', 'с. Намцы', 'ул. Луговая, 12',
          'Иванов Иван Иванович', '0142', '14:18:010001:1248', 2500);
  insert into public.farms (id, owner_id, legal_status, name, inn, ogrn, okpo, oktmo, region, settlement, address, head_name)
  values (f2, u2, 'kfh', 'КФХ «Эрилик»', '143500987654', '1141400000123', '12345678', '98631000', 'Республика Саха (Якутия)',
          'с. Хатассы', 'с. Хатассы, ул. Центральная, 5', 'Петров Пётр Петрович');
  insert into public.farms (id, owner_id, legal_status, name, inn, region, settlement, address, head_name)
  values (f3, u3, 'kfh', 'Новое хозяйство', '143500111222', 'Республика Саха (Якутия)', null, null, 'Новый Пользователь');

  insert into public.user_settings (user_id) values (u1), (u2), (u3);

  -- ── ЛПХ Ивановых ────────────────────────────────────────────────────────
  insert into public.household_members (farm_id, full_name, birth_date, relation, is_head, consent) values
    (f1, 'Иван Иванов',   '1982-03-12', 'Глава ЛПХ', true,  true),
    (f1, 'Мария Иванова', '1984-07-21', 'Супруга',   false, true),
    (f1, 'Алексей Иванов','2010-09-05', 'Сын',       false, true);

  -- Начальные остатки на 01.01.2026: коровы 15, телята 8, лошади 18+7+4, овцы 24.
  insert into public.livestock_movements (farm_id, occurred_on, animal_group, kind, heads, note) values
    (f1, '2026-01-01', 'cattle_cows',       'opening_balance', 15, 'Остаток на начало учёта'),
    (f1, '2026-01-01', 'cattle_calves',     'opening_balance', 8,  'Остаток на начало учёта'),
    (f1, '2026-01-01', 'horses_mares',      'opening_balance', 18, 'Остаток на начало учёта'),
    (f1, '2026-01-01', 'horses_young',      'opening_balance', 7,  'Остаток на начало учёта'),
    (f1, '2026-01-01', 'horses_stallions',  'opening_balance', 4,  'Остаток на начало учёта'),
    (f1, '2026-01-01', 'sheep',             'opening_balance', 24, 'Остаток на начало учёта');
  -- Октябрь: табун 29 + 6 − 1 − 2 = 32.
  insert into public.livestock_movements (farm_id, occurred_on, animal_group, kind, heads, live_weight_kg, note) values
    (f1, '2026-10-05', 'horses_young', 'birth',    6, null, 'Приплод жеребят'),
    (f1, '2026-10-12', 'horses_young', 'death',    1, null, 'Падёж'),
    (f1, '2026-10-15', 'horses_young', 'slaughter',2, 500,  'Забой на мясо');

  -- Надой: сентябрь 1 080 л (30 × 36 л), октябрь 1 200 л (1–18: 60 л; 19: 38; 21: 42; 23: 40).
  for d in select generate_series('2026-09-01'::date, '2026-09-30'::date, '1 day')::date loop
    insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group, note)
    values (f1, d, 'milk', round(36 * 1.03, 3), 'cattle_cows', null);
  end loop;
  for d in select generate_series('2026-10-01'::date, '2026-10-18'::date, '1 day')::date loop
    insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group, note)
    values (f1, d, 'milk', round(60 * 1.03, 3), 'cattle_cows', null);
  end loop;
  insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group, note) values
    (f1, '2026-10-19', 'milk', round(38 * 1.03, 3), 'cattle_cows', 'Утренний и вечерний надой'),
    (f1, '2026-10-21', 'milk', round(42 * 1.03, 3), 'cattle_cows', 'Утренний и вечерний надой'),
    (f1, '2026-10-23', 'milk', round(40 * 1.03, 3), 'cattle_cows', 'Утренний и вечерний надой, общий объем');

  -- Продажи сентября: 86,4 тыс. ₽ (1-ИП).
  insert into public.product_sales (farm_id, occurred_on, product, quantity, amount_rub, buyer, note) values
    (f1, '2026-09-08', 'milk', round(400 * 1.03, 3), 28000, 'Учебный получатель А · с. Намцы', null),
    (f1, '2026-09-17', 'milk', round(380 * 1.03, 3), 30400, 'Учебный получатель А · с. Намцы', null),
    (f1, '2026-09-27', 'milk', round(300 * 1.03, 3), 28000, 'Учебный получатель Б · с. Намцы', null);

  -- Корма: сентябрь — сено 18,0 т, сенаж 6,0 т, зерно 1,2 т (всего 25,2 т); 22.10 — сено 2,5 т.
  insert into public.feed_events (farm_id, occurred_on, feed, operation, quantity_t, storage_place) values
    (f1, '2026-09-12', 'hay',     'harvest', 18.0, 'Сеновал хозяйства'),
    (f1, '2026-09-20', 'haylage', 'harvest', 6.0,  'Сеновал хозяйства'),
    (f1, '2026-09-25', 'grain',   'harvest', 1.2,  'Кладовая'),
    (f1, '2026-10-22', 'hay',     'harvest', 2.5,  'Сеновал хозяйства');

  insert into public.crop_events (farm_id, occurred_on, plot_name, crop, operation, area_ha, yield_t, note) values
    (f1, '2026-05-20', 'Огород · участок ЛПХ Ивановых', 'Картофель', 'sowing',  0.10, null, null),
    (f1, '2026-10-20', 'Огород · участок ЛПХ Ивановых', 'Картофель', 'harvest', 0.10, 1.8,  null);

  insert into public.report_submissions (farm_id, form_code, period_year, period_month, status, recipient, receipt_no, submitted_at) values
    (f1, '10-sh',          2026, 9,  'submitted', 'Росстат',  'УЧ-10СХ-2026-015', '2026-10-15T10:15:00+09:00'),
    (f1, '1-ip',           2026, 9,  'submitted', 'Росстат',  'УЧ-1ИП-2026-012',  '2026-10-12T11:40:00+09:00'),
    (f1, '3-fermer-month', 2026, 9,  'submitted', 'Сахастат', 'УЧ-ЗФР-2026-016',  '2026-10-16T14:05:00+09:00'),
    (f1, '1-iso-r',        2026, 10, 'draft',     null,       null,               null);
  insert into public.receipt_counters (farm_id, year, last_no) values (f1, 2026, 22);

  insert into public.mercury_documents (farm_id, number, product, quantity, unit, status, issued_on, produced_on, sender, recipient) values
    (f1, 'УЧ-ВСД-023', 'Молоко сырое', 40, 'л',  'issued',   '2026-10-23', '2026-10-23', 'ЛПХ Ивановых · учебный отправитель', 'Учебный получатель А · с. Намцы'),
    (f1, 'УЧ-ВСД-022', 'Молоко сырое', 35, 'л',  'redeemed', '2026-10-22', '2026-10-22', 'ЛПХ Ивановых · учебный отправитель', 'Учебный получатель А · с. Намцы'),
    (f1, 'УЧ-ВСД-021', 'Мясо говядины', 80, 'кг', 'issued',  '2026-10-21', '2026-10-21', 'ЛПХ Ивановых · учебный отправитель', 'Учебный получатель А · с. Намцы');

  insert into public.notifications (farm_id, kind, title, body, form_code, read, created_at) values
    (f1, 'overdue',   '1-ТАБУН просрочен', 'Срок был 20.10.2026. Просрочка 3 дня. Проверьте отчет и подтвердите отправку.', '1-tabun', false, '2026-10-23T09:35:00+09:00'),
    (f1, 'deadline',  '1-ИСО-р · до 30 октября', 'До срока 7 дней. Черновик подготовлен на основе учета хозяйства.', '1-iso-r', false, '2026-10-23T09:30:00+09:00'),
    (f1, 'sync',      'Учет синхронизирован', 'Сведения актуальны на 23.10.2026: 79 голов, надой за октябрь 1 200 л.', null, true, '2026-10-23T09:35:00+09:00'),
    (f1, 'submitted', '3-фермер (рег) сдан', 'Учебная квитанция за предыдущий период доступна в отчете.', '3-fermer-month', true, '2026-10-16T14:05:00+09:00');

  -- ── КФХ «Эрилик»: 2025–2026 ─────────────────────────────────────────────
  insert into public.livestock_movements (farm_id, occurred_on, animal_group, kind, heads, live_weight_kg, amount_rub, counterparty, counterparty_inn, note) values
    (f2, '2025-01-01', 'cattle_cows',      'opening_balance', 40, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'cattle_calves',    'opening_balance', 22, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'cattle_other',     'opening_balance', 8,  null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'sheep',            'opening_balance', 60, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'goats',            'opening_balance', 12, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'horses_mares',     'opening_balance', 70, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'horses_young',     'opening_balance', 40, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'horses_stallions', 'opening_balance', 8,  null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'poultry',          'opening_balance', 60, null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'pigs_sows',        'opening_balance', 3,  null, null, null, null, 'Остаток на начало учёта'),
    (f2, '2025-01-01', 'pigs_other',       'opening_balance', 15, null, null, null, null, 'Остаток на начало учёта'),
    -- 2025
    (f2, '2025-03-20', 'sheep',            'birth',    70, null, null, null, null, 'Окот'),
    (f2, '2025-04-01', 'goats',            'birth',    15, null, null, null, null, 'Приплод'),
    (f2, '2025-04-10', 'cattle_calves',    'birth',    34, null, null, null, null, 'Отёл'),
    (f2, '2025-05-01', 'poultry',          'birth',    80, null, null, null, null, 'Вывод'),
    (f2, '2025-05-15', 'pigs_other',       'birth',    30, null, null, null, null, 'Опорос'),
    (f2, '2025-06-05', 'horses_young',     'birth',    38, null, null, null, null, 'Приплод жеребят'),
    (f2, '2025-02-14', 'cattle_calves',    'death',    3,  null, null, null, null, 'Падёж'),
    (f2, '2025-07-02', 'sheep',            'death',    4,  null, null, null, null, 'Падёж'),
    (f2, '2025-08-11', 'horses_young',     'death',    2,  null, null, null, null, 'Падёж'),
    (f2, '2025-08-30', 'poultry',          'death',    6,  null, null, null, null, 'Падёж'),
    (f2, '2025-04-02', 'horses_stallions', 'purchase', 2,  null, 400000, 'СХПК «Туймаада»', '1435000111', 'Покупка жеребцов-производителей'),
    (f2, '2025-09-20', 'sheep',            'slaughter',35, 1600, null, null, null, 'Забой на собственные нужды'),
    (f2, '2025-10-20', 'horses_young',     'slaughter',18, 7200, null, null, null, 'Забой'),
    (f2, '2025-10-25', 'cattle_calves',    'slaughter',10, 3000, null, null, null, 'Забой'),
    (f2, '2025-11-10', 'pigs_other',        'slaughter',25, 2500, null, null, null, 'Забой'),
    (f2, '2025-12-05', 'poultry',          'slaughter',60, 150,  null, null, null, 'Забой'),
    (f2, '2025-06-15', 'cattle_other',     'sale',     3,  1200, 300000, 'ИП Сидоров', '143500777888', 'Реализация живым весом'),
    (f2, '2025-10-05', 'sheep',            'sale_slaughter', 20, 900,  126000,  'ООО «Мясокомбинат»', '1435000222', 'Реализация на убой'),
    (f2, '2025-11-12', 'cattle_calves',    'sale_slaughter', 12, 3400, 680000,  'ООО «Мясокомбинат»', '1435000222', 'Реализация на убой'),
    (f2, '2025-12-01', 'horses_young',     'sale_slaughter', 10, 4000, 1000000, 'ООО «Мясокомбинат»', '1435000222', 'Реализация на убой'),
    -- 2026
    (f2, '2026-02-20', 'cattle_calves',    'death',    2,  null, null, null, null, 'Падёж'),
    (f2, '2026-03-18', 'sheep',            'birth',    72, null, null, null, null, 'Окот'),
    (f2, '2026-04-12', 'cattle_calves',    'birth',    36, null, null, null, null, 'Отёл'),
    (f2, '2026-05-20', 'pigs_other',       'birth',    28, null, null, null, null, 'Опорос'),
    (f2, '2026-06-03', 'horses_young',     'birth',    40, null, null, null, null, 'Приплод жеребят'),
    (f2, '2026-07-14', 'horses_young',     'death',    1,  null, null, null, null, 'Падёж'),
    (f2, '2026-09-30', 'cattle_calves',    'sale_slaughter', 14, 4000, 800000, 'ООО «Мясокомбинат»', '1435000222', 'Реализация на убой'),
    (f2, '2026-10-02', 'sheep',            'sale_slaughter', 25, 1100, 160000, 'ООО «Мясокомбинат»', '1435000222', 'Реализация на убой'),
    (f2, '2026-10-15', 'horses_young',     'slaughter',20, 8000, null, null, null, 'Забой');

  -- Продукция: помесячные записи надоя (кг), конец месяца.
  insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group)
  select f2, make_date(2025, m, 28), 'milk', (array[1800,1800,2000,3000,4800,5200,5400,5000,4200,3000,2400,2000])[m], 'cattle_cows'
  from generate_series(1, 12) m;
  insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group)
  select f2, make_date(2026, m, case when m = 10 then 20 else 28 end), 'milk',
         (array[1900,1900,2100,3200,5000,5500,5600,5200,4400,2800])[m], 'cattle_cows'
  from generate_series(1, 10) m;
  insert into public.product_outputs (farm_id, occurred_on, product, quantity, source_group) values
    (f2, '2025-06-20', 'wool', 85, 'sheep'),
    (f2, '2026-06-18', 'wool', 90, 'sheep'),
    (f2, '2025-06-28', 'eggs', 1500, 'poultry'), (f2, '2025-07-28', 'eggs', 1500, 'poultry'), (f2, '2025-08-28', 'eggs', 1500, 'poultry'),
    (f2, '2026-06-28', 'eggs', 1600, 'poultry'), (f2, '2026-07-28', 'eggs', 1600, 'poultry'), (f2, '2026-08-28', 'eggs', 1600, 'poultry');

  -- Продажа продукции: 70% надоя по 52 ₽/кг (2025) и 56 ₽/кг (2026).
  insert into public.product_sales (farm_id, occurred_on, product, quantity, amount_rub, buyer, buyer_inn)
  select f2, o.occurred_on, 'milk', round(o.quantity * 0.7, 3),
         round(o.quantity * 0.7 * case when extract(year from o.occurred_on) = 2025 then 52 else 56 end, 2),
         'ООО «Якутмолоко»', '1435123456'
  from public.product_outputs o where o.farm_id = f2 and o.product = 'milk';
  insert into public.product_sales (farm_id, occurred_on, product, quantity, amount_rub, buyer, buyer_inn) values
    (f2, '2025-07-01', 'wool', 80, 36000, 'ИП Сидоров', '143500777888'),
    (f2, '2025-07-02', 'eggs', 4200, 50400, 'Рынок с. Хатассы', null),
    (f2, '2026-07-01', 'wool', 85, 40800, 'ИП Сидоров', '143500777888'),
    (f2, '2026-07-02', 'eggs', 4500, 58500, 'Рынок с. Хатассы', null);

  insert into public.crop_events (farm_id, occurred_on, plot_name, crop, operation, area_ha, yield_t) values
    (f2, '2025-05-20', 'Поле №1', 'Картофель',               'sowing',  0.8, null),
    (f2, '2025-09-15', 'Поле №1', 'Картофель',               'harvest', 0.8, 14.4),
    (f2, '2025-05-22', 'Поле №2', 'Овощи открытого грунта',  'sowing',  0.3, null),
    (f2, '2025-09-10', 'Поле №2', 'Овощи открытого грунта',  'harvest', 0.3, 5.1),
    (f2, '2025-05-18', 'Поле №3', 'Ячмень яровой',           'sowing',  6.0, null),
    (f2, '2025-09-05', 'Поле №3', 'Ячмень яровой',           'harvest', 6.0, 12.6),
    (f2, '2025-05-25', 'Поле №4', 'Овёс',                    'sowing',  4.0, null),
    (f2, '2025-09-08', 'Поле №4', 'Овёс',                    'harvest', 4.0, 7.6),
    (f2, '2026-05-19', 'Поле №1', 'Картофель',               'sowing',  1.0, null),
    (f2, '2026-09-18', 'Поле №1', 'Картофель',               'harvest', 1.0, 17.5),
    (f2, '2026-05-21', 'Поле №2', 'Овощи открытого грунта',  'sowing',  0.4, null),
    (f2, '2026-09-12', 'Поле №2', 'Овощи открытого грунта',  'harvest', 0.4, 6.0),
    (f2, '2026-05-17', 'Поле №3', 'Ячмень яровой',           'sowing',  7.0, null),
    (f2, '2026-09-04', 'Поле №3', 'Ячмень яровой',           'harvest', 7.0, 14.7),
    (f2, '2026-05-24', 'Поле №4', 'Овёс',                    'sowing',  4.5, null),
    (f2, '2026-09-07', 'Поле №4', 'Овёс',                    'harvest', 4.5, 9.0);

  insert into public.feed_events (farm_id, occurred_on, feed, operation, quantity_t, storage_place) values
    (f2, '2025-07-25', 'hay',     'harvest', 90, 'Сеновал'),
    (f2, '2025-08-10', 'hay',     'harvest', 45, 'Сеновал'),
    (f2, '2025-08-15', 'haylage', 'harvest', 40, 'Траншея'),
    (f2, '2025-09-06', 'grain',   'harvest', 8,  'Склад'),
    (f2, '2025-12-01', 'hay',     'use',     60, 'Сеновал'),
    (f2, '2026-07-22', 'hay',     'harvest', 95, 'Сеновал'),
    (f2, '2026-08-12', 'hay',     'harvest', 50, 'Сеновал'),
    (f2, '2026-08-18', 'haylage', 'harvest', 42, 'Траншея'),
    (f2, '2026-09-06', 'grain',   'harvest', 9,  'Склад');

  insert into public.report_submissions (farm_id, form_code, period_year, period_month, status, recipient, receipt_no, submitted_at) values
    (f2, '3-fermer',       2025, null, 'submitted', 'Росстат',           'УЧ-3Ф-2026-001',   '2026-01-09T12:00:00+09:00'),
    (f2, '1-kfh',          2025, null, 'submitted', 'Минсельхоз России', 'УЧ-1КФХ-2026-002','2026-02-20T15:30:00+09:00'),
    (f2, '1-fermer',       2026, null, 'submitted', 'Росстат',           'УЧ-1Ф-2026-003',   '2026-06-10T10:20:00+09:00'),
    (f2, '3-fermer-month', 2026, 9,    'submitted', 'Сахастат',          'УЧ-ЗФР-2026-004',  '2026-10-14T11:10:00+09:00');
  insert into public.receipt_counters (farm_id, year, last_no) values (f2, 2026, 4);

  insert into public.mercury_connections (farm_id, status, synced_at) values (f2, 'connected_demo', '2026-10-20T09:00:00+09:00');
  insert into public.mercury_documents (farm_id, number, product, quantity, unit, status, issued_on, produced_on, sender, recipient) values
    (f2, 'УЧ-ВСД-001', 'Мясо КРС (живой вес)', 4000, 'кг', 'redeemed', '2026-09-30', '2026-09-30', 'КФХ «Эрилик» · учебный отправитель', 'ООО «Мясокомбинат»'),
    (f2, 'УЧ-ВСД-002', 'Баранина (живой вес)', 1100, 'кг', 'issued',   '2026-10-02', '2026-10-02', 'КФХ «Эрилик» · учебный отправитель', 'ООО «Мясокомбинат»');

  insert into public.notifications (farm_id, kind, title, body, form_code, read, created_at) values
    (f2, 'deadline',  '2-фермер · до 21 ноября', 'До срока 29 дней. Проверьте данные уборки урожая.', '2-fermer', false, '2026-10-23T09:00:00+09:00'),
    (f2, 'submitted', '3-фермер (рег) сдан', 'Учебная квитанция за предыдущий период доступна в отчете.', '3-fermer-month', true, '2026-10-14T11:10:00+09:00');
end;
$seed$;
