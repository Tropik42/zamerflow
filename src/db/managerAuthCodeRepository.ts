import type { AppDatabase } from "./db.js";
import type {
  AuthenticatedUser,
  ManagerAuthCode,
  TelegramUserIdentity
} from "../types/auth.js";
import { mapTelegramUserRow } from "./telegramUserRepository.js";

export interface ManagerAuthCodeRepository {
  findAvailableCode(authCode: string): ManagerAuthCode | undefined;
  getAllCodes(): ManagerAuthCodeListItem[];
  countUnusedCodes(): number;
  createAuthCode(authCode: string, managerId: number): boolean;
  markCodeAsUsed(authCode: string): void;
  resetAuthCode(authCode: string): void;
  consumeAuthCode(
    authCode: string,
    telegramUser: TelegramUserIdentity
  ): AuthenticatedUser | undefined;
}

export interface ManagerAuthCodeListItem extends ManagerAuthCode {
  salon_name?: string;
  manager_name?: string;
}

interface ManagerWithSalon {
  manager_id: number;
  manager_name: string;
  manager_phone?: string;
  manager_role: string;
  salon_id: number;
  salon_name: string;
}

/**
 * Создаёт репозиторий одноразовых кодов доступа менеджеров.
 * @param {AppDatabase} db Открытое подключение к SQLite.
 * @returns {ManagerAuthCodeRepository} Методы проверки и погашения кодов.
 */
export function createManagerAuthCodeRepository(db: AppDatabase): ManagerAuthCodeRepository {
  const selectAvailableCode = db.prepare(`
    SELECT
      auth_code,
      manager_id,
      create_datetime,
      used_datetime,
      is_used
    FROM manager_auth_codes
    WHERE UPPER(auth_code) = ? AND is_used = 0
    LIMIT 1
  `);

  const selectAllCodes = db.prepare(`
    SELECT
      mac.auth_code,
      mac.manager_id,
      mac.create_datetime,
      mac.used_datetime,
      mac.is_used,
      s.salon_name,
      sm.manager_name
    FROM manager_auth_codes mac
    INNER JOIN salon_managers sm ON sm.manager_id = mac.manager_id
    LEFT JOIN salons s ON s.salon_id = sm.salon_id
    ORDER BY mac.create_datetime DESC, mac.auth_code ASC
  `);

  const countUnusedCodes = db.prepare(`
    SELECT COUNT(*) AS count
    FROM manager_auth_codes
    WHERE is_used = 0
  `);

  const insertAuthCode = db.prepare(`
    INSERT INTO manager_auth_codes (
      auth_code,
      manager_id,
      create_datetime,
      is_used
    ) VALUES (
      @authCode,
      @managerId,
      datetime('now'),
      0
    )
  `);

  const selectManagerWithSalon = db.prepare(`
    SELECT
      sm.manager_id,
      sm.manager_name,
      sm.manager_phone,
      sm.manager_role,
      sm.salon_id,
      s.salon_name
    FROM salon_managers sm
    INNER JOIN salons s ON s.salon_id = sm.salon_id
    WHERE sm.manager_id = ? AND sm.is_active = 1 AND s.is_active = 1
    LIMIT 1
  `);

  const insertTelegramUser = db.prepare(`
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

  const updateCodeAsUsed = db.prepare(`
    UPDATE manager_auth_codes
    SET
      is_used = 1,
      used_datetime = @now
    WHERE UPPER(auth_code) = @authCode AND is_used = 0
  `);

  const resetCode = db.prepare(`
    UPDATE manager_auth_codes
    SET
      is_used = 0,
      used_datetime = NULL
    WHERE UPPER(auth_code) = @authCode
  `);

  const selectTelegramUser = db.prepare(`
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

  const consumeCodeTransaction = db.transaction(
    (authCode: string, telegramUser: TelegramUserIdentity) => {
      const normalizedCode = normalizeAuthCode(authCode);
      const code = selectAvailableCode.get(normalizedCode);

      if (!code) {
        return undefined;
      }

      const manager = selectManagerWithSalon.get(
        (code as ManagerAuthCode).manager_id
      ) as ManagerWithSalon | undefined;

      if (!manager) {
        return undefined;
      }

      const now = new Date().toISOString();

      insertTelegramUser.run({
        telegramUserId: telegramUser.telegram_user_id,
        now,
        username: telegramUser.username ?? null,
        firstName: telegramUser.first_name ?? null,
        lastName: telegramUser.last_name ?? null,
        role: manager.manager_role,
        salonId: manager.salon_id,
        managerId: manager.manager_id
      });

      const updateResult = updateCodeAsUsed.run({
        authCode: normalizedCode,
        now
      });

      if (updateResult.changes !== 1) {
        throw new Error("Auth code was already used");
      }

      const createdUser = selectTelegramUser.get(telegramUser.telegram_user_id);
      if (!createdUser) {
        throw new Error("Telegram user was not created");
      }

      return mapTelegramUserRow(createdUser) as AuthenticatedUser;
    }
  );

  return {
    findAvailableCode(authCode) {
      const row = selectAvailableCode.get(normalizeAuthCode(authCode));
      return row ? mapManagerAuthCodeRow(row) : undefined;
    },
    getAllCodes() {
      return selectAllCodes.all().map(mapManagerAuthCodeListItemRow);
    },
    countUnusedCodes() {
      const row = countUnusedCodes.get() as { count: number };
      return Number(row.count);
    },
    createAuthCode(authCode, managerId) {
      try {
        insertAuthCode.run({
          authCode: normalizeAuthCode(authCode),
          managerId
        });
        return true;
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          return false;
        }

        throw error;
      }
    },
    markCodeAsUsed(authCode) {
      updateCodeAsUsed.run({
        authCode: normalizeAuthCode(authCode),
        now: new Date().toISOString()
      });
    },
    resetAuthCode(authCode) {
      resetCode.run({
        authCode: normalizeAuthCode(authCode)
      });
    },
    consumeAuthCode(authCode, telegramUser) {
      return consumeCodeTransaction(authCode, telegramUser);
    }
  };
}

export function normalizeAuthCode(authCode: string): string {
  return authCode.trim().toUpperCase();
}

function mapManagerAuthCodeRow(row: unknown): ManagerAuthCode {
  const code = row as Record<string, unknown>;

  return {
    auth_code: String(code.auth_code),
    manager_id: Number(code.manager_id),
    create_datetime: String(code.create_datetime),
    used_datetime: optionalString(code.used_datetime),
    is_used: Number(code.is_used)
  };
}

function mapManagerAuthCodeListItemRow(row: unknown): ManagerAuthCodeListItem {
  const code = row as Record<string, unknown>;

  return {
    ...mapManagerAuthCodeRow(row),
    salon_name: optionalString(code.salon_name),
    manager_name: optionalString(code.manager_name)
  };
}

function isSqliteConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: string }).code === "string" &&
    (error as { code: string }).code.startsWith("SQLITE_CONSTRAINT")
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
