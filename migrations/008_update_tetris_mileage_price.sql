UPDATE salons
SET
  modify_datetime = datetime('now'),
  mileage_price_per_km = 50,
  payment_terms_text = 'Оплата салоном (всегда). Стартовая стоимость от 2,500₽. Доппозиции по 800₽-1,500₽. Километраж от МКАД 50₽/км.',
  price_comment = 'Лифтовой холл + подъезд + паркинг в 1,000₽. Данные уточнены: километраж от МКАД 50₽/км.'
WHERE salon_name = 'Тетрис Кухни';
