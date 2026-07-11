ALTER TABLE orders ADD COLUMN dispatch_notification_status TEXT NOT NULL DEFAULT 'not_sent';
ALTER TABLE orders ADD COLUMN dispatch_notification_chat_id TEXT;
ALTER TABLE orders ADD COLUMN dispatch_notification_header_message_id INTEGER;
ALTER TABLE orders ADD COLUMN dispatch_notification_card_message_id INTEGER;
ALTER TABLE orders ADD COLUMN dispatch_notification_sent_at TEXT;
ALTER TABLE orders ADD COLUMN dispatch_notification_error TEXT;
ALTER TABLE orders ADD COLUMN dispatch_notification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN dispatch_notification_last_attempt_at TEXT;

CREATE INDEX idx_orders_dispatch_notification_status
ON orders(dispatch_notification_status);
