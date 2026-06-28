ALTER TABLE salons ADD COLUMN default_payment_by TEXT;
ALTER TABLE salons ADD COLUMN is_payment_by_fixed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE salon_managers ADD COLUMN manager_role TEXT NOT NULL DEFAULT 'manager';

ALTER TABLE orders ADD COLUMN manager_role_snapshot TEXT;

CREATE INDEX idx_salons_payment_fixed ON salons(is_payment_by_fixed);
CREATE INDEX idx_salon_managers_role ON salon_managers(manager_role);
