import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { createOrderStatusHistoryRepository } from "../src/db/orderStatusHistoryRepository.js";
import { orderStatusCodes, orderWorkflowEventTypes } from "../src/types/order.js";

const migrationsDir = path.join(process.cwd(), "migrations");
const migration007 = fs.readFileSync(
  path.join(migrationsDir, "007_add_order_workflow_foundation.sql"),
  "utf8"
);

assert.doesNotMatch(migration007, /\bCREATE\s+TABLE\s+orders\b/i);
assert.doesNotMatch(migration007, /\bALTER\s+TABLE\s+orders\b/i);
assert.doesNotMatch(migration007, /\bUPDATE\s+orders\b/i);

assert.deepEqual(Array.from(orderStatusCodes), ["accepted", "awaiting_coordination", "confirmed"]);
assert.deepEqual(Array.from(orderWorkflowEventTypes), ["created", "confirmed", "rescheduled"]);

withTempDatabase((db) => {
  runMigrations(db, migrationsDir);

  assertTableExists(db, "order_statuses");
  assertTableExists(db, "order_status_history");
  assertIndexExists(db, "idx_order_status_history_order_datetime");

  const statuses = db
    .prepare("SELECT status_code FROM order_statuses ORDER BY sort_order ASC, status_code ASC")
    .all()
    .map((row) => String((row as { status_code: string }).status_code));

  assert.deepEqual(statuses, ["accepted", "awaiting_coordination", "confirmed"]);
  assert.equal(statuses.includes("rescheduled"), false);

  const statusColumn = getTableColumn(db, "orders", "status");

  assert.equal(statusColumn?.type, "TEXT");

  const orderId = insertAcceptedOrder(db);
  const repository = createOrderStatusHistoryRepository(db);

  repository.recordEvent({
    orderId,
    eventType: "rescheduled",
    fromStatusCode: "awaiting_coordination",
    toStatusCode: "awaiting_coordination",
    previousMeasureDate: "18 октября",
    previousMeasureTime: "после 16:00",
    newMeasureDate: "19 октября",
    newMeasureTime: "после 17:00",
    actorSource: "test",
    actorExternalId: "workflow-db-test",
    createDatetime: "2026-10-10T10:20:00.000Z"
  });
  repository.recordEvent({
    orderId,
    eventType: "created",
    toStatusCode: "accepted",
    actorSource: "test",
    actorExternalId: "workflow-db-test",
    createDatetime: "2026-10-10T10:00:00.000Z"
  });
  repository.recordEvent({
    orderId,
    eventType: "confirmed",
    fromStatusCode: "accepted",
    toStatusCode: "confirmed",
    actorSource: "test",
    actorExternalId: "workflow-db-test",
    createDatetime: "2026-10-10T10:10:00.000Z"
  });

  const history = repository.listByOrderId(orderId);

  assert.deepEqual(
    history.map((event) => event.event_type),
    ["created", "confirmed", "rescheduled"]
  );
  assert.deepEqual(
    history.map((event) => event.create_datetime),
    [
      "2026-10-10T10:00:00.000Z",
      "2026-10-10T10:10:00.000Z",
      "2026-10-10T10:20:00.000Z"
    ]
  );
  assert.equal(history[2]?.previous_measure_date, "18 октября");
  assert.equal(history[2]?.new_measure_time, "после 17:00");

  assert.throws(() => {
    repository.recordEvent({
      orderId: orderId + 1000,
      eventType: "created",
      toStatusCode: "accepted",
      createDatetime: "2026-10-10T10:30:00.000Z"
    });
  }, /FOREIGN KEY constraint failed/);
});

withTempDatabase((db, tempDir) => {
  const pre007MigrationsDir = path.join(tempDir, "pre-007-migrations");

  copyMigrationsUntil(migrationsDir, pre007MigrationsDir, "006_add_order_has_photos.sql");
  runMigrations(db, pre007MigrationsDir);

  const legacyOrderId = insertAcceptedOrder(db);

  runMigrations(db, migrationsDir);

  const row = db
    .prepare("SELECT status FROM orders WHERE order_id = ?")
    .get(legacyOrderId) as { status: string };

  assert.equal(row.status, "accepted");
});

function withTempDatabase(run: (db: Database.Database, tempDir: string) => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zamerflow-workflow-db-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  db.pragma("foreign_keys = ON");

  try {
    run(db, tempDir);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertTableExists(db: Database.Database, tableName: string): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

  assert.ok(row, `Expected table ${tableName} to exist`);
}

function assertIndexExists(db: Database.Database, indexName: string): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(indexName);

  assert.ok(row, `Expected index ${indexName} to exist`);
}

function getTableColumn(
  db: Database.Database,
  tableName: string,
  columnName: string
): { name: string; type: string } | undefined {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row as { name: string; type: string })
    .find((column) => column.name === columnName);
}

function insertAcceptedOrder(db: Database.Database): number {
  const result = db
    .prepare(
      `
      INSERT INTO orders (
        create_datetime,
        modify_datetime,
        status,
        address,
        formatted_card_text
      ) VALUES (
        @createDatetime,
        @modifyDatetime,
        @status,
        @address,
        @formattedCardText
      )
      `
    )
    .run({
      createDatetime: "2026-10-10T10:00:00.000Z",
      modifyDatetime: "2026-10-10T10:00:00.000Z",
      status: "accepted",
      address: "Москва, Тестовая улица, 1",
      formattedCardText: "Тестовая карточка"
    });

  return Number(result.lastInsertRowid);
}

function copyMigrationsUntil(sourceDir: string, targetDir: string, lastFilename: string): void {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const filename of fs.readdirSync(sourceDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (filename > lastFilename) {
      continue;
    }

    fs.copyFileSync(path.join(sourceDir, filename), path.join(targetDir, filename));
  }
}
