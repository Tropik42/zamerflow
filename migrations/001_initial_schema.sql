-- salons: справочник салонов.
CREATE TABLE salons (
  salon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  -- Основное название салона для поиска и отображения.
  salon_name TEXT NOT NULL,
  salon_alias TEXT,
  salon_email TEXT,

  -- Базовые настройки стоимости замера для будущей админки.
  base_price INTEGER,
  extra_price_min INTEGER,
  extra_price_max INTEGER,
  mileage_price_per_km INTEGER,

  payment_terms_text TEXT,
  price_comment TEXT,

  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_salons_name ON salons(salon_name);
CREATE INDEX idx_salons_active_sort ON salons(is_active, sort_order);

-- salon_managers: менеджеры салонов.
CREATE TABLE salon_managers (
  manager_id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,

  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  manager_name TEXT NOT NULL,
  manager_phone TEXT,
  manager_email TEXT,
  position_title TEXT,

  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_active INTEGER NOT NULL DEFAULT 1,

  FOREIGN KEY (salon_id) REFERENCES salons(salon_id) ON DELETE RESTRICT
);

CREATE INDEX idx_salon_managers_salon_id ON salon_managers(salon_id);
CREATE INDEX idx_salon_managers_active_sort ON salon_managers(salon_id, is_active, sort_order);

-- telegram_users: привязка Telegram-пользователей к салонам и менеджерам.
CREATE TABLE telegram_users (
  telegram_user_id TEXT PRIMARY KEY,

  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  username TEXT,
  first_name TEXT,
  last_name TEXT,

  -- role нужен для будущего разделения операторов, менеджеров и администраторов.
  role TEXT NOT NULL DEFAULT 'unknown',

  salon_id INTEGER,
  manager_id INTEGER,

  is_active INTEGER NOT NULL DEFAULT 1,

  FOREIGN KEY (salon_id) REFERENCES salons(salon_id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES salon_managers(manager_id) ON DELETE SET NULL
);

CREATE INDEX idx_telegram_users_salon_id ON telegram_users(salon_id);
CREATE INDEX idx_telegram_users_manager_id ON telegram_users(manager_id);
CREATE INDEX idx_telegram_users_role ON telegram_users(role);

-- orders: заявки на замер.
CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY AUTOINCREMENT,

  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft',

  salon_id INTEGER,
  manager_id INTEGER,

  -- Snapshot-поля сохраняют текст, актуальный на момент оформления карточки.
  salon_name_snapshot TEXT,
  salon_email_snapshot TEXT,
  manager_name_snapshot TEXT,
  manager_phone_snapshot TEXT,

  measure_date TEXT,
  measure_time TEXT,

  address TEXT NOT NULL,
  metro TEXT,

  foreman_contact TEXT,
  client_contact TEXT,

  payment_by TEXT,
  base_price INTEGER,
  extra_price_min INTEGER,
  extra_price_max INTEGER,
  mileage_price_per_km INTEGER,
  final_price INTEGER,

  extra_charges TEXT,
  comment TEXT,
  has_plan TEXT,

  formatted_card_text TEXT NOT NULL,

  telegram_user_id TEXT,

  FOREIGN KEY (salon_id) REFERENCES salons(salon_id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES salon_managers(manager_id) ON DELETE SET NULL,
  FOREIGN KEY (telegram_user_id) REFERENCES telegram_users(telegram_user_id) ON DELETE SET NULL
);

CREATE INDEX idx_orders_create_datetime ON orders(create_datetime);
CREATE INDEX idx_orders_measure_date ON orders(measure_date);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_salon_id ON orders(salon_id);
CREATE INDEX idx_orders_manager_id ON orders(manager_id);
CREATE INDEX idx_orders_telegram_user_id ON orders(telegram_user_id);

-- order_items: позиции замера внутри заявки.
CREATE TABLE order_items (
  order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,

  create_datetime TEXT NOT NULL,
  modify_datetime TEXT NOT NULL,

  item_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  comment TEXT,

  sort_order INTEGER NOT NULL DEFAULT 1000,

  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_type ON order_items(item_type);
