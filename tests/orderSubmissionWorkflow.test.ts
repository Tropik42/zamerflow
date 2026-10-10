// Файл проверяет сохранение заявки, историю workflow и dispatch-отправку в Telegram.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Context, Telegraf } from "telegraf";
import { runMigrations } from "../src/db/migrations.js";
import { createOrderRepository, type OrderRepository } from "../src/db/orderRepository.js";
import {
  createOrderStatusHistoryRepository,
  type OrderStatusHistoryRepository,
  type RecordOrderStatusHistoryEventParams
} from "../src/db/orderStatusHistoryRepository.js";
import {
  createDispatchNotificationService,
  createOrderWorkflowCallbackData,
  type DispatchNotificationService,
  type DispatchPackageResult,
  type SendOrderPackageParams
} from "../src/services/dispatchNotificationService.js";
import { createOrderSubmissionService } from "../src/services/orderSubmissionService.js";
import {
  formatOrderSubmittedDispatchFailureMessage,
  formatOrderSubmittedMessage
} from "../src/bot/orderSubmissionMessages.js";
import type { SubmittedOrder } from "../src/types/order.js";

const migrationsDir = path.join(process.cwd(), "migrations");

await withSubmissionContext(async ({ orderRepository, historyRepository, service, dispatch }) => {
  const order = createSubmittedOrder({
    measureDate: "18 октября",
    measureTime: "после 16:00",
    telegramUserId: "777000111"
  });

  const result = await service.submitOrder({
    order,
    photos: [{ fileId: "photo-file-id" }],
    sourceChatId: 12345
  });

  assert.equal(result.dispatchNotificationStatus, "sent");

  const savedOrder = orderRepository.getOrderById(result.orderId);
  const history = historyRepository.listByOrderId(result.orderId);

  assert.equal(savedOrder?.status, "awaiting_coordination");
  assert.equal(savedOrder?.final_price, undefined);
  assert.equal(orderRepository.getOrderItems(result.orderId).length, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.event_type, "created");
  assert.equal(history[0]?.from_status_code, undefined);
  assert.equal(history[0]?.to_status_code, "awaiting_coordination");
  assert.equal(history[0]?.new_measure_date, "18 октября");
  assert.equal(history[0]?.new_measure_time, "после 16:00");
  assert.equal(history[0]?.actor_source, "telegram");
  assert.equal(history[0]?.actor_external_id, "777000111");
  assert.equal(dispatch.calls.length, 1);
  assert.equal(dispatch.calls[0]?.orderId, result.orderId);
});

await withSubmissionContext(async ({ db, historyRepository, dispatch }) => {
  const throwingHistoryRepository = createThrowingHistoryRepository(historyRepository);
  const service = createOrderSubmissionService({
    db,
    orderRepository: createOrderRepository(db),
    orderStatusHistoryRepository: throwingHistoryRepository,
    dispatchNotificationService: dispatch,
    dispatchChatId: "-1001234567890"
  });

  await assert.rejects(
    service.submitOrder({
      order: createSubmittedOrder({
        telegramUserId: "777000222"
      }),
      photos: [{ fileId: "photo-file-id" }],
      sourceChatId: 12345
    }),
    /forced history failure/
  );

  assert.equal(countRows(db, "orders"), 0);
  assert.equal(countRows(db, "order_items"), 0);
  assert.equal(countRows(db, "order_status_history"), 0);
  assert.equal(dispatch.calls.length, 0);
});

await withSubmissionContext(async ({ orderRepository, historyRepository, service, dispatch }) => {
  dispatch.nextResult = {
    chatId: "-1001234567890",
    photoMessageIds: [],
    failedStage: "header",
    errorCode: "TELEGRAM_HEADER_SEND_FAILED"
  };

  const result = await service.submitOrder({
    order: createSubmittedOrder({
      telegramUserId: "777000333"
    }),
    photos: [],
    sourceChatId: 12345
  });

  assert.equal(result.dispatchNotificationStatus, "failed");
  assert.equal(result.dispatchNotificationError, "TELEGRAM_HEADER_SEND_FAILED");
  assert.equal(orderRepository.getOrderById(result.orderId)?.status, "awaiting_coordination");
  assert.equal(orderRepository.getOrderById(result.orderId)?.dispatch_notification_status, "failed");

  const history = historyRepository.listByOrderId(result.orderId);

  assert.equal(history.length, 1);
  assert.equal(history[0]?.event_type, "created");
  assert.equal(history[0]?.to_status_code, "awaiting_coordination");
  assert.equal(history[0]?.new_measure_time, undefined);
  assert.equal(dispatch.calls.length, 1);
});

