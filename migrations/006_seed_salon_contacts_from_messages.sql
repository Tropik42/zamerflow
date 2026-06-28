BEGIN TRANSACTION;

CREATE TEMP TABLE tmp_salon_seed (
  salon_name TEXT PRIMARY KEY,
  salon_alias TEXT,
  salon_email TEXT,
  base_price INTEGER,
  extra_price_min INTEGER,
  extra_price_max INTEGER,
  mileage_price_per_km INTEGER,
  default_payment_by TEXT,
  is_payment_by_fixed INTEGER NOT NULL,
  payment_terms_text TEXT,
  price_comment TEXT,
  sort_order INTEGER NOT NULL
);

INSERT INTO tmp_salon_seed (
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
  sort_order
)
VALUES
  ('Massel', NULL, 'kazak.elena@mail.ru', 2200, 700, 1200, 50, NULL, 0, 'Стартовая стоимость от 2,200₽. Доппозиции по 700₽-1,200₽. Выезд за МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 140),
  ('Студия мебели Боттичелли', NULL, 'v-likarion@mail.ru', 2500, 1000, 1500, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 150),
  ('Оптима Кухни', NULL, 'korolev@optima-kuhni.ru', 2500, 1000, 1500, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 90),
  ('VogelBaum', NULL, 'kanopus8@mail.ru', 2500, 700, 1200, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 160),
  ('Mebel-Fameli', NULL, 'mebel-fameli@mail.ru', 2500, 1000, 1500, 60, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Образцы не менее 700₽. Километраж от МКАД 60₽/км.', 'Образцы не менее 700₽. Данные взяты из сообщения от 27.06.2026.', 170),
  ('Гармония Мебели', NULL, 'garmmebelgroup@yandex.ru', 2500, 1000, 1500, 60, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 180),
  ('ГеосИдеал', NULL, 'deltakuhni@mail.ru', 2500, 1000, 1500, 60, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 190),
  ('My Kitchen', NULL, 'kitchen_style@mail.ru', 2500, 800, 1500, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 800₽-1,500₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 200),
  ('Кухни LAND', NULL, 'kuhni.land@yandex.ru', 2500, 700, 1200, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 210),
  ('Хотьково', NULL, 'maika461@mail.ru', 2500, 1000, 1500, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 220),
  ('Отрада', NULL, 'Irina_sevmeb@mail.ru', 2500, 1000, 1500, 60, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 230),
  ('Элна мебель', NULL, 'Elnamebel.moskwa@yandex.ru', 2500, 1000, 1500, 60, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 1,000₽-1,500₽. Километраж от МКАД 60₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 110),
  ('RoomCook', 'Кухни Дельта', 'marchkova@roomcook.ru', 2500, 700, 1200, 50, NULL, 0, 'Стартовая стоимость от 2,500₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 100),
  ('Settee', NULL, 'Olesya.tarasova.86@list.ru', 2200, 700, 1200, 50, 'салоном', 1, 'Оплата салоном (всегда).', 'Стартовая стоимость от 2,200₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.', 50),
  ('Гармония Дома Vstyle', NULL, 'vstyle@vacstyle.ru', 2200, 700, 1200, 50, NULL, 0, 'Стартовая стоимость от 2,200₽. Доппозиции по 700₽-1,200₽. Километраж от МКАД 50₽/км.', 'Данные взяты из сообщения от 27.06.2026.', 60),
  ('Тетрис Кухни', NULL, 'kuhni-tetris@mail.ru', 2500, 800, 1500, NULL, 'салоном', 1, 'Оплата салоном (всегда).', 'Доппозиции по 800₽-1,500₽. Лифтовой холл + подъезд + паркинг в 1,000₽. Километраж в сообщении не указан.', 240);

UPDATE salons
SET
  modify_datetime = datetime('now'),
  salon_alias = COALESCE((SELECT salon_alias FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name), salon_alias),
  salon_email = (SELECT salon_email FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  base_price = (SELECT base_price FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  extra_price_min = (SELECT extra_price_min FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  extra_price_max = (SELECT extra_price_max FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  mileage_price_per_km = (SELECT mileage_price_per_km FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  default_payment_by = (SELECT default_payment_by FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  is_payment_by_fixed = (SELECT is_payment_by_fixed FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  payment_terms_text = (SELECT payment_terms_text FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  price_comment = (SELECT price_comment FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name),
  sort_order = (SELECT sort_order FROM tmp_salon_seed WHERE tmp_salon_seed.salon_name = salons.salon_name)
WHERE EXISTS (
  SELECT 1
  FROM tmp_salon_seed
  WHERE tmp_salon_seed.salon_name = salons.salon_name
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
  1
FROM tmp_salon_seed
WHERE NOT EXISTS (
  SELECT 1
  FROM salons
  WHERE salons.salon_name = tmp_salon_seed.salon_name
);

CREATE TEMP TABLE tmp_manager_seed (
  salon_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  manager_phone TEXT,
  manager_email TEXT,
  position_title TEXT,
  manager_role TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

INSERT INTO tmp_manager_seed (
  salon_name,
  manager_name,
  manager_phone,
  manager_email,
  position_title,
  manager_role,
  sort_order
)
VALUES
  ('Massel', 'Елена', '+7-901-532-05-24', NULL, 'Менеджер', 'manager', 10),
  ('Студия мебели Боттичелли', 'Татьяна', '+7-903-791-76-41', NULL, 'Менеджер', 'manager', 10),
  ('Оптима Кухни', 'Менеджер Оптима Кухни', '+7-965-322-23-44', NULL, 'Менеджер', 'manager', 10),
  ('VogelBaum', 'Виктория', '+7-917-512-16-84', NULL, 'Директор', 'director', 10),
  ('Mebel-Fameli', 'Елена', '+7-926-643-78-09', NULL, 'Менеджер', 'manager', 10),
  ('Гармония Мебели', 'Елена', '+7-917-546-43-21', NULL, 'Менеджер', 'manager', 10),
  ('ГеосИдеал', 'Евгения', '+7-916-149-07-88', NULL, 'Менеджер', 'manager', 10),
  ('My Kitchen', 'Владислав', '+7-916-577-89-39', NULL, 'Менеджер', 'manager', 10),
  ('Кухни LAND', 'Нонна', '+7-495-118-22-28', NULL, 'Менеджер', 'manager', 10),
  ('Хотьково', 'Ирина', '+7-916-307-20-00', NULL, 'Менеджер', 'manager', 10),
  ('Отрада', 'Менеджер Отрада', '+7-993-915-11-76', NULL, 'Менеджер', 'manager', 10),
  ('Элна мебель', 'Наталья', '+7-968-058-27-23', NULL, 'Менеджер', 'manager', 10),
  ('RoomCook', 'Оксана Марчкова', '+7-985-067-77-22', NULL, 'Менеджер', 'manager', 10),
  ('Settee', 'Олеся', '+7-968-384-80-20', 'Olesya.tarasova.86@list.ru', 'Директор', 'director', 10),
  ('Settee', 'Валентина', '+7-963-963-94-01', NULL, 'Менеджер', 'manager', 20),
  ('Гармония Дома Vstyle', 'Константин', '+7-909-672-70-40', NULL, 'Менеджер', 'manager', 10),
  ('Тетрис Кухни', 'Менеджер Тетрис Кухни', '+7-915-035-82-50', NULL, 'Менеджер', 'manager', 10);

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
  s.salon_id,
  datetime('now'),
  datetime('now'),
  t.manager_name,
  t.manager_phone,
  t.manager_email,
  t.position_title,
  t.manager_role,
  t.sort_order,
  1
FROM tmp_manager_seed t
INNER JOIN salons s ON s.salon_name = t.salon_name
WHERE NOT EXISTS (
  SELECT 1
  FROM salon_managers sm
  WHERE sm.salon_id = s.salon_id
    AND (
      (sm.manager_phone IS NOT NULL AND sm.manager_phone = t.manager_phone)
      OR (sm.manager_phone IS NULL AND sm.manager_name = t.manager_name)
    )
);

DROP TABLE tmp_manager_seed;
DROP TABLE tmp_salon_seed;

COMMIT;
