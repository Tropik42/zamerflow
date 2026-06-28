# 02. Architecture

## Текущее состояние

ZamerFlow — один Node.js/TypeScript-проект, который запускает Telegram-бота и Fastify-админку в одном процессе.

Текущий стек:

- Node.js;
- TypeScript;
- Telegraf;
- Fastify;
- SQLite;
- better-sqlite3;
- dotenv;
- tsx;
- чистый SQL;
- server-rendered HTML.

Проект не использует ORM, SPA-фронтенд и отдельные сервисы.

## Запуск

Основной dev-запуск:

```bash
npm run dev
```

Фактически запускается:

```bash
tsx src/index.ts
```

Проверка типов:

```bash
npm run typecheck
```

## Один процесс на MVP

На MVP бот и админка работают в одном Node.js-процессе.

Причины:

* проще деплой;
* проще локальная разработка;
* одна SQLite-база;
* меньше инфраструктуры;
* быстрее стабилизировать продуктовый flow.

Усложнение до нескольких процессов или сервисов возможно позже, если появится реальная причина.

## Главные runtime-компоненты

### Telegram-бот

Telegraf-бот работает через long polling.

Webhook пока не используется.

Запуск бота выполняется с ограниченным retry. При старте long polling используется `dropPendingUpdates: true`: updates, отправленные во время простоя процесса, могут быть отброшены, зато старые inline callback-и после рестарта не должны повторно ломать процесс.

### Админка

Fastify-сервер отдаёт server-rendered HTML.

Админка доступна по `/admin`.

### SQLite

База данных хранится в SQLite-файле по пути из `DATABASE_PATH`.

Приложение включает `PRAGMA foreign_keys = ON`.

### Миграции

При старте приложение создаёт таблицу `schema_migrations` и применяет новые SQL-файлы из папки `migrations`.

## Слой приложения

Желаемая архитектура:

```text
Telegram bot / Admin UI
→ services
→ repositories
→ SQLite
```

Текущее состояние ближе к:

```text
Telegram bot / Admin routes
→ repositories
→ SQLite
```

Часть бизнес-логики ещё находится в Telegram wizard и admin routes. В дальнейшем её стоит постепенно выносить в services, не ломая MVP.

## Основные директории

Ожидаемая структура проекта:

```text
src/
  index.ts
  config.ts
  bot/
  admin/
  db/
  types/
migrations/
docs/
```

### `src/index.ts`

Точка входа.

Делает:

* загрузку `.env`;
* создание SQLite-подключения;
* запуск миграций;
* создание repositories;
* создание бота;
* запуск Fastify-админки;
* запуск Telegraf long polling;
* graceful shutdown для SIGINT/SIGTERM.

При временной сетевой ошибке Telegram API запуск бота пробуется повторно несколько раз. Если все попытки исчерпаны, процесс завершает старт с ошибкой.

### `src/bot/`

Telegram bot layer.

Здесь живут:

* регистрация команд;
* wizard создания заявки;
* форматирование карточки.

### `src/admin/`

Fastify admin layer.

Здесь живут:

* HTML layout helpers;
* формы;
* маршруты админки.

### `src/db/`

Data access layer.

Здесь живут:

* SQLite connection;
* миграционный runner;
* repositories.

### `src/types/`

Общие TypeScript-типы для заявок, салонов, auth flow и wizard-сессий.

### `migrations/`

SQL-миграции.

## Бизнес-логика

На MVP допустимо, что часть flow находится в `src/bot/orderWizard.ts`.

Но стратегически бизнес-логика должна уходить из handlers/routes в services:

* создание заявки;
* применение правил салона;
* snapshot-логика;
* проверка прав пользователя;
* формирование карточки.

## Snapshot-подход

Заявки должны сохранять исторический слепок данных.

Если после создания заявки в салоне изменится email, телефон менеджера или тариф, старая заявка должна отображаться так, как она была создана.

Поэтому в `orders` и `order_items` используются snapshot-поля.

## Ограничения MVP

Не добавлять без явной причины:

* ORM;
* PostgreSQL;
* Redis;
* микросервисы;
* Kubernetes;
* React/Vue frontend;
* сложный CI/CD;
* сложный мониторинг;
* AI-парсинг.

## Известные архитектурные замечания

### `payment_by_locked` vs `is_payment_by_fixed`

В ранних обсуждениях поле фиксированной оплаты называлось `payment_by_locked`.

В текущем коде фактическое поле называется:

```text
is_payment_by_fixed
```

В документации дальше используется фактическое имя из кода.

Переименование можно сделать позже отдельной ADR и миграцией, если появится причина.

### Сервисный слой

Сейчас сервисный слой выражен не полностью. Это нормально для MVP, но при развитии проекта новые сложные правила лучше выносить в services, чтобы не раздувать bot handlers и admin routes.
