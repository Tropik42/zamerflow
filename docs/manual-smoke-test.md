# Manual Smoke Test

Ручная проверка перед первым VPS-деплоем.

## Подготовка

1. Установить зависимости:

```bash
npm ci
```

2. Настроить `.env`:

```env
BOT_TOKEN=
DATABASE_PATH=./data/zamerflow.sqlite
ADMIN_PORT=3000
```

3. Для проверки на пустой dev-базе удалить локальный SQLite-файл и sidecar-файлы:

```bash
rm -f data/zamerflow.sqlite data/zamerflow.sqlite-*
```

## Проверки

1. Проверить типы:

```bash
npm run typecheck
```

2. Запустить приложение:

```bash
npm run dev
```

3. Проверить, что миграции применились по логам:

```text
ZamerFlow migrations: complete.
```

4. Проверить healthcheck:

```bash
curl -f http://localhost:3000/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

5. Проверить Telegram-бот:

* отправить `/start`;
* авторизоваться менеджером по одноразовому коду;
* создать тестовую заявку через `/new`;
* принять заявку на предпросмотре.

6. Проверить админку:

* открыть `http://localhost:3000/admin`;
* открыть раздел `Заявки`;
* убедиться, что тестовая заявка видна;
* открыть заявку и проверить карточку.

7. Проверить git hygiene:

```bash
git status --short
```

В git не должны попадать:

* `.env`;
* SQLite-файлы;
* `logs/`;
* `backups/`;
* токены;
* production backup-файлы.

## Production notes

Перед production-деплоем админку нельзя открывать наружу без Basic Auth, VPN, SSH tunnel или firewall allowlist.

Перед обновлением production-кода сделать backup SQLite.
