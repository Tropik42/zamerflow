UPDATE salons
SET
  salon_name = 'МФ Бобр',
  modify_datetime = datetime('now')
WHERE salon_name = 'МД Бобр';

UPDATE salons
SET
  salon_name = 'Русич (MGS Мебель)',
  modify_datetime = datetime('now')
WHERE salon_name = 'Русич / М65 мебель';
