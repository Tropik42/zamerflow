# 09. Security

## Основные риски

ZamerFlow хранит и обрабатывает персональные и рабочие данные:

* адреса клиентов;
* телефоны клиентов;
* телефоны менеджеров;
* email салонов;
* тексты заявок;
* Telegram user id;
* коды доступа;
* токен Telegram-бота.

## `.env`

`BOT_TOKEN` и другие секреты должны храниться только в `.env` или production secret storage.

Файл `.env` нельзя коммитить.

В репозитории допустим только `.env.example`.

## Telegram bot token

`BOT_TOKEN` даёт доступ к управлению ботом.

Правила:

* production `BOT_TOKEN` нельзя использовать локально, пока production-сервис запущен на VPS;
* local development использует отдельный токен dev-бота `@zamerflow_dev_bot`;
* dev `BOT_TOKEN` и production `BOT_TOKEN` должны храниться только в соответствующих `.env`;
* не писать токен в README;
* не вставлять токен в issue/PR/chat;
* не логировать токен;
* при утечке сразу перевыпустить токен через BotFather.

Один Telegram bot token нельзя безопасно использовать одновременно в production и local development: два long polling процесса будут конкурировать за updates.

## SQLite-файлы

SQLite database files нельзя коммитить.

Нельзя коммитить:

* `data/*.sqlite`;
* `data/*.sqlite-journal`;
* `data/*.sqlite-wal`;
* `data/*.sqlite-shm`;
* `data/*.sqlite-*`;
* `data/*.db`;
* `data/*.db-*`;
* `logs/`;
* `backups/`;
* backup-файлы с production-данными.

Production SQLite нельзя копировать в локальную разработку без осознанного sanitized backup. Локальная разработка должна использовать отдельную dev-базу, например `./data/zamerflow-dev.sqlite`.

В `.gitignore` должны быть закрыты:

```gitignore
data/*.sqlite
data/*.sqlite-*
data/*.db
data/*.db-*
backups/
logs/
```

## Админка

Админку нельзя открывать в интернет без защиты.

Пока авторизация в приложении не реализована, production-доступ должен быть закрыт внешним способом:

* nginx Basic Auth;
* VPN;
* SSH tunnel;
* firewall allowlist.

Минимальный вариант MVP — Basic Auth на nginx и закрытый прямой порт Fastify.

## Коды доступа

`manager_auth_codes` — одноразовые коды авторизации менеджеров.

Правила:

* коды должны быть достаточно непредсказуемыми;
* использованный код не должен подходить повторно;
* сброс кода через админку должен использоваться только осознанно;
* коды не стоит логировать.

## Логи

Не логировать:

* полный текст карточек;
* адреса клиентов;
* телефоны клиентов;
* auth codes;
* токены;
* `.env`;
* SQL dumps.

Для диагностики использовать ids:

* `order_id`;
* `salon_id`;
* `manager_id`;
* `telegram_user_id`.

## Backup

Backup SQLite содержит персональные данные.

Правила:

* хранить backup в закрытой директории;
* не отдавать backup через nginx;
* ограничить права файлов;
* ротировать старые backup;
* не переносить backup в публичные каналы.

## VPS-доступ

Production VPS должен использовать:

* SSH key;
* отключение password login, если возможно;
* отдельного пользователя `zamerflow`;
* минимальные права;
* закрытые лишние порты;
* регулярные обновления системы.

## GitHub

Не хранить в GitHub:

* `.env`;
* production database;
* backup;
* токены;
* приватные ключи;
* персональные выгрузки.

Для CI/CD использовать GitHub Secrets.

## CI/CD

Production secrets хранить только в GitHub Secrets и на VPS.

Для GitHub Actions deploy нужны:

* `VPS_HOST`;
* `VPS_PORT`;
* `VPS_USER`;
* `VPS_SSH_KEY`;
* `VPS_KNOWN_HOSTS`.

Правила:

* приватный SSH-ключ нельзя коммитить;
* production `.env` нельзя передавать в workflow;
* deploy-пользователь на VPS должен иметь минимальные права;
* желательно разрешить deploy-пользователю через `sudo` только команду `/usr/local/sbin/zamerflow-deploy.sh`;
* в logs workflow нельзя выводить `.env`, токены, SQLite backup, SQL dumps и приватные ключи;
* GitHub Actions должен только вызывать серверный deploy script, а не хранить всю production-логику в YAML.

## MVP-минимум перед production

Перед открытием production нужно:

* закрыть админку Basic Auth/VPN/SSH tunnel;
* проверить `.gitignore`;
* убедиться, что `.env` не попал в git history;
* убедиться, что SQLite-файлы не попали в git;
* настроить backup;
* ограничить доступ к VPS.
