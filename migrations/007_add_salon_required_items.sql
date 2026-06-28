CREATE TABLE salon_required_items (
  salon_required_item_id INTEGER PRIMARY KEY AUTOINCREMENT,

  salon_id INTEGER NOT NULL,

  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,

  unit_price INTEGER,
  price_text TEXT,
  card_text TEXT,

  quantity INTEGER NOT NULL DEFAULT 1,

  is_required INTEGER NOT NULL DEFAULT 1,
  auto_add_to_order INTEGER NOT NULL DEFAULT 1,

  comment TEXT,

  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_active INTEGER NOT NULL DEFAULT 1,

  FOREIGN KEY (salon_id) REFERENCES salons(salon_id) ON DELETE CASCADE
);

CREATE INDEX idx_salon_required_items_salon_id
ON salon_required_items(salon_id);

CREATE INDEX idx_salon_required_items_active_sort
ON salon_required_items(salon_id, is_active, sort_order);

ALTER TABLE order_items ADD COLUMN item_name_snapshot TEXT;
ALTER TABLE order_items ADD COLUMN unit_price_snapshot INTEGER;
ALTER TABLE order_items ADD COLUMN price_text_snapshot TEXT;
ALTER TABLE order_items ADD COLUMN card_text_snapshot TEXT;
ALTER TABLE order_items ADD COLUMN is_auto_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN source TEXT;

INSERT INTO salon_required_items (
  salon_id,
  create_datetime,
  modify_datetime,
  item_type,
  item_name,
  unit_price,
  price_text,
  card_text,
  quantity,
  is_required,
  auto_add_to_order,
  comment,
  sort_order,
  is_active
)
SELECT
  s.salon_id,
  datetime('now'),
  datetime('now'),
  'delivery_path_measurement',
  'Лифтовой холл + подъезд + паркинг',
  1000,
  'в 1,000₽',
  'Лифтовой холл + подъезд + паркинг в 1,000₽.',
  1,
  1,
  1,
  'Для проверки, пройдёт ли крупногабаритная мебель.',
  1,
  1
FROM salons s
WHERE s.salon_name = 'Тетрис Кухни'
  AND NOT EXISTS (
    SELECT 1
    FROM salon_required_items sri
    WHERE sri.salon_id = s.salon_id
      AND sri.item_type = 'delivery_path_measurement'
  );
