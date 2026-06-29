export type AppEnv = "development" | "production";

export interface AppConfig {
  appEnv: AppEnv;
  botToken: string;
  botEnabled: boolean;
  databasePath: string;
  adminPort: number;
}

/**
 * Читает и проверяет переменные окружения приложения.
 * @returns {AppConfig} Конфигурация Telegram-бота и SQLite-базы.
 * @throws {Error} Если конфигурация некорректна или BOT_TOKEN не задан при включённом боте.
 */
export function loadConfig(): AppConfig {
  const appEnv = parseAppEnv(process.env.APP_ENV ?? "development");
  const botEnabled = parseBooleanEnv(process.env.BOT_ENABLED ?? "true", "BOT_ENABLED");
  const botToken = process.env.BOT_TOKEN;
  const databasePath = process.env.DATABASE_PATH ?? "./data/zamerflow-dev.sqlite";
  const adminPort = Number(process.env.ADMIN_PORT ?? "3000");

  if (botEnabled && !botToken) {
    throw new Error("BOT_TOKEN is required. Add it to .env.");
  }

  if (!Number.isInteger(adminPort) || adminPort <= 0) {
    throw new Error("ADMIN_PORT must be a positive integer.");
  }

  return {
    appEnv,
    botToken: botToken ?? "",
    botEnabled,
    databasePath,
    adminPort
  };
}

function parseAppEnv(value: string): AppEnv {
  if (value === "development" || value === "production") {
    return value;
  }

  throw new Error("APP_ENV must be either 'development' or 'production'.");
}

function parseBooleanEnv(value: string, name: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either 'true' or 'false'.`);
}
