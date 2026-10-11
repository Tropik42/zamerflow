// Файл проверяет post-commit Telegram side effects после переноса заявки.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Context, Telegraf } from "telegraf";
import {
  formatDispatchRescheduleServiceMessage,
  handleOrderRescheduleCommitted,
  type CreateOrderRescheduleSideEffectsParams
} from "../src/bot/orderRescheduleSideEffects.js";
import type {
  RescheduleCommittedEvent,
  SuccessfulRescheduleOrderResult
} from "../src/bot/orderRescheduleEvents.js";
import {
  createTelegramManagerNotificationService,
  formatManagerWorkflowNotification
} from "../src/bot/telegramManagerNotificationService.js";
import { createTelegramWorkflowDispatchService } from "../src/bot/telegramWorkflowDispatchService.js";
import { createTelegramWorkflowHeaderService } from "../src/bot/telegramWorkflowHeaderService.js";
import { runMigrations } from "../src/db/migrations.js";
import { createOrderRepository, type OrderRepository } from "../src/db/orderRepository.js";
import {
  createOrderStatusHistoryRepository,
  type OrderStatusHistoryRepository
} from "../src/db/orderStatusHistoryRepository.js";
import {
  createOrderWorkflowService,
  type OrderWorkflowService,
  type RescheduleOrderResult
} from "../src/services/orderWorkflowService.js";
import type { SubmittedOrder } from "../src/types/order.js";

const migrationsDir = path.join(process.cwd(), "migrations");
const dispatchChatId = "-1001234567890";
const managerChatId = "777000000";
const dispatcherTelegramUserId = "444555666";
const headerMessageId = 501;
const cardMessageId = 777;

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    address: "Невесомова 28",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");
  const headerText = createHeaderText(orderId, {
    measureDate: "16 июля",
    photoCount: 3,
    extraLines: ["Расположение: За МКАД"]
  });

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, headerText)
  );

  const updatedOrder = context.orderRepository.getOrderById(orderId);
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.measure_date, "18 июля");
  assert.equal(updatedOrder.measure_time, "с 14 до 16");
  assert.equal(updatedOrder.dispatch_notification_card_message_id, cardMessageId);
  assert.equal(updatedOrder.dispatch_notification_header_message_id, headerMessageId);

  const cardEdits = context.telegram.calls.filter(
    (call) => call.type === "editMessageText" && call.messageId === cardMessageId
  );
  const headerEdits = context.telegram.calls.filter(
    (call) => call.type === "editMessageText" && call.messageId === headerMessageId
  );
  const dispatchMessages = context.telegram.calls.filter(
    (call) => call.type === "sendMessage" && call.chatId === dispatchChatId
  );
  const managerMessages = context.telegram.calls.filter(
    (call) => call.type === "sendMessage" && call.chatId === managerChatId
  );

  assert.equal(cardEdits.length, 1);
  assert.equal(cardEdits[0]?.chatId, dispatchChatId);
  assert.equal(cardEdits[0]?.text, updatedOrder.formatted_card_text);
  assert.equal(dispatchMessages.some((call) => call.text === updatedOrder.formatted_card_text), false);

  assert.equal(headerEdits.length, 1);
  assert.match(headerEdits[0]?.text ?? "", /Дата замера: 18 июля/);
  assert.match(headerEdits[0]?.text ?? "", /Статус: ожидает согласования/);
  assert.match(headerEdits[0]?.text ?? "", /Фотографии: 3/);
  assert.match(headerEdits[0]?.text ?? "", /Расположение: За МКАД/);
  assert.deepEqual(headerEdits[0]?.extra?.reply_markup.inline_keyboard, [
    [
      {
        text: "✅ Согласовано",
        callback_data: `order:confirm:${orderId}`
      },
      {
        text: "📅 Перенесено",
        callback_data: `order:reschedule:${orderId}`
      }
    ]
  ]);

  assert.equal(dispatchMessages.length, 1);
  assert.equal(
    dispatchMessages[0]?.text,
    `📅 Заявка #${orderId} перенесена\nБыло: 16 июля, после 16\nСтало: 18 июля, с 14 до 16\nОжидает согласования.`
  );

  assert.equal(managerMessages.length, 1);
  assert.equal(
    managerMessages[0]?.text,
    `📅 Заявка #${orderId} (Невесомова 28) перенесена.\n\nНовая дата замера: 18 июля, с 14 до 16.\n\nИнформацию о согласовании сообщим дополнительно.`
  );
  assert.equal(managerMessages[0]?.extra, undefined);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: undefined,
    address: "",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", undefined);

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  const dispatchMessages = context.telegram.calls.filter(
    (call) => call.type === "sendMessage" && call.chatId === dispatchChatId
  );
  const managerMessages = context.telegram.calls.filter(
    (call) => call.type === "sendMessage" && call.chatId === managerChatId
  );

  assert.equal(
    dispatchMessages[0]?.text,
    `📅 Заявка #${orderId} перенесена\nБыло: 16 июля\nСтало: 18 июля\nОжидает согласования.`
  );
  assert.doesNotMatch(dispatchMessages[0]?.text ?? "", /undefined|,\n/);
  assert.equal(
    managerMessages[0]?.text,
    `📅 Заявка #${orderId} перенесена.\n\nНовая дата замера: 18 июля.\n\nИнформацию о согласовании сообщим дополнительно.`
  );
  assert.doesNotMatch(managerMessages[0]?.text ?? "", /undefined|,\.|,\n/);
});

