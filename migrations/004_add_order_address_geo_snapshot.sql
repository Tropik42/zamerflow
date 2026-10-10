-- Добавляет snapshot-поля геокодирования адреса заявки.

-- Нормализованный адрес и источник нужны для карточки и диагностики DaData.
ALTER TABLE orders ADD COLUMN address_normalized_snapshot TEXT;
ALTER TABLE orders ADD COLUMN address_geo_source TEXT;

-- Поля расположения относительно МКАД/КАД используются для отображения километража.
ALTER TABLE orders ADD COLUMN address_beltway_hit TEXT;
ALTER TABLE orders ADD COLUMN address_beltway_distance_km REAL;

-- QC-поля DaData сохраняются для диагностики качества распознавания адреса.
ALTER TABLE orders ADD COLUMN address_geo_qc_geo INTEGER;
ALTER TABLE orders ADD COLUMN address_geo_qc INTEGER;
ALTER TABLE orders ADD COLUMN address_geo_qc_house INTEGER;
