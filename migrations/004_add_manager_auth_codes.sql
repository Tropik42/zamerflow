CREATE TABLE manager_auth_codes (
  auth_code TEXT PRIMARY KEY,
  manager_id INTEGER NOT NULL,

  create_datetime TEXT NOT NULL,
  used_datetime TEXT,

  is_used INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (manager_id) REFERENCES salon_managers(manager_id) ON DELETE CASCADE
);

CREATE INDEX idx_manager_auth_codes_manager_id ON manager_auth_codes(manager_id);
CREATE INDEX idx_manager_auth_codes_is_used ON manager_auth_codes(is_used);
