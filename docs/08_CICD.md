# 08. CI/CD

## Текущий статус

Для MVP настроены два GitHub Actions workflow:

* `CI` — автоматическая проверка на `push` в `main` и на `pull_request`;
* `Deploy Production` — ручной production deploy через `workflow_dispatch`.

Оба workflow используют Node.js 22, `npm ci` и `npm run typecheck`.

## Цель

Нужен простой GitHub Actions pipeline, который:

* проверяет TypeScript;
* не даёт случайно сломать main;
* запускает production deploy только вручную;
* не хранит production `.env` и секреты в репозитории;
* вызывает серверный deploy script на VPS по SSH.

## CI

Workflow:

```text
.github/workflows/ci.yml
```

Запускается автоматически:

* `push` в `main`;
* `pull_request`.

Шаги:

* `actions/checkout@v4`;
* `actions/setup-node@v4` с Node.js 22 и npm cache;
* `npm ci`;
* `npm run typecheck`.

## Deploy Production

Workflow:

```text
.github/workflows/deploy-production.yml
```

Запускается только вручную через GitHub Actions `workflow_dispatch`.

Перед deploy выполняется job `check`:

* checkout;
* setup Node.js 22;
* `npm ci`;
* `npm run typecheck`.

После успешной проверки job `deploy` подключается к VPS по SSH и запускает:

```bash
sudo /usr/local/sbin/zamerflow-deploy.sh
```

GitHub Actions не содержит production deploy logic полностью. Источником production deploy logic остаётся серверный script:

```text
/usr/local/sbin/zamerflow-deploy.sh
```

Серверный script отвечает за:

* backup SQLite перед обновлением;
* `git pull --ff-only`;
* `npm ci`;
* `npm run typecheck`;
* `systemctl restart zamerflow`;
* проверку `/health`;
* вывод последних логов.

Deploy не запускается автоматически на каждый push.

## GitHub Secrets

Для деплоя использовать GitHub Secrets:

* `VPS_HOST`;
* `VPS_PORT`;
* `VPS_USER`;
* `VPS_SSH_KEY`;
* `VPS_KNOWN_HOSTS`.

GitHub Actions не хранит production `.env`. Production `BOT_TOKEN`, путь к production SQLite и другие runtime secrets остаются на VPS.

## Миграции в CI/CD

Миграции применяются приложением на старте.

Перед production restart серверный deploy script обязательно делает backup SQLite.

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

Если workflow упал:

* сначала смотреть logs workflow в GitHub Actions;
* затем смотреть VPS logs через `journalctl -u zamerflow`;
* проверять, создался ли backup SQLite перед деплоем.

## Как пользоваться

CI:

* открыть репозиторий GitHub;
* перейти в `Actions`;
* открыть workflow `CI`;
* смотреть job `typecheck`.

Production deploy:

* открыть репозиторий GitHub;
* перейти в `Actions`;
* открыть workflow `Deploy Production`;
* нажать `Run workflow`;
* выбрать ветку, обычно `main`;
* дождаться job `check`;
* затем проверить job `deploy`.

В логах workflow не должно быть `.env`, токенов, SQLite backup, SQL dumps или приватных ключей.

## Что не делать пока

Не строить сложный CI/CD:

* blue-green deploy;
* Kubernetes deploy;
* Docker registry;
* staging/prod matrix;
* сложные approval gates.

Для MVP достаточно typecheck + ручной SSH deploy через серверный script.
