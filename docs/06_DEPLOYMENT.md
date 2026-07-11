# 06. Deployment

## Текущий статус

Production-деплой выполнен на VPS.

Локально проект запускается через:

```bash
npm run dev
```

Production Telegram-бот и Fastify-админка работают на сервере. Бот работает через long polling. Админка запускается в том же Node.js-процессе и должна быть доступна через nginx reverse proxy с Basic Auth или другой внешней защитой.

## Цель деплоя

Бот и админка должны работать без ноутбука пользователя.

MVP-деплой должен быть простым, понятным и восстановимым.

## Целевая MVP-схема

```text
VPS
├── Node.js
├── ZamerFlow app
├── SQLite database
├── systemd или pm2
└── nginx reverse proxy для админки
```

## Рекомендуемый вариант

* VPS на Ubuntu;
* Node.js LTS;
* один каталог приложения;
* `.env` на сервере;
* SQLite-файл в постоянной директории;
* запуск через systemd;
* nginx перед админкой;
* Basic Auth на nginx;
* регулярный backup SQLite;
* backup перед каждым деплоем.

## Переменные окружения

Local development `.env`:

```env
APP_ENV=development
BOT_ENABLED=true
BOT_TOKEN=dev_bot_token_for_zamerflow_dev_bot
DATABASE_PATH=./data/zamerflow-dev.sqlite
ADMIN_PORT=3001
DISPATCH_CHAT_ID=
DADATA_ENABLED=false
```

Production `.env` на VPS:

```env
APP_ENV=production
BOT_ENABLED=true
BOT_TOKEN=production_bot_token_here
DATABASE_PATH=/var/lib/zamerflow/zamerflow.sqlite
ADMIN_PORT=3000
DISPATCH_CHAT_ID=
DADATA_ENABLED=true
DADATA_API_KEY=
DADATA_SECRET_KEY=
DADATA_TIMEOUT_MS=3000
```

Не вставлять реальные токены и DaData-ключи в документацию, shell history, issue, chat или git.

`DISPATCH_CHAT_ID` — chat id рабочего группового Telegram dispatch-чата, куда бот отправляет подтверждённые карточки заявок. Значение берётся командой `/chatid` в рабочем групповом Telegram-чате, куда добавлен бот. Для группы или супергруппы значение обычно отрицательное. Если переменная не задана или указывает на личный чат, приложение стартует, заявки сохраняются, а dispatch-отправка помечается как failed.

Локальная разработка должна использовать `@zamerflow_dev_bot`. Production `BOT_TOKEN` не используется локально, пока production-сервис работает на VPS.

Перед production-включением DaData нужно положить в production `.env` новые ключи. Если ключи попадали в чат, PR или logs, их нужно перевыпустить в DaData.

## Каталоги на сервере

Возможная структура:

```text
/opt/zamerflow/app        # код приложения
/var/lib/zamerflow        # SQLite и данные
/var/backups/zamerflow    # backup SQLite
/etc/zamerflow/.env       # env-файл
```

## Systemd

Планируемый сервис:

```ini
[Unit]
Description=ZamerFlow bot and admin
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/zamerflow/app
EnvironmentFile=/etc/zamerflow/.env
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
User=zamerflow
Group=zamerflow

[Install]
WantedBy=multi-user.target
```

Для production позже лучше добавить build/start script, но на MVP можно начать с `tsx`, если это упрощает запуск.

Если нужно запустить только админку без Telegram long polling, например локально для проверки UI, можно использовать:

```env
BOT_ENABLED=false
```

## Nginx

Админку нельзя открывать наружу без защиты.

Минимальный вариант:

* nginx reverse proxy на `/admin`;
* Basic Auth;
* доступ только по HTTPS;
* закрыть прямой доступ к `ADMIN_PORT` firewall-ом.

## Backup перед деплоем

Перед обновлением кода делать backup SQLite:

```bash
sqlite3 /var/lib/zamerflow/zamerflow.sqlite ".backup '/var/backups/zamerflow/zamerflow-$(date +%F-%H%M%S).sqlite'"
```

## Обновление приложения

Примерный ручной flow:

```bash
cd /opt/zamerflow/app
git pull --ff-only
npm ci
npm run typecheck
systemctl restart zamerflow
systemctl status zamerflow
```

Миграции применяются на старте приложения.

## GitHub Actions Deploy

Для MVP production deploy можно запускать вручную из GitHub Actions workflow `Deploy Production`.

Важно: источником production deploy logic остаётся серверный script на VPS:

```text
/usr/local/sbin/zamerflow-deploy.sh
```

GitHub Actions только:

* выполняет `npm ci` и `npm run typecheck` в job `check`;
* подключается к VPS по SSH;
* запускает `sudo /usr/local/sbin/zamerflow-deploy.sh`.

Серверный script должен делать:

* backup SQLite перед обновлением;
* `git pull --ff-only`;
* `npm ci`;
* `npm run typecheck`;
* restart `zamerflow`;
* проверку `/health`;
* вывод последних логов.

Production `.env`, `BOT_TOKEN`, SQLite-файл и backup-файлы не передаются в GitHub Actions.

Если workflow упал, смотреть:

* GitHub Actions logs;
* `journalctl -u zamerflow` на VPS;
* результат `/health`;
* наличие свежего backup SQLite.

## Healthcheck

Приложение отдаёт endpoint:

```text
/health
```

Минимальный ответ:

```json
{"ok":true}
```

Дополнительно проверить деплой вручную:

* процесс запущен;
* бот отвечает;
* `/admin` открывается;
* SQLite-файл доступен;
* в логах нет ошибок.

## Что не добавлять пока

На MVP не добавлять без причины:

* Docker Compose с несколькими сервисами;
* Kubernetes;
* PostgreSQL;
* Redis;
* отдельный frontend server;
* сложный deployment orchestrator.

## Ближайшие задачи эксплуатации

* проверить фактический systemd/pm2 unit и зафиксировать его в документации;
* проверить nginx reverse proxy и Basic Auth;
* проверить регулярность backup SQLite;
* проверить ручной deploy script `/usr/local/sbin/zamerflow-deploy.sh`;
* настроить GitHub Actions Secrets для ручного deploy;
* проверить production deploy через workflow `Deploy Production`;
* описать фактические команды восстановления из backup.
