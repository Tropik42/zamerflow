// Файл проверяет callback "Согласовано" в dispatch-чате и побочные Telegram-уведомления.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Context, Telegraf } from "telegraf";
import { handleOrderConfirmCallback } from "../src/bot/orderWorkflowHandlers.js";
import { parseOrderConfirmCallbackData } from "../src/bot/orderWorkflowCallbackGuard.js";
import {
  createTelegramManagerNotificationService,
  formatManagerWorkflowNotification
} from "../src/bot/telegramManagerNotificationService.js";
import {
  createTelegramWorkflowHeaderService,
  type WorkflowHeaderUpdateService
} from "../src/bot/telegramWorkflowHeaderService.js";
import { runMigrations } from "../src/db/migrations.js";
import { createOrderRepository, type OrderRepository } from "../src/db/orderRepository.js";
import {
  createOrderStatusHistoryRepository,
  type OrderStatusHistoryRepository
} from "../src/db/orderStatusHistoryRepository.js";
import type { ManagerNotificationService } from "../src/services/managerNotificationService.js";
import {
  createOrderWorkflowService,
  type ConfirmOrderParams,
  type OrderWorkflowService
} from "../src/services/orderWorkflowService.js";
import type { SubmittedOrder } from "../src/types/order.js";

const migrationsDir = path.join(process.cwd(), "migrations");
const dispatchChatId = "-1001234567890";
const headerMessageId = 501;
const cardMessageId = 777;

assert.deepEqual(parseOrderConfirmCallbackData("order:confirm:42"), {
  status: "ok",
  orderId: 42
});

for (const callbackData of [
  "order:confirm:0",
  "order:confirm:-1",
  "order:confirm:42.5",
  "order:confirm:abc",
  `order:confirm:${Number.MAX_SAFE_INTEGER + 1}`,
  "order:reschedule:42",
  "order:confirm:"
]) {
  assert.deepEqual(parseOrderConfirmCallbackData(callbackData), {
    status: "invalid"
  });
}

await withConfirmContext(async ({ orderRepository, telegram, managerNotificationService }) => {
  const workflowService = createCountingWorkflowService();

  await handleOrderConfirmCallback(
    createCallbackContext({
      data: "order:confirm:abc"
    }),
    {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot),
      dispatchChatId
    }
  );

  assert.equal(workflowService.confirmCalls.length, 0);
  assert.equal(telegram.calls.length, 0);
});

await withConfirmContext(async ({ orderRepository, telegram, managerNotificationService }) => {
  const orderId = insertAwaitingOrder(orderRepository);
  const workflowService = createCountingWorkflowService();

  await handleOrderConfirmCallback(
    createCallbackContext({
      data: `order:confirm:${orderId}`,
      chatId: "-1000000000000"
    }),
    {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot),
      dispatchChatId
    }
  );

  assert.equal(workflowService.confirmCalls.length, 0);
  assert.equal(orderRepository.getOrderById(orderId)?.status, "awaiting_coordination");
  assert.equal(telegram.calls.length, 0);
});

await withConfirmContext(async ({ orderRepository, telegram, managerNotificationService }) => {
  const orderId = insertAwaitingOrder(orderRepository, {
    dispatchChatId: "-1000000000000"
  });
  const workflowService = createCountingWorkflowService();

  await handleOrderConfirmCallback(
    createCallbackContext({
      data: `order:confirm:${orderId}`
    }),
    {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot),
      dispatchChatId
    }
  );

  assert.equal(workflowService.confirmCalls.length, 0);
  assert.equal(orderRepository.getOrderById(orderId)?.status, "awaiting_coordination");
  assert.equal(telegram.calls.length, 0);
});

