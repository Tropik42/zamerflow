export interface AppConfig {
  botToken: string;
  databasePath: string;
  adminPort: number;
}

/**
 * Читает и проверяет переменные окружения приложения.
 * @returns {AppConfig} Конфигурация Telegram-бота и SQLite-базы.
 * @throws {Error} Если обязательный BOT_TOKEN не задан.
 */
export function loadConfig(): AppConfig {
  const botToken = process.env.BOT_TOKEN;
  const databasePath = process.env.DATABASE_PATH ?? "./data/zamerflow.sqlite";
  const adminPort = Number(process.env.ADMIN_PORT ?? "3000");

  if (!botToken) {
    throw new Error("BOT_TOKEN is required. Add it to .env.");
  }

  if (!Number.isInteger(adminPort) || adminPort <= 0) {
    throw new Error("ADMIN_PORT must be a positive integer.");
  }

  return {
    botToken,
    databasePath,
    adminPort
  };
}
