# 08. CI/CD

## Текущий статус

CI/CD ещё предстоит настроить.

Сейчас доступна локальная проверка:

```bash
npm run typecheck
```

## Цель

Нужен простой GitHub Actions pipeline, который:

* проверяет TypeScript;
* не даёт случайно сломать main;
* в будущем деплоит на VPS;
* делает backup SQLite перед деплоем;
* применяет миграции на старте приложения;
* проверяет healthcheck после рестарта.

## MVP CI

Минимальный workflow:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  typecheck:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
```

## Deploy pipeline

Будущий deploy flow:

```text
push to main
→ npm ci
→ npm run typecheck
→ SSH на VPS
→ backup SQLite
→ git pull или rsync/scp
→ npm ci
→ restart systemd service
→ healthcheck
```

## GitHub Secrets

Для деплоя использовать GitHub Secrets:

* `VPS_HOST`;
* `VPS_USER`;
* `VPS_SSH_KEY`;
* `VPS_PORT`;
* `APP_DIR`;
* при необходимости production env values.

Не хранить секреты в репозитории.

## Миграции в CI/CD

Миграции применяются приложением на старте.

Перед production restart обязательно делать backup SQLite.

Если миграция упала:

* приложение не должно silently продолжать работать с частично применённой схемой;
* нужно смотреть logs;
* при необходимости восстанавливать backup.

## Проверки после деплоя

Минимально:

```bash
systemctl status zamerflow
journalctl -u zamerflow -n 100
curl -f http://localhost:3000/health
```

Пока `/health` не реализован, проверка ручная:

* бот отвечает;
* `/admin` доступен;
* заявка создаётся;
* ошибок в логах нет.

## Что не делать пока

Не строить сложный CI/CD:

* blue-green deploy;
* Kubernetes deploy;
* Docker registry;
* staging/prod matrix;
* сложные approval gates.

Сначала достаточно typecheck + простой SSH deploy.