await withConfirmContext(async ({ orderRepository, telegram, managerNotificationService }) => {
  const orderId = insertAwaitingOrder(orderRepository, {
    headerMessageId: 999
  });
  const workflowService = createCountingWorkflowService();

  await handleOrderConfirmCallback(
    createCallbackContext({
      data: `order:confirm:${orderId}`
    }),
    {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot),
      dispatchChatId
    }
  );

  assert.equal(workflowService.confirmCalls.length, 0);
  assert.equal(orderRepository.getOrderById(orderId)?.status, "awaiting_coordination");
  assert.equal(telegram.calls.length, 0);
});

await withConfirmContext(
  async ({
    orderRepository,
    historyRepository,
    workflowService,
    telegram,
    managerNotificationService,
    workflowHeaderUpdateService
  }) => {
    const orderId = insertAwaitingOrder(orderRepository, {
      measureDate: "18 июля",
      measureTime: "с 14 до 16",
      address: "Пушкина 3",
      telegramUserId: "777000000"
    });

    await handleOrderConfirmCallback(
      createCallbackContext({
        data: `order:confirm:${orderId}`,
        fromId: 444555666,
        text: createHeaderText(orderId, 3)
      }),
      {
        orderRepository,
        orderWorkflowService: workflowService,
        managerNotificationService,
        workflowHeaderUpdateService,
        dispatchChatId
      }
    );

    assert.equal(orderRepository.getOrderById(orderId)?.status, "confirmed");

    const confirmedHistory = historyRepository
      .listByOrderId(orderId)
      .filter((event) => event.event_type === "confirmed");

    assert.equal(confirmedHistory.length, 1);
    assert.equal(confirmedHistory[0]?.from_status_code, "awaiting_coordination");
    assert.equal(confirmedHistory[0]?.to_status_code, "confirmed");
    assert.equal(confirmedHistory[0]?.actor_source, "telegram");
    assert.equal(confirmedHistory[0]?.actor_external_id, "444555666");

    const managerMessages = telegram.calls.filter((call) => call.type === "sendMessage");
    const headerEdits = telegram.calls.filter((call) => call.type === "editMessageText");

    assert.equal(managerMessages.length, 1);
    assert.equal(managerMessages[0]?.chatId, "777000000");
    assert.equal(
      managerMessages[0]?.text,
      "✅ Заявка #1 (Пушкина 3) согласована.\n\nЗамер согласован на 18 июля, с 14 до 16."
    );
    assert.equal(managerMessages[0]?.extra, undefined);

    assert.equal(headerEdits.length, 1);
    assert.equal(headerEdits[0]?.chatId, dispatchChatId);
    assert.equal(headerEdits[0]?.messageId, headerMessageId);
    assert.match(headerEdits[0]?.text ?? "", /Статус: согласовано/);
    assert.doesNotMatch(headerEdits[0]?.text ?? "", /Статус: ожидает согласования/);
    assert.match(headerEdits[0]?.text ?? "", /Фотографии: 3/);
    assert.deepEqual(headerEdits[0]?.extra?.reply_markup.inline_keyboard, []);
  }
);

assert.equal(
  formatManagerWorkflowNotification({
    type: "order_confirmed",
    orderId: 42,
    address: "Пушкина 3",
    measureDate: "18 июля"
  }),
  "✅ Заявка #42 (Пушкина 3) согласована.\n\nЗамер согласован на 18 июля."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_confirmed",
    orderId: 42,
    measureDate: "18 июля"
  }),
  "✅ Заявка #42 согласована.\n\nЗамер согласован на 18 июля."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_confirmed",
    orderId: 42,
    address: "   ",
    measureDate: "18 июля"
  }),
  "✅ Заявка #42 согласована.\n\nЗамер согласован на 18 июля."
);
assert.equal(
  formatManagerWorkflowNotification({
    type: "order_rescheduled",
    orderId: 42,
    newMeasureDate: "19 июля",
    newMeasureTime: "после 16:00"
  }),
  "📅 Заявка #42 перенесена.\n\nНовая дата замера: 19 июля, после 16:00.\n\nИнформацию о согласовании сообщим дополнительно."
);

