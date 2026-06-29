BEGIN TRANSACTION;

-- Source: Telegram screenshots from Oleg group, parsed on 2026-06-29.
-- Scope: reference data only: salons + salon_managers.
-- Orders are intentionally not inserted here to avoid historical/live order duplicates.

INSERT INTO salons (
  create_datetime,
  modify_datetime,
  salon_name,
  salon_alias,
  salon_email,
  base_price,
  extra_price_min,
  extra_price_max,
  mileage_price_per_km,
  default_payment_by,
  is_payment_by_fixed,
  payment_terms_text,
  price_comment,
  sort_order,
  is_active
)
SELECT
  datetime('now'),
  datetime('now'),
  'ДомАртМебель',
  NULL,
  'bichurinrushan@mail.ru',
  2500,
  1000,
  1500,
  60,
  NULL,
  0,
  'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.',
  'Данные взяты из карточки на 30.06.2026. Новый салон по пометке Олега. Оплата в карточке салоном, но фиксированной оплатой это пока не считаем.',
  COALESCE((SELECT MAX(sort_order) + 10 FROM salons), 1000),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM salons WHERE salon_name = 'ДомАртМебель'
);

INSERT INTO salons (
  create_datetime,
  modify_datetime,
  salon_name,
  salon_alias,
  salon_email,
  base_price,
  extra_price_min,
  extra_price_max,
  mileage_price_per_km,
  default_payment_by,
  is_payment_by_fixed,
  payment_terms_text,
  price_comment,
  sort_order,
  is_active
)
SELECT
  datetime('now'),
  datetime('now'),
  'СК Мебель',
  NULL,
  'zaitseva-olga.vl@yandex.ru',
  2500,
  1000,
  1500,
  60,
  NULL,
  0,
  'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.',
  'Данные взяты из карточки на 30.06.2026. В карточке строка километража указана для объекта внутри МКАД; отображать километраж в заявке нужно только для объектов за МКАД.',
  COALESCE((SELECT MAX(sort_order) + 10 FROM salons), 1000),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM salons WHERE salon_name = 'СК Мебель'
);

INSERT INTO salons (
  create_datetime,
  modify_datetime,
  salon_name,
  salon_alias,
  salon_email,
  base_price,
  extra_price_min,
  extra_price_max,
  mileage_price_per_km,
  default_payment_by,
  is_payment_by_fixed,
  payment_terms_text,
  price_comment,
  sort_order,
  is_active
)
SELECT
  datetime('now'),
  datetime('now'),
  'MGS Декоратор',
  NULL,
  'Vardek.gorod@gmail.com',
  2500,
  1000,
  1500,
  60,
  NULL,
  0,
  'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.',
  'Данные взяты из карточки на 01.07.2026. Не склеивать автоматически с Русич (MGS Мебель), пока Олег не подтвердит.',
  COALESCE((SELECT MAX(sort_order) + 10 FROM salons), 1000),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM salons WHERE salon_name = 'MGS Декоратор'
);

INSERT INTO salons (
  create_datetime,
  modify_datetime,
  salon_name,
  salon_alias,
  salon_email,
  base_price,
  extra_price_min,
  extra_price_max,
  mileage_price_per_km,
  default_payment_by,
  is_payment_by_fixed,
  payment_terms_text,
  price_comment,
  sort_order,
  is_active
)
SELECT
  datetime('now'),
  datetime('now'),
  'DurMebel',
  NULL,
  'durmebel@mail.ru',
  2200,
  700,
  1200,
  50,
  NULL,
  0,
  'Стартовая стоимость от 2,200₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.',
  'Данные взяты из карточки на 30.06.2026. Новый салон по пометке Олега. В карточке строка километража указана для объекта внутри МКАД; отображать километраж в заявке нужно только для объектов за МКАД.',
  COALESCE((SELECT MAX(sort_order) + 10 FROM salons), 1000),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM salons WHERE salon_name = 'DurMebel'
);

-- Managers

INSERT INTO salon_managers (
  salon_id,
  create_datetime,
  modify_datetime,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order,
  is_active
)
SELECT
  (SELECT salon_id FROM salons WHERE salon_name = 'ДомАртМебель' ORDER BY salon_id DESC LIMIT 1),
  datetime('now'),
  datetime('now'),
  'Рушан',
  '+7-937-422-80-72',
  NULL,
  NULL,
  'manager',
  1000,
  1
WHERE EXISTS (SELECT 1 FROM salons WHERE salon_name = 'ДомАртМебель')
  AND NOT EXISTS (SELECT 1 FROM salon_managers WHERE manager_phone = '+7-937-422-80-72');

INSERT INTO salon_managers (
  salon_id,
  create_datetime,
  modify_datetime,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order,
  is_active
)
SELECT
  (SELECT salon_id FROM salons WHERE salon_name = 'СК Мебель' ORDER BY salon_id DESC LIMIT 1),
  datetime('now'),
  datetime('now'),
  'Ольга',
  '+7-919-006-45-86',
  NULL,
  NULL,
  'manager',
  1000,
  1
WHERE EXISTS (SELECT 1 FROM salons WHERE salon_name = 'СК Мебель')
  AND NOT EXISTS (SELECT 1 FROM salon_managers WHERE manager_phone = '+7-919-006-45-86');

INSERT INTO salon_managers (
  salon_id,
  create_datetime,
  modify_datetime,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order,
  is_active
)
SELECT
  (SELECT salon_id FROM salons WHERE salon_name = 'MGS Декоратор' ORDER BY salon_id DESC LIMIT 1),
  datetime('now'),
  datetime('now'),
  'Ариадна',
  '+7-916-710-62-29',
  NULL,
  NULL,
  'manager',
  1000,
  1
WHERE EXISTS (SELECT 1 FROM salons WHERE salon_name = 'MGS Декоратор')
  AND NOT EXISTS (SELECT 1 FROM salon_managers WHERE manager_phone = '+7-916-710-62-29');

INSERT INTO salon_managers (
  salon_id,
  create_datetime,
  modify_datetime,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order,
  is_active
)
SELECT
  (SELECT salon_id FROM salons WHERE salon_name = 'RoomCook' ORDER BY salon_id DESC LIMIT 1),
  datetime('now'),
  datetime('now'),
  'Оксана Марчкова',
  '+7-985-067-77-22',
  NULL,
  NULL,
  'manager',
  1000,
  1
WHERE EXISTS (SELECT 1 FROM salons WHERE salon_name = 'RoomCook')
  AND NOT EXISTS (SELECT 1 FROM salon_managers WHERE manager_phone = '+7-985-067-77-22');

INSERT INTO salon_managers (
  salon_id,
  create_datetime,
  modify_datetime,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order,
  is_active
)
SELECT
  (SELECT salon_id FROM salons WHERE salon_name = 'DurMebel' ORDER BY salon_id DESC LIMIT 1),
  datetime('now'),
  datetime('now'),
  'Екатерина',
  '+7-929-999-95-65',
  NULL,
  NULL,
  'manager',
  1000,
  1
WHERE EXISTS (SELECT 1 FROM salons WHERE salon_name = 'DurMebel')
  AND NOT EXISTS (SELECT 1 FROM salon_managers WHERE manager_phone = '+7-929-999-95-65');

COMMIT;