assert.equal(
  formatOrderSubmittedMessage(42),
  "✅ Заявка #42 принята.\n\nИнформацию о согласовании или переносе сообщим дополнительно."
);
assert.doesNotMatch(formatOrderSubmittedMessage(42), /согласована/i);
assert.equal(
  formatOrderSubmittedDispatchFailureMessage(42),
  [
    "✅ Заявка #42 принята.",
    "",
    "Информацию о согласовании или переносе сообщим дополнительно.",
    "",
    "⚠️ Не удалось полностью отправить заявку в рабочий чат.",
    "Фотографии временно не сохраняются, поэтому для их повторной отправки может потребоваться создать заявку заново или отправить фото вручную."
  ].join("\n")
);

await testDispatchHeaderAndPackageOrder();

interface SubmissionContext {
  db: Database.Database;
  orderRepository: OrderRepository;
  historyRepository: OrderStatusHistoryRepository;
  service: ReturnType<typeof createOrderSubmissionService>;
  dispatch: CapturingDispatchNotificationService;
}

// Создаёт временный контекст с SQLite, репозиториями и fake dispatch-сервисом.
async function withSubmissionContext(
  run: (context: SubmissionContext) => Promise<void>
): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zamerflow-order-submission-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  db.pragma("foreign_keys = ON");

  try {
    runMigrations(db, migrationsDir);

    const orderRepository = createOrderRepository(db);
    const historyRepository = createOrderStatusHistoryRepository(db);
    const dispatch = createCapturingDispatchNotificationService();
    const service = createOrderSubmissionService({
      db,
      orderRepository,
      orderStatusHistoryRepository: historyRepository,
      dispatchNotificationService: dispatch,
      dispatchChatId: "-1001234567890"
    });

    await run({
      db,
      orderRepository,
      historyRepository,
      service,
      dispatch
    });
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

interface CapturingDispatchNotificationService extends DispatchNotificationService {
  calls: SendOrderPackageParams[];
  nextResult?: DispatchPackageResult;
}

// Создаёт dispatch-сервис, который запоминает вызовы и может вернуть заранее заданный результат.
function createCapturingDispatchNotificationService(): CapturingDispatchNotificationService {
  return {
    calls: [],
    async sendOrderPackage(params) {
      this.calls.push(params);

      return (
        this.nextResult ?? {
          chatId: params.chatId,
          headerMessageId: 101,
          photoMessageIds: params.photos.map((_, index) => 201 + index),
          cardMessageId: 301
        }
      );
    }
  };
}

// Создаёт валидную тестовую заявку с возможностью переопределить отдельные поля.
function createSubmittedOrder(overrides: Partial<SubmittedOrder> = {}): SubmittedOrder {
  return {
    status: "awaiting_coordination",
    salonNameSnapshot: "Тестовый салон",
    salonEmailSnapshot: "salon@example.com",
    managerNameSnapshot: "Олег",
    managerPhoneSnapshot: "+7-999-123-45-67",
    managerRoleSnapshot: "manager",
    clientContact: "+7-900-111-22-33 Клиент",
    address: "Москва, Тестовая улица, 1",
    metro: "Тестовая",
    measureDate: "18 октября",
    measureTime: undefined,
    serviceItems: [
      {
        type: "кухня",
        quantity: 1
      }
    ],
    paymentBy: "клиентом",
    basePrice: 2500,
    extraPriceMin: 1000,
    extraPriceMax: 1500,
    formattedCardText: "*На 18 октября*\nТестовая карточка",
    hasPhotos: false,
    telegramUserId: "777000000",
    ...overrides
  };
}

// Оборачивает history repository так, чтобы проверить rollback при ошибке истории.
function createThrowingHistoryRepository(
  repository: OrderStatusHistoryRepository
): OrderStatusHistoryRepository {
  return {
    recordEvent(event: RecordOrderStatusHistoryEventParams) {
      repository.recordEvent(event);
      throw new Error("forced history failure");
    },
    listByOrderId(orderId) {
      return repository.listByOrderId(orderId);
    }
  };
}

// Считает строки таблицы для проверки rollback транзакции.
function countRows(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number };
  return Number(row.count);
}

