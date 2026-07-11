# 07. Observability

## Цель

Для MVP нужна простая наблюдаемость, которая помогает понять:

* запущен ли бот;
* работает ли админка;
* применились ли миграции;
* есть ли ошибки Telegram flow;
* доступна ли SQLite-база;
* хватает ли места на диске;
* есть ли свежий backup.

## Текущий статус

Сейчас приложение пишет базовые сообщения в console:

* старт приложения;
* применение миграций;
* старт бота;
* адрес админки;
* `/health`;
* ошибки обработки Telegram update;
* ошибки сохранения заявки;
* результат dispatch-отправки подтверждённой карточки.

Структурные логи, error alerts и backup-monitoring ещё предстоит добавить.

## Логи

Минимально нужны:

* лог старта приложения;
* лог остановки приложения;
* лог retry-попыток запуска Telegram-бота;
* лог применения миграций;
* лог ошибок Telegram handlers;
* warn-лог для старых Telegram callback acknowledgements;
* лог ошибок Fastify routes;
* лог создания заявки;
* лог критических ошибок БД.

На MVP достаточно писать в stdout/stderr, чтобы systemd или pm2 собирали логи.

## MVP structured logs

Для MVP приложение пишет структурные события одной JSON-строкой в stdout/stderr.

Формат:

```json
{"ts":"2026-06-29T12:00:00.000Z","level":"info","event":"order_created","order_id":123}
```

`info` и `warn` пишутся в stdout/stderr через `console.info` и `console.warn`, `error` — через `console.error`.
Этого достаточно для systemd, pm2 и docker logs без отдельного log storage.

Смотреть логи systemd:

```bash
sudo journalctl -u zamerflow -f
sudo journalctl -u zamerflow --since "YYYY-MM-DD HH:MM" --no-pager
```

Фильтровать события:

```bash
sudo journalctl -u zamerflow --no-pager | grep '"event":"dadata_address_request_succeeded"'
sudo journalctl -u zamerflow --no-pager | grep '"event":"order_created"'
```

События DaData:

* `dadata_address_request_started`: `address_length`, `timeout_ms`;
* `dadata_address_request_succeeded`: `duration_ms`, `http_status`, `field_count`, `beltway_hit`, `beltway_distance_km`, `qc_geo`, `qc_house`;
* `dadata_address_request_failed`: `duration_ms`, `http_status`, `address_length`, `message`.

События черновика и заявки:

* `order_draft_started`: `telegram_user_id`, `chat_id`, `salon_id`, `salon_name`, `manager_id`, `manager_name`, `initial_step`;
* `order_draft_salon_selected`: `telegram_user_id`, `chat_id`, `salon_id`, `salon_name`, `step`;
* `order_draft_cancelled`: `telegram_user_id`, `chat_id`, `step`, `salon_id`, `salon_name`, `manager_id`, `manager_name`, `has_session`;
* `order_created`: `order_id`, `telegram_user_id`, `chat_id`, `salon_id`, `salon_name`, `manager_id`, `manager_name`, `measure_date`, `measure_time`, `address_beltway_hit`, `address_beltway_distance_km`, `address_geo_source`;
* `order_save_failed`: `telegram_user_id`, `chat_id`, `salon_id`, `manager_id`, `message`.

События dispatch-отправки:

* `dispatch_notification_sent`: `order_id`, `chat_id`, `header_message_id`, `card_message_id`, `attempt`;
* `dispatch_notification_failed`: `order_id`, `chat_id`, `error_code`, `attempt`;
* `dispatch_notification_retry`: `order_id`, `chat_id`, `attempt`;
* `dispatch_notification_skipped`: `order_id`, `error_code`.

В логах не должно быть:

* Telegram bot token;
* DaData API key и secret;
* auth codes;
* телефонов клиентов;
* телефонов менеджеров;
* полного адреса клиента;
* полного текста карточки заявки;
* полного комментария;
* содержимого `.env`.

Для DaData request started логируется только длина исходного адреса. Для DaData success не логировать исходный или нормализованный адрес. Для DaData failed логируются только длина адреса, длительность, HTTP-статус и безопасное сообщение ошибки.

## Что не логировать

Не логировать без необходимости:

* полный адрес клиента;
* телефоны клиентов;
* токены;
* auth codes;
* полный текст карточки заявки в error logs;
* содержимое `.env`.

Если нужны технические логи, лучше логировать ids:

* `order_id`;
* `salon_id`;
* `manager_id`;
* `telegram_user_id`.

## Healthcheck

Есть endpoint:

```text
GET /health
```

Минимальная проверка:

```json
{
  "ok": true
}
```

Желательно проверять:

* процесс жив;
* SQLite доступна;
* можно выполнить простой SELECT.

Пример SQL:

```sql
SELECT 1;
```

## Restart on failure

На production процесс должен автоматически перезапускаться.

Варианты:

* systemd `Restart=always`;
* pm2 restart policy.

Для MVP предпочтительнее systemd, если деплой идёт на обычный VPS.

## Telegram-уведомления владельцу

Позже стоит добавить уведомления Олегу или владельцу сервиса о критических ошибках.

Примеры событий:

* бот не стартовал;
* не удалось открыть SQLite;
* миграция упала;
* ошибка при сохранении заявки;
* закончилось место на диске;
* backup не создавался больше N часов.

Важно: не спамить по каждой мелкой ошибке.

## Backup SQLite

Нужно настроить регулярный backup SQLite.

Минимально:

```bash
sqlite3 /var/lib/zamerflow/zamerflow.sqlite ".backup '/var/backups/zamerflow/zamerflow-$(date +%F-%H%M%S).sqlite'"
```

Проверять:

* backup-файл создаётся;
* размер больше 0;
* есть свежий backup;
* старые backup-файлы ротируются.

## Disk space

SQLite и backup зависят от диска.

Минимальная проверка:

```bash
df -h
```

На MVP достаточно cron/systemd timer, который проверяет место и пишет предупреждение.

## Не добавлять пока

Без явной необходимости не добавлять:

* Prometheus;
* Grafana;
* Sentry;
* ELK;
* OpenTelemetry;
* сложные dashboards.

Сначала нужны простые логи, healthcheck и backup.