assert.equal(
  formatDispatchRescheduleServiceMessage({
    status: "success",
    orderId: 4,
    previousMeasureDate: "16 июля",
    previousMeasureTime: "после 16",
    newMeasureDate: "18 июля"
  }),
  "📅 Заявка #4 перенесена\nБыло: 16 июля, после 16\nСтало: 18 июля\nОжидает согласования."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_rescheduled",
    orderId: 4,
    address: "Невесомова 28",
    newMeasureDate: "18 июля"
  }),
  "📅 Заявка #4 (Невесомова 28) перенесена.\n\nНовая дата замера: 18 июля.\n\nИнформацию о согласовании сообщим дополнительно."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_rescheduled",
    orderId: 4,
    newMeasureDate: "18 июля"
  }),
  "📅 Заявка #4 перенесена.\n\nНовая дата замера: 18 июля.\n\nИнформацию о согласовании сообщим дополнительно."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_rescheduled",
    orderId: 4,
    address: "   ",
    newMeasureDate: "18 июля"
  }),
  "📅 Заявка #4 перенесена.\n\nНовая дата замера: 18 июля.\n\nИнформацию о согласовании сообщим дополнительно."
);

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "дата в БД",
    measureTime: "время в БД",
    telegramUserId: managerChatId
  });
  const result: SuccessfulRescheduleOrderResult = {
    status: "success",
    orderId,
    previousMeasureDate: "result previous date",
    previousMeasureTime: "result previous time",
    newMeasureDate: "result new date",
    newMeasureTime: "result new time"
  };

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  const dispatchMessage = context.telegram.calls.find(
    (call) => call.type === "sendMessage" && call.chatId === dispatchChatId
  );
  const managerMessage = context.telegram.calls.find(
    (call) => call.type === "sendMessage" && call.chatId === managerChatId
  );

  assert.match(dispatchMessage?.text ?? "", /Было: result previous date, result previous time/);
  assert.match(dispatchMessage?.text ?? "", /Стало: result new date, result new time/);
  assert.match(managerMessage?.text ?? "", /Новая дата замера: result new date, result new time/);
  assert.doesNotMatch(dispatchMessage?.text ?? "", /дата в БД|время в БД/);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");
  context.telegram.failEditMessageText = (_chatId, messageId) =>
    messageId === cardMessageId ? new Error("Bad Request: message to edit not found") : undefined;

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  assertReschedulePersisted(context, orderId, "18 июля", "с 14 до 16", 1);
  assert.equal(context.orderRepository.getOrderById(orderId)?.dispatch_notification_card_message_id, cardMessageId);
  assert.equal(editCalls(context, cardMessageId).length, 1);
  assert.equal(editCalls(context, headerMessageId).length, 1);
  assert.equal(dispatchServiceMessages(context).length, 1);
  assert.equal(managerMessages(context).length, 1);
  assert.equal(fullCardDispatchMessages(context, orderId).length, 0);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");
  context.telegram.failEditMessageText = (_chatId, messageId) =>
    messageId === headerMessageId ? new Error("Bad Request: message to edit not found") : undefined;

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  assertReschedulePersisted(context, orderId, "18 июля", "с 14 до 16", 1);
  assert.equal(editCalls(context, cardMessageId).length, 1);
  assert.equal(editCalls(context, headerMessageId).length, 1);
  assert.equal(dispatchServiceMessages(context).length, 1);
  assert.equal(managerMessages(context).length, 1);
  assert.equal(fullCardDispatchMessages(context, orderId).length, 0);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");
  context.telegram.failSendMessage = (chatId) =>
    chatId === dispatchChatId ? new Error("Bad Request: chat not found") : undefined;

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  assertReschedulePersisted(context, orderId, "18 июля", "с 14 до 16", 1);
  assert.equal(editCalls(context, cardMessageId).length, 1);
  assert.equal(editCalls(context, headerMessageId).length, 1);
  assert.equal(dispatchServiceMessages(context).length, 1);
  assert.equal(managerMessages(context).length, 1);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");
  context.telegram.failSendMessage = (chatId) =>
    chatId === managerChatId ? new Error("Forbidden: bot was blocked by the user") : undefined;

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  assertReschedulePersisted(context, orderId, "18 июля", "с 14 до 16", 1);
  assert.equal(editCalls(context, cardMessageId).length, 1);
  assert.equal(editCalls(context, headerMessageId).length, 1);
  assert.equal(dispatchServiceMessages(context).length, 1);
  assert.equal(managerMessages(context).length, 1);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrderWithMissingCardMessageId(context.orderRepository, {
    telegramUserId: managerChatId
  });
  const result = rescheduleOrder(context.workflowService, orderId, "18 июля", undefined);

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(result, createHeaderText(orderId))
  );

  assert.equal(context.orderRepository.getOrderById(orderId)?.dispatch_notification_card_message_id, undefined);
  assert.equal(editCalls(context, cardMessageId).length, 0);
  assert.equal(editCalls(context, headerMessageId).length, 1);
  assert.equal(dispatchServiceMessages(context).length, 1);
  assert.equal(managerMessages(context).length, 1);
  assert.equal(fullCardDispatchMessages(context, orderId).length, 0);
});

