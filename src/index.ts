import "dotenv/config";
import { startAdminServer } from "./admin/server.js";
import { createBot } from "./bot/bot.js";
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

await bot.launch();

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