await withConfirmContext(
  async ({
    orderRepository,
    historyRepository,
    workflowService,
    telegram,
    managerNotificationService,
    workflowHeaderUpdateService
  }) => {
    const orderId = insertAwaitingOrder(orderRepository, {
      measureDate: "18 июля",
      measureTime: "с 14 до 16",
      telegramUserId: "777000000"
    });
    const callbackContext = createCallbackContext({
      data: `order:confirm:${orderId}`,
      fromId: 444555666
    });

    await handleOrderConfirmCallback(callbackContext, {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService,
      dispatchChatId
    });
    await handleOrderConfirmCallback(callbackContext, {
      orderRepository,
      orderWorkflowService: workflowService,
      managerNotificationService,
      workflowHeaderUpdateService,
      dispatchChatId
    });

    const confirmedHistory = historyRepository
      .listByOrderId(orderId)
      .filter((event) => event.event_type === "confirmed");
    const managerMessages = telegram.calls.filter((call) => call.type === "sendMessage");
    const headerEdits = telegram.calls.filter((call) => call.type === "editMessageText");

    assert.equal(orderRepository.getOrderById(orderId)?.status, "confirmed");
    assert.equal(confirmedHistory.length, 1);
    assert.equal(managerMessages.length, 1);
    assert.equal(headerEdits.length, 1);
  }
);

await withConfirmContext(
  async ({
    orderRepository,
    historyRepository,
    workflowService,
    telegram,
    workflowHeaderUpdateService
  }) => {
    const orderId = insertAwaitingOrder(orderRepository, {
      telegramUserId: "777000000"
    });
    telegram.failSendMessage = new Error("Forbidden: bot was blocked by the user");

    await handleOrderConfirmCallback(
      createCallbackContext({
        data: `order:confirm:${orderId}`
      }),
      {
        orderRepository,
        orderWorkflowService: workflowService,
        managerNotificationService: createTelegramManagerNotificationService(telegram.bot),
        workflowHeaderUpdateService,
        dispatchChatId
      }
    );

    const confirmedHistory = historyRepository
      .listByOrderId(orderId)
      .filter((event) => event.event_type === "confirmed");
    const headerEdits = telegram.calls.filter((call) => call.type === "editMessageText");

    assert.equal(orderRepository.getOrderById(orderId)?.status, "confirmed");
    assert.equal(confirmedHistory.length, 1);
    assert.equal(headerEdits.length, 1);
  }
);

await withConfirmContext(
  async ({
    orderRepository,
    historyRepository,
    workflowService,
    telegram,
    managerNotificationService,
    workflowHeaderUpdateService
  }) => {
    const orderId = insertAwaitingOrder(orderRepository, {
      telegramUserId: "777000000"
    });
    telegram.failEditMessageText = new Error("Bad Request: message to edit not found");

    await handleOrderConfirmCallback(
      createCallbackContext({
        data: `order:confirm:${orderId}`
      }),
      {
        orderRepository,
        orderWorkflowService: workflowService,
        managerNotificationService,
        workflowHeaderUpdateService,
        dispatchChatId
      }
    );

    const confirmedHistory = historyRepository
      .listByOrderId(orderId)
      .filter((event) => event.event_type === "confirmed");
    const managerMessages = telegram.calls.filter((call) => call.type === "sendMessage");
    const headerEdits = telegram.calls.filter((call) => call.type === "editMessageText");
    const dispatchMessages = managerMessages.filter((call) => call.chatId === dispatchChatId);

    assert.equal(orderRepository.getOrderById(orderId)?.status, "confirmed");
    assert.equal(confirmedHistory.length, 1);
    assert.equal(managerMessages.length, 1);
    assert.equal(headerEdits.length, 1);
    assert.equal(dispatchMessages.length, 0);
  }
);

interface ConfirmContext {
  db: Database.Database;
  orderRepository: OrderRepository;
  historyRepository: OrderStatusHistoryRepository;
  workflowService: OrderWorkflowService;
  telegram: FakeTelegram;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
}

