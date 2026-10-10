// Файл является точкой входа: собирает зависимости, запускает миграции, бота и админку.

import "dotenv/config";
import type { Context, Telegraf } from "telegraf";
import { startAdminServer } from "./admin/server.js";
import { createBot } from "./bot/bot.js";
import { safeErrorMessage } from "./bot/errorLogging.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/db.js";
import { createManagerAuthCodeRepository } from "./db/managerAuthCodeRepository.js";
import { runMigrations } from "./db/migrations.js";
import { createOrderRepository } from "./db/orderRepository.js";
import { createOrderStatusHistoryRepository } from "./db/orderStatusHistoryRepository.js";
import { createSalonManagerRepository } from "./db/salonManagerRepository.js";
import { createSalonRequiredItemRepository } from "./db/salonRequiredItemRepository.js";
import { createSalonRepository } from "./db/salonRepository.js";
import { createTelegramUserRepository } from "./db/telegramUserRepository.js";
import { createDadataClient } from "./integrations/dadataClient.js";
import { createAddressGeoService } from "./services/addressGeoService.js";

const config = loadConfig();
console.info(
  `ZamerFlow application starting: env=${config.appEnv}, bot_enabled=${config.botEnabled}, dadata_enabled=${config.dadata.enabled}.`
);

// Создаём SQLite-подключение и доводим схему до актуальной версии перед стартом сервисов.
const db = createDatabase(config.databasePath);

runMigrations(db);

// Собираем репозитории и сервисы вручную, чтобы MVP оставался без DI-контейнера и ORM.
const orderRepository = createOrderRepository(db);
const orderStatusHistoryRepository = createOrderStatusHistoryRepository(db);
const salonRepository = createSalonRepository(db);
const managerRepository = createSalonManagerRepository(db);
const salonRequiredItemRepository = createSalonRequiredItemRepository(db);
const telegramUserRepository = createTelegramUserRepository(db);
const managerAuthCodeRepository = createManagerAuthCodeRepository(db);
const dadataClient = config.dadata.enabled
  ? createDadataClient({
      apiKey: config.dadata.apiKey,
      secretKey: config.dadata.secretKey,
      timeoutMs: config.dadata.timeoutMs
    })
  : undefined;
const addressGeoService = createAddressGeoService({
  enabled: config.dadata.enabled,
  dadataClient
});
// Telegram-бот создаётся только если это разрешено env-флагом BOT_ENABLED.
const bot = config.botEnabled
  ? createBot(
      config.botToken,
      db,
      orderRepository,
      orderStatusHistoryRepository,
      salonRepository,
      salonRequiredItemRepository,
      telegramUserRepository,
      managerAuthCodeRepository,
      addressGeoService,
      config.dispatchChatId
    )
  : undefined;

console.info("ZamerFlow admin starting.");
const adminServer = await startAdminServer({
  port: config.adminPort,
  salonRepository,
  salonRequiredItemRepository,
  managerRepository,
  authCodeRepository: managerAuthCodeRepository,
  orderRepository
});

if (bot) {
  try {
    console.info("ZamerFlow bot starting in long polling mode.");
    await launchBotWithRetry(bot);
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error(`ZamerFlow bot failed to start after retries: ${message}`);
    await adminServer.close();
    db.close();
    process.exit(1);
  }

  console.info("ZamerFlow bot started in long polling mode.");
} else {
  console.info("ZamerFlow bot polling disabled by BOT_ENABLED=false.");
}

console.info(`ZamerFlow admin started at http://localhost:${config.adminPort}/admin`);
console.info(`ZamerFlow healthcheck available at http://localhost:${config.adminPort}/health`);

// Аккуратно останавливает polling, HTTP-сервер и SQLite при завершении процесса.
async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  console.info(`ZamerFlow application stopping: signal=${signal}.`);
  bot?.stop(signal);
  await adminServer.close();
  db.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Запускает Telegram long polling с несколькими попытками на случай временной ошибки Telegram API.
async function launchBotWithRetry(botToLaunch: Telegraf<Context>): Promise<void> {
  const maxAttempts = 5;
  const retryDelayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // MVP/dev tradeoff: updates sent while the bot was offline can be lost,
      // but stale inline callbacks after restart should not be replayed.
      await botToLaunch.launch({ dropPendingUpdates: true });
      return;
    } catch (error) {
      const message = safeErrorMessage(error);
      console.warn(`Telegram bot launch attempt ${attempt}/${maxAttempts} failed: ${message}`);

      if (attempt === maxAttempts) {
        throw error;
      }

      await delay(retryDelayMs);
    }
  }
}

// Возвращает Promise-задержку для retry-цикла запуска бота.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
