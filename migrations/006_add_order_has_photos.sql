-- Добавляет признак наличия фотографий у сохранённой заявки.

-- Поле хранит только факт прикрепления фото, сами файлы остаются в Telegram.
ALTER TABLE orders
ADD COLUMN has_photos INTEGER NOT NULL DEFAULT 0;
