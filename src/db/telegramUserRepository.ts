import type { AppDatabase } from "./db.js";
import type { AuthenticatedUser, TelegramUser, TelegramUserIdentity } from "../types/auth.js";

export interface CreateTelegramUserFromManagerParams extends TelegramUserIdentity {
  salon_id: number;
  manager_id: number;
  role?: string;
}

export interface TelegramUserRepository {
  findByTelegramUserId(telegramUserId: string): AuthenticatedUser | TelegramUser | undefined;
  createTelegramUserFromManager(params: CreateTelegramUserFromManagerParams): AuthenticatedUser;
  updateTelegramUserActivity(telegramUserId: string, isActive: boolean): void;
}

/**
 * Создаёт репозиторий привязок Telegram-пользователей.
 * @param {AppDatabase} db Открытое подключение к SQLite.
 * @returns {TelegramUserRepository} Методы чтения и записи Telegram-пользователей.
 */
export function createTelegramUserRepository(db: AppDatabase): TelegramUserRepository {
  const selectByTelegramUserId = db.prepare(`
    SELECT
      tu.telegram_user_id,
      tu.create_datetime,
      tu.modify_datetime,
      tu.username,
      tu.first_name,
      tu.last_name,
      tu.role,
      tu.salon_id,
      tu.manager_id,
      tu.is_active,
      s.salon_name,
      sm.manager_name,
      sm.manager_phone,
      sm.manager_role
    FROM telegram_users tu
    LEFT JOIN salons s ON s.salon_id = tu.salon_id
    LEFT JOIN salon_managers sm ON sm.manager_id = tu.manager_id
    WHERE tu.telegram_user_id = ?
    LIMIT 1
  `);

  const insertFromManager = db.prepare(`
    INSERT INTO telegram_users (
      telegram_user_id,
      create_datetime,
      modify_datetime,
      username,
      first_name,
      last_name,
      role,
      salon_id,
      manager_id,
      is_active
    ) VALUES (
      @telegramUserId,
      @now,
      @now,
      @username,
      @firstName,
      @lastName,
      @role,
      @salonId,
      @managerId,
      1
    )
  `);

  const updateActivity = db.prepare(`
    UPDATE telegram_users
    SET
      is_active = @isActive,
      modify_datetime = @now
    WHERE telegram_user_id = @telegramUserId
  `);

  return {
    findByTelegramUserId(telegramUserId) {
      const row = selectByTelegramUserId.get(telegramUserId);
      return row ? mapTelegramUserRow(row) : undefined;
    },
    createTelegramUserFromManager(params) {
      const now = new Date().toISOString();

      insertFromManager.run({
        telegramUserId: params.telegram_user_id,
        now,
        username: params.username ?? null,
        firstName: params.first_name ?? null,
        lastName: params.last_name ?? null,
        role: params.role ?? "manager",
        salonId: params.salon_id,
        managerId: params.manager_id
      });

      const user = selectByTelegramUserId.get(params.telegram_user_id);
      if (!user) {
        throw new Error("Telegram user was not created");
      }

      return mapTelegramUserRow(user) as AuthenticatedUser;
    },
    updateTelegramUserActivity(telegramUserId, isActive) {
      updateActivity.run({
        telegramUserId,
        isActive: isActive ? 1 : 0,
        now: new Date().toISOString()
      });
    }
  };
}

/**
 * Преобразует строку SQLite в типизированного Telegram-пользователя.
 * @param {unknown} row Сырая строка результата better-sqlite3.
 * @returns {TelegramUser | AuthenticatedUser} Пользователь с опциональными данными салона и менеджера.
 */
export function mapTelegramUserRow(row: unknown): TelegramUser | AuthenticatedUser {
  const user = row as Record<string, unknown>;

  return {
    telegram_user_id: String(user.telegram_user_id),
    create_datetime: String(user.create_datetime),
    modify_datetime: String(user.modify_datetime),
    username: optionalString(user.username),
    first_name: optionalString(user.first_name),
    last_name: optionalString(user.last_name),
    role: String(user.role),
    salon_id: optionalNumber(user.salon_id),
    manager_id: optionalNumber(user.manager_id),
    is_active: Number(user.is_active),
    salon_name: optionalString(user.salon_name),
    manager_name: optionalString(user.manager_name),
    manager_phone: optionalString(user.manager_phone),
    manager_role: optionalString(user.manager_role)
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
