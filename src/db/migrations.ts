import type { AppDatabase } from "./db.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Применяет новые SQL-миграции из папки migrations.
 * @param {AppDatabase} db Открытое подключение к SQLite.
 * @param {string} migrationsDir Папка с SQL-файлами миграций.
 * @returns {void}
 */
export function runMigrations(db: AppDatabase, migrationsDir = "migrations"): void {
  console.info("ZamerFlow migrations: checking for pending migrations.");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const resolvedDir = path.resolve(migrationsDir);
  const migrationFiles = fs
    .readdirSync(resolvedDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const isApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1");
  const markApplied = db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)");

  const applyMigration = db.transaction((filename: string, sql: string) => {
    db.exec(sql);
    markApplied.run(filename, new Date().toISOString());
  });

  for (const filename of migrationFiles) {
    if (isApplied.get(filename)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(resolvedDir, filename), "utf8");
    console.info(`ZamerFlow migrations: applying ${filename}.`);

    if (hasExplicitTransaction(sql)) {
      db.exec(addMarkAppliedToExplicitTransaction(sql, filename));
      console.info(`ZamerFlow migrations: applied ${filename}.`);
      continue;
    }

    applyMigration(filename, sql);
    console.info(`ZamerFlow migrations: applied ${filename}.`);
  }

  console.info("ZamerFlow migrations: complete.");
}

/**
 * Проверяет, управляет ли SQL-файл собственной транзакцией.
 * @param {string} sql Текст SQL-миграции.
 * @returns {boolean} true, если в миграции есть BEGIN TRANSACTION.
 */
function hasExplicitTransaction(sql: string): boolean {
  return /\bBEGIN\s+(TRANSACTION\s*)?;/i.test(sql);
}

/**
 * Добавляет запись в schema_migrations внутрь явной транзакции миграции.
 * @param {string} sql Текст SQL-миграции с BEGIN/COMMIT.
 * @param {string} filename Имя применяемого файла миграции.
 * @returns {string} SQL с добавленной записью в schema_migrations перед COMMIT.
 * @throws {Error} Если миграция открывает транзакцию, но не завершает её COMMIT.
 */
function addMarkAppliedToExplicitTransaction(sql: string, filename: string): string {
  const appliedAt = new Date().toISOString();
  const markAppliedSql = `
INSERT INTO schema_migrations (filename, applied_at)
VALUES (${toSqlString(filename)}, ${toSqlString(appliedAt)});
`;

  if (!/\bCOMMIT\s*;\s*$/i.test(sql)) {
    throw new Error(`Migration ${filename} starts a transaction but does not end with COMMIT;`);
  }

  return sql.replace(/\bCOMMIT\s*;\s*$/i, `${markAppliedSql}\nCOMMIT;`);
}

/**
 * Экранирует строку для безопасной вставки в SQL-литерал.
 * @param {string} value Значение для SQL-строки.
 * @returns {string} Экранированный SQL-литерал.
 */
function toSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
