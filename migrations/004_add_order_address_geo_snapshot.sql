ALTER TABLE orders ADD COLUMN address_normalized_snapshot TEXT;
ALTER TABLE orders ADD COLUMN address_geo_source TEXT;
ALTER TABLE orders ADD COLUMN address_beltway_hit TEXT;
ALTER TABLE orders ADD COLUMN address_beltway_distance_km REAL;
ALTER TABLE orders ADD COLUMN address_geo_qc_geo INTEGER;
ALTER TABLE orders ADD COLUMN address_geo_qc INTEGER;
ALTER TABLE orders ADD COLUMN address_geo_qc_house INTEGER;