await withSideEffectsContext(async (context) => {
  const orderId = insertAwaitingOrder(context.orderRepository, {
    measureDate: "16 июля",
    measureTime: "после 16",
    telegramUserId: managerChatId
  });
  const firstResult = rescheduleOrder(context.workflowService, orderId, "18 июля", "с 14 до 16");

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(firstResult, createHeaderText(orderId))
  );

  const firstHeaderText = editCalls(context, headerMessageId)[0]?.text;
  assert.ok(firstHeaderText);

  const secondResult = rescheduleOrder(context.workflowService, orderId, "20 июля", "после 17");

  await handleOrderRescheduleCommitted(
    context.sideEffectsParams,
    createCommittedEvent(secondResult, firstHeaderText)
  );

  const updatedOrder = context.orderRepository.getOrderById(orderId);
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.measure_date, "20 июля");
  assert.equal(updatedOrder.measure_time, "после 17");
  assert.equal(updatedOrder.status, "awaiting_coordination");
  assert.equal(updatedOrder.dispatch_notification_card_message_id, cardMessageId);
  assert.equal(updatedOrder.dispatch_notification_header_message_id, headerMessageId);
  assert.equal(rescheduledHistory(context, orderId).length, 2);
  assert.equal(editCalls(context, cardMessageId).length, 2);
  assert.equal(editCalls(context, headerMessageId).length, 2);
  assert.equal(dispatchServiceMessages(context).length, 2);
  assert.equal(managerMessages(context).length, 2);
  assert.equal(fullCardDispatchMessages(context, orderId).length, 0);
  assert.match(dispatchServiceMessages(context)[1]?.text ?? "", /Было: 18 июля, с 14 до 16/);
  assert.match(dispatchServiceMessages(context)[1]?.text ?? "", /Стало: 20 июля, после 17/);
});

interface SideEffectsContext {
  db: Database.Database;
  orderRepository: OrderRepository;
  historyRepository: OrderStatusHistoryRepository;
  workflowService: OrderWorkflowService;
  telegram: FakeTelegram;
  sideEffectsParams: CreateOrderRescheduleSideEffectsParams;
}