// Создаёт временный контекст подтверждения заявки с SQLite, workflow-сервисом и fake Telegram.
async function withConfirmContext(run: (context: ConfirmContext) => Promise<void>): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zamerflow-order-confirm-"));
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

    await run({
      db,
      orderRepository,
      historyRepository,
      workflowService,
      telegram,
      managerNotificationService: createTelegramManagerNotificationService(telegram.bot),
      workflowHeaderUpdateService: createTelegramWorkflowHeaderService(telegram.bot)
    });
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Создаёт заявку в статусе awaiting_coordination и помечает dispatch-заголовок отправленным.
function insertAwaitingOrder(
  orderRepository: OrderRepository,
  overrides: Partial<SubmittedOrder> & {
    dispatchChatId?: string;
    headerMessageId?: number;
  } = {}
): number {
  const orderId = orderRepository.create(createSubmittedOrder(overrides));

  orderRepository.markDispatchNotificationSent({
    orderId,
    chatId: overrides.dispatchChatId ?? dispatchChatId,
    headerMessageId: overrides.headerMessageId ?? headerMessageId,
    cardMessageId,
    sentAt: "2026-10-10T10:00:00.000Z"
  });

  return orderId;
}

// Создаёт валидную заявку для тестов callback подтверждения.
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
    measureDate: "18 июля",
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
    formattedCardText: "*На 18 июля*\nТестовая карточка",
    hasPhotos: false,
    telegramUserId: "777000000",
    ...overrides
  };
}

// Собирает минимальный Telegraf Context для inline callback query.
function createCallbackContext(params: {
  data: string;
  chatId?: string;
  messageId?: number;
  text?: string;
  fromId?: number;
}): Context {
  const fromId = params.fromId ?? 444555666;

  return {
    from: {
      id: fromId,
      is_bot: false,
      first_name: "Dispatcher"
    },
    callbackQuery: {
      id: "callback-query-id",
      from: {
        id: fromId,
        is_bot: false,
        first_name: "Dispatcher"
      },
      chat_instance: "chat-instance",
      data: params.data,
      message: {
        message_id: params.messageId ?? headerMessageId,
        date: 0,
        chat: {
          id: params.chatId ?? dispatchChatId,
          type: "supergroup",
          title: "Dispatch"
        },
        text: params.text ?? createHeaderText(1, 0)
      }
    },
    async answerCbQuery() {
      return true;
    }
  } as unknown as Context;
}

// Формирует текст dispatch-заголовка, который затем должен быть обновлён.
function createHeaderText(orderId: number, photoCount: number): string {
  return [
    "О Повелитель, поступила новая заявка!",
    "",
    `🆕 Заявка #${orderId}`,
    "",
    "Салон: Тестовый салон",
    "Менеджер: Олег",
    "Дата замера: 18 июля",
    "Статус: ожидает согласования",
    `Фотографии: ${photoCount > 0 ? photoCount : "нет"}`
  ].join("\n");
}

interface CountingWorkflowService extends OrderWorkflowService {
  confirmCalls: ConfirmOrderParams[];
}

// Создаёт workflow-сервис-счётчик для проверки, что guard не пропускает плохие callback-и.
function createCountingWorkflowService(): CountingWorkflowService {
  const confirmCalls: ConfirmOrderParams[] = [];

  return {
    confirmCalls,
    confirmOrder(params) {
      confirmCalls.push(params);
      return {
        status: "success",
        orderId: params.orderId
      };
    },
    rescheduleOrder(params) {
      return {
        status: "order_not_found",
        orderId: params.orderId
      };
    }
  };
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
  failSendMessage?: Error;
  failEditMessageText?: Error;
}

// Создаёт fake Telegraf, который записывает отправки менеджеру и редактирование заголовка.
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

        if (fake.failSendMessage) {
          throw fake.failSendMessage;
        }

        return {
          message_id: 900
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

        if (fake.failEditMessageText) {
          throw fake.failEditMessageText;
        }

        return true;
      }
    }
  } as unknown as Telegraf<Context>;

  return fake;
}