// Проверяет порядок сообщений dispatch-пакета и callback_data inline-кнопок.
async function testDispatchHeaderAndPackageOrder(): Promise<void> {
  const fakeTelegram = createFakeTelegram();
  const service = createDispatchNotificationService(fakeTelegram.bot);

  await service.sendOrderPackage({
    orderId: 42,
    chatId: "-1001234567890",
    salonName: "Тестовый салон",
    managerName: "Олег",
    measureDate: "18 октября",
    address: "Москва, Тестовая улица, 1",
    addressNormalizedSnapshot: "Москва, Тестовая улица, 1",
    addressBeltwayHit: "IN_MKAD",
    formattedCardText: "Чистая карточка",
    photos: [{ fileId: "photo-1" }, { fileId: "photo-2" }]
  });

  assert.deepEqual(
    fakeTelegram.calls.map((call) => call.type),
    ["sendMessage", "sendMediaGroup", "sendMessage"]
  );

  const headerCall = fakeTelegram.calls[0];
  const cardCall = fakeTelegram.calls[2];

  assert.equal(headerCall?.type, "sendMessage");
  assert.match(headerCall?.text ?? "", /Статус: ожидает согласования/);
  assert.equal(
    headerCall?.extra?.reply_markup.inline_keyboard[0]?.[0]?.callback_data,
    "order:confirm:42"
  );
  assert.equal(
    headerCall?.extra?.reply_markup.inline_keyboard[0]?.[1]?.callback_data,
    "order:reschedule:42"
  );
  assert.equal(headerCall?.extra?.reply_markup.inline_keyboard[0]?.[0]?.text, "✅ Согласовано");
  assert.equal(headerCall?.extra?.reply_markup.inline_keyboard[0]?.[1]?.text, "📅 Перенесено");
  assert.ok(createOrderWorkflowCallbackData("confirm", Number.MAX_SAFE_INTEGER).length <= 64);
  assert.ok(createOrderWorkflowCallbackData("reschedule", Number.MAX_SAFE_INTEGER).length <= 64);

  assert.equal(cardCall?.type, "sendMessage");
  assert.equal(cardCall?.text, "Чистая карточка");
  assert.equal(cardCall?.extra, undefined);
}

type TelegramCall =
  | {
      type: "sendMessage";
      chatId: string;
      text: string;
      extra?: HeaderExtra;
    }
  | {
      type: "sendMediaGroup";
      chatId: string;
      media: Array<{ type: "photo"; media: string }>;
    };

type HeaderExtra = {
  reply_markup: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
};

// Создаёт fake Telegraf с методами отправки сообщений и media group.
function createFakeTelegram(): { bot: Telegraf<Context>; calls: TelegramCall[] } {
  const calls: TelegramCall[] = [];

  const bot = {
    telegram: {
      async sendMessage(
        chatId: string,
        text: string,
        extra?: HeaderExtra
      ) {
        calls.push({
          type: "sendMessage",
          chatId,
          text,
          extra
        });

        return { message_id: calls.length };
      },
      async sendMediaGroup(chatId: string, media: Array<{ type: "photo"; media: string }>) {
        calls.push({
          type: "sendMediaGroup",
          chatId,
          media
        });

        return media.map((_, index) => ({ message_id: calls.length + index + 1 }));
      }
    }
  } as unknown as Telegraf<Context>;

  return {
    bot,
    calls
  };
}
