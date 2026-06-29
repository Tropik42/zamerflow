export type AppEnv = "development" | "production";

export interface AppConfig {
  appEnv: AppEnv;
  botToken: string;
  botEnabled: boolean;
  databasePath: string;
  adminPort: number;
  dadata: DadataConfig;
}

export interface DadataConfig {
  enabled: boolean;
  apiKey: string;
  secretKey: string;
  timeoutMs: number;
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
  const dadataEnabled = parseBooleanEnv(process.env.DADATA_ENABLED ?? "false", "DADATA_ENABLED");
  const dadataApiKey = process.env.DADATA_API_KEY ?? "";
  const dadataSecretKey = process.env.DADATA_SECRET_KEY ?? "";
  const dadataTimeoutMs = Number(process.env.DADATA_TIMEOUT_MS ?? "3000");

  if (botEnabled && !botToken) {
    throw new Error("BOT_TOKEN is required. Add it to .env.");
  }

  if (!Number.isInteger(adminPort) || adminPort <= 0) {
    throw new Error("ADMIN_PORT must be a positive integer.");
  }

  if (!Number.isInteger(dadataTimeoutMs) || dadataTimeoutMs <= 0) {
    throw new Error("DADATA_TIMEOUT_MS must be a positive integer.");
  }

  if (dadataEnabled && (!dadataApiKey || !dadataSecretKey)) {
    throw new Error("DADATA_API_KEY and DADATA_SECRET_KEY are required when DADATA_ENABLED=true.");
  }

  return {
    appEnv,
    botToken: botToken ?? "",
    botEnabled,
    databasePath,
    adminPort,
    dadata: {
      enabled: dadataEnabled,
      apiKey: dadataApiKey,
      secretKey: dadataSecretKey,
      timeoutMs: dadataTimeoutMs
    }
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
