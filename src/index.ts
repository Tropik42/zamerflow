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
import { createDadataClient } from "./integrations/dadataClient.js";
import { createAddressGeoService } from "./services/addressGeoService.js";

const config = loadConfig();
console.info(
  `ZamerFlow application starting: env=${config.appEnv}, bot_enabled=${config.botEnabled}, dadata_enabled=${config.dadata.enabled}.`
);

const db = createDatabase(config.databasePath);

runMigrations(db);

const orderRepository = createOrderRepository(db);
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
const bot = config.botEnabled
  ? createBot(
      config.botToken,
      orderRepository,
      salonRepository,
      salonRequiredItemRepository,
      telegramUserRepository,
      managerAuthCodeRepository,
      addressGeoService
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
