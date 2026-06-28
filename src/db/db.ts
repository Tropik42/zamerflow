import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type AppDatabase = Database.Database;

/**
 * Создаёт подключение к SQLite и включает внешние ключи.
 * @param {string} databasePath Путь к SQLite-файлу.
 * @returns {AppDatabase} Открытое подключение better-sqlite3.
 */
export function createDatabase(databasePath: string): AppDatabase {
  const resolvedPath = path.resolve(databasePath);
  const databaseDir = path.dirname(resolvedPath);

  fs.mkdirSync(databaseDir, { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");

  return db;
}
