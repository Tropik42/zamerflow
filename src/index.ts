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
import { createSalonManagerRepository } from "./db/salonManagerRepository.js";
import { createSalonRequiredItemRepository } from "./db/salonRequiredItemRepository.js";
import { createSalonRepository } from "./db/salonRepository.js";
import { createTelegramUserRepository } from "./db/telegramUserRepository.js";

const config = loadConfig();
const db = createDatabase(config.databasePath);

runMigrations(db);

const orderRepository = createOrderRepository(db);
const salonRepository = createSalonRepository(db);
const managerRepository = createSalonManagerRepository(db);
const salonRequiredItemRepository = createSalonRequiredItemRepository(db);
const telegramUserRepository = createTelegramUserRepository(db);
const managerAuthCodeRepository = createManagerAuthCodeRepository(db);
const bot = createBot(
  config.botToken,
  orderRepository,
  salonRepository,
  salonRequiredItemRepository,
  telegramUserRepository,
  managerAuthCodeRepository
);

const adminServer = await startAdminServer({
  port: config.adminPort,
  salonRepository,
  salonRequiredItemRepository,
  managerRepository,
  authCodeRepository: managerAuthCodeRepository,
  orderRepository
});

try {
  await launchBotWithRetry(bot);
} catch (error) {
  const message = safeErrorMessage(error);
  console.error(`ZamerFlow bot failed to start after retries: ${message}`);
  await adminServer.close();
  db.close();
  process.exit(1);
}

console.log("ZamerFlow bot started in long polling mode.");
console.log(`ZamerFlow admin started at http://localhost:${config.adminPort}/admin`);

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  bot.stop(signal);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