// Создаёт временную SQLite-базу и реальные post-commit Telegram adapters поверх fake bot.
async function withSideEffectsContext(
  run: (context: SideEffectsContext) => Promise<void>
): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zamerflow-order-reschedule-effects-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  db.pragma("foreign_keys = ON");

  try {
    runMigrations(db, migrationsDir);

    const orderRepository = createOrderRepository(db);
    const historyRepository = createOrderStatusHistoryRepository(db);
    const workflowService = createOrderWorkflowService({
      db,
      orderRepository,
      orderStatusHistoryRepository: historyRepository
    });
    const telegram = createFakeTelegram();
    const sideEffectsParams: CreateOrderRescheduleSideEffectsParams = {
      orderRepository,
      managerNotificationService: createTelegramManagerNotificationService(telegram.bot),
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot),
      workflowDispatchService: createTelegramWorkflowDispatchService(telegram.bot)
    };

    await run({
      db,
      orderRepository,
      historyRepository,
      workflowService,
      telegram,
      sideEffectsParams
    });
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Создаёт заявку в awaiting_coordination с сохранёнными dispatch ids header/card.
function insertAwaitingOrder(
  orderRepository: OrderRepository,
  overrides: Partial<SubmittedOrder> = {}
): number {
  const orderId = orderRepository.create(createSubmittedOrder(overrides));

  orderRepository.markDispatchNotificationSent({
    orderId,
    chatId: dispatchChatId,
    headerMessageId,
    cardMessageId,
    sentAt: "2026-10-10T10:00:00.000Z"
  });

  return orderId;
}

// Создаёт заявку с dispatch chat/header, но без сохранённого id чистой карточки.
function insertAwaitingOrderWithMissingCardMessageId(
  orderRepository: OrderRepository,
  overrides: Partial<SubmittedOrder> = {}
): number {
  const orderId = orderRepository.create(createSubmittedOrder(overrides));

  orderRepository.markDispatchNotificationFailed({
    orderId,
    chatId: dispatchChatId,
    headerMessageId,
    error: "TEST_CARD_MESSAGE_ID_MISSING",
    attemptedAt: "2026-10-10T10:00:00.000Z"
  });

  return orderId;
}

// Создаёт валидную заявку для workflow side-effect тестов.
function createSubmittedOrder(overrides: Partial<SubmittedOrder> = {}): SubmittedOrder {
  const measureDate = overrides.measureDate ?? "16 июля";
  const measureTime = overrides.measureTime;

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
    measureDate,
    measureTime,
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
    formattedCardText: `*На ${measureDate}*${measureTime ? ` ${measureTime} ❗` : ""}\nТестовая карточка`,
    hasPhotos: false,
    telegramUserId: managerChatId,
    ...overrides
  };
}

// Выполняет business reschedule и возвращает только successful result.
function rescheduleOrder(
  workflowService: OrderWorkflowService,
  orderId: number,
  newMeasureDate: string,
  newMeasureTime: string | undefined
): SuccessfulRescheduleOrderResult {
  const result: RescheduleOrderResult = workflowService.rescheduleOrder({
    orderId,
    newMeasureDate,
    newMeasureTime,
    actor: {
      source: "telegram",
      externalId: dispatcherTelegramUserId
    }
  });

  assert.equal(result.status, "success");
  return result as SuccessfulRescheduleOrderResult;
}

// Собирает event, который Telegram adapter передаёт после successful commit.
function createCommittedEvent(
  result: SuccessfulRescheduleOrderResult,
  dispatchHeaderCurrentText?: string
): RescheduleCommittedEvent {
  return {
    result,
    actor: {
      source: "telegram",
      externalId: dispatcherTelegramUserId
    },
    dispatchChatId,
    dispatchHeaderMessageId: headerMessageId,
    dispatchHeaderCurrentText
  };
}

// Формирует исходный dispatch-header с дополнительными строками, которые update должен сохранить.
function createHeaderText(
  orderId: number,
  params: {
    measureDate?: string;
    photoCount?: number;
    extraLines?: string[];
  } = {}
): string {
  return [
    "О Повелитель, поступила новая заявка!",
    "",
    `🆕 Заявка #${orderId}`,
    "",
    "Салон: Тестовый салон",
    "Менеджер: Олег",
    `Дата замера: ${params.measureDate ?? "16 июля"}`,
    "Статус: ожидает согласования",
    `Фотографии: ${params.photoCount !== undefined ? params.photoCount : "нет"}`,
    ...(params.extraLines ?? [])
  ].join("\n");
}

