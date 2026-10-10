CREATE TABLE order_statuses (
  status_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT INTO order_statuses (
  status_code,
  display_name,
  description,
  sort_order,
  is_active
) VALUES
  (
    'accepted',
    'Принята',
    'Legacy-статус существующих заявок до workflow согласования.',
    10,
    1
  ),
  (
    'awaiting_coordination',
    'Ожидает согласования',
    'Заявка создана и ожидает согласования даты и времени замера.',
    20,
    1
  ),
  (
    'confirmed',
    'Согласована',
    'Актуальные дата и время замера согласованы.',
    30,
    1
  );

CREATE TABLE order_status_history (
  order_status_history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,

  event_type TEXT NOT NULL,

  from_status_code TEXT,
  to_status_code TEXT,

  comment TEXT,

  previous_measure_date TEXT,
  previous_measure_time TEXT,

  new_measure_date TEXT,
  new_measure_time TEXT,

  actor_source TEXT,
  actor_external_id TEXT,

  create_datetime TEXT NOT NULL,

  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (from_status_code) REFERENCES order_statuses(status_code) ON DELETE RESTRICT,
  FOREIGN KEY (to_status_code) REFERENCES order_statuses(status_code) ON DELETE RESTRICT
);

CREATE INDEX idx_order_status_history_order_datetime
ON order_status_history(order_id, create_datetime, order_status_history_id);
