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
```

Production `.env` на VPS:

```env
APP_ENV=production
BOT_ENABLED=true
BOT_TOKEN=production_bot_token_here
DATABASE_PATH=/var/lib/zamerflow/zamerflow.sqlite
ADMIN_PORT=3000
```

Не вставлять реальные токены в документацию, shell history, issue, chat или git.

Локальная разработка должна использовать `@zamerflow_dev_bot`. Production `BOT_TOKEN` не используется локально, пока production-сервис работает на VPS.

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

## Ближайшие задачи деплоя

* выбрать VPS;
* создать пользователя `zamerflow`;
* настроить `.env`;
* настроить systemd или pm2;
* настроить nginx;
* закрыть админку Basic Auth;
* настроить backup SQLite;
* описать фактические команды после первого успешного деплоя.