// Проверяет, что DB transition и history уже сохранены и не откатились из-за side effect failure.
function assertReschedulePersisted(
  context: SideEffectsContext,
  orderId: number,
  expectedDate: string,
  expectedTime: string | undefined,
  expectedHistoryCount: number
): void {
  const order = context.orderRepository.getOrderById(orderId);

  assert.ok(order);
  assert.equal(order.status, "awaiting_coordination");
  assert.equal(order.measure_date, expectedDate);
  assert.equal(order.measure_time, expectedTime);
  assert.equal(rescheduledHistory(context, orderId).length, expectedHistoryCount);
}

// Возвращает history events переноса для конкретной заявки.
function rescheduledHistory(context: SideEffectsContext, orderId: number) {
  return context.historyRepository
    .listByOrderId(orderId)
    .filter((event) => event.event_type === "rescheduled");
}

// Возвращает editMessageText-вызовы по message id.
function editCalls(context: SideEffectsContext, messageId: number) {
  return context.telegram.calls.filter(
    (call): call is Extract<TelegramCall, { type: "editMessageText" }> =>
      call.type === "editMessageText" && call.messageId === messageId
  );
}

// Возвращает короткие служебные сообщения о переносе в dispatch-чате.
function dispatchServiceMessages(context: SideEffectsContext) {
  return context.telegram.calls.filter(
    (call): call is Extract<TelegramCall, { type: "sendMessage" }> =>
      call.type === "sendMessage" && call.chatId === dispatchChatId
  );
}

// Возвращает уведомления менеджеру.
function managerMessages(context: SideEffectsContext) {
  return context.telegram.calls.filter(
    (call): call is Extract<TelegramCall, { type: "sendMessage" }> =>
      call.type === "sendMessage" && call.chatId === managerChatId
  );
}

// Проверяет, что новая полная карточка не ушла sendMessage-ом в dispatch-чат.
function fullCardDispatchMessages(context: SideEffectsContext, orderId: number) {
  const formattedCardText = context.orderRepository.getOrderById(orderId)?.formatted_card_text;

  return dispatchServiceMessages(context).filter((call) => call.text === formattedCardText);
}

type TelegramCall =
  | {
      type: "sendMessage";
      chatId: string;
      text: string;
      extra?: unknown;
    }
  | {
      type: "editMessageText";
      chatId: string;
      messageId: number;
      text: string;
      extra?: {
        reply_markup: {
          inline_keyboard: unknown[][];
        };
      };
    };

interface FakeTelegram {
  bot: Telegraf<Context>;
  calls: TelegramCall[];
  failSendMessage?: (chatId: string, text: string) => Error | undefined;
  failEditMessageText?: (chatId: string, messageId: number, text: string) => Error | undefined;
}

// Создаёт fake Telegraf, который пишет все Telegram side effects в память.
function createFakeTelegram(): FakeTelegram {
  const fake = {
    calls: []
  } as FakeTelegram;

  fake.bot = {
    telegram: {
      async sendMessage(chatId: string, text: string, extra?: unknown) {
        fake.calls.push({
          type: "sendMessage",
          chatId,
          text,
          extra
        });

        const error = fake.failSendMessage?.(chatId, text);
        if (error) {
          throw error;
        }

        return {
          message_id: nextMessageId(fake)
        };
      },
      async editMessageText(
        chatId: string,
        messageId: number,
        _inlineMessageId: string | undefined,
        text: string,
        extra?: {
          reply_markup: {
            inline_keyboard: unknown[][];
          };
        }
      ) {
        fake.calls.push({
          type: "editMessageText",
          chatId,
          messageId,
          text,
          extra
        });

        const error = fake.failEditMessageText?.(chatId, messageId, text);
        if (error) {
          throw error;
        }

        return true;
      }
    }
  } as unknown as Telegraf<Context>;

  return fake;
}

// Выдаёт стабильные message_id для новых служебных сообщений.
function nextMessageId(fake: FakeTelegram): number {
  const sentMessages = fake.calls.filter((call) => call.type === "sendMessage").length;

  return 900 + sentMessages;
}
