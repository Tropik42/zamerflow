// Файл проверяет Telegram reschedule-session: старт, reply-flow, отмену и вызов workflow-сервиса.

import assert from "node:assert/strict";
import type { Context } from "telegraf";
import {
  handleOrderRescheduleCancelCallback,
  handleOrderRescheduleStartCallback,
  handleOrderRescheduleTextMessage,
  type HandleOrderRescheduleParams
} from "../src/bot/orderWorkflowHandlers.js";
import {
  parseOrderRescheduleCallbackData,
  parseOrderRescheduleCancelCallbackData
} from "../src/bot/orderWorkflowCallbackGuard.js";
import {
  createRescheduleSessionKey,
  createRescheduleSessionStore,
  type RescheduleSessionStore
} from "../src/bot/rescheduleSessionStore.js";
import type { OrderRepository } from "../src/db/orderRepository.js";
import type {
  ConfirmOrderResult,
  OrderWorkflowService,
  RescheduleOrderParams,
  RescheduleOrderResult
} from "../src/services/orderWorkflowService.js";
import type {
  OrderItemRecord,
  OrderRecord,
  SubmittedOrder
} from "../src/types/order.js";

const dispatchChatId = "-1001234567890";
const otherDispatchChatId = "-1000000000000";
const dispatcherTelegramUserId = 444555666;
const headerMessageId = 501;
const cardMessageId = 777;

type SuccessfulRescheduleResult = Extract<RescheduleOrderResult, { status: "success" }>;

assert.deepEqual(parseOrderRescheduleCallbackData("order:reschedule:42"), {
  status: "ok",
  orderId: 42
});
assert.deepEqual(parseOrderRescheduleCancelCallbackData("order:reschedule:cancel:42"), {
  status: "ok",
  orderId: 42
});

for (const callbackData of [
  "order:reschedule:0",
  "order:reschedule:-1",
  "order:reschedule:42.5",
  "order:reschedule:abc",
  `order:reschedule:${Number.MAX_SAFE_INTEGER + 1}`,
  "order:confirm:42",
  "order:reschedule:cancel:42"
]) {
  assert.deepEqual(parseOrderRescheduleCallbackData(callbackData), {
    status: "invalid"
  });
}

for (const callbackData of [
  "order:reschedule:cancel:0",
  "order:reschedule:cancel:-1",
  "order:reschedule:cancel:42.5",
  "order:reschedule:cancel:abc",
  `order:reschedule:cancel:${Number.MAX_SAFE_INTEGER + 1}`,
  "order:reschedule:42",
  "order:confirm:42"
]) {
  assert.deepEqual(parseOrderRescheduleCancelCallbackData(callbackData), {
    status: "invalid"
  });
}

await withRescheduleContext(async (context) => {
  await handleOrderRescheduleStartCallback(
    createCallbackContext({
      data: "order:reschedule:42"
    }),
    context.params()
  );

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({ orderId: 42 }));

  await handleOrderRescheduleStartCallback(
    createCallbackContext({
      data: "order:reschedule:42",
      chatId: otherDispatchChatId
    }),
    context.params()
  );

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    dispatchNotificationChatId: otherDispatchChatId
  }));

  await handleOrderRescheduleStartCallback(
    createCallbackContext({
      data: "order:reschedule:42"
    }),
    context.params()
  );

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    dispatchNotificationHeaderMessageId: 999
  }));

  await handleOrderRescheduleStartCallback(
    createCallbackContext({
      data: "order:reschedule:42"
    }),
    context.params()
  );

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    status: "confirmed"
  }));
  const ctx = createCallbackContext({
    data: "order:reschedule:42"
  });

  await handleOrderRescheduleStartCallback(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(ctx.replies[0]?.text, "Перенос заявки #42 сейчас недоступен.");
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({ orderId: 42 }));
  const ctx = createCallbackContext({
    data: "order:reschedule:42"
  });

  await handleOrderRescheduleStartCallback(ctx, context.params());

  const session = getSession(context.store);

  assert.ok(session);
  assert.equal(createRescheduleSessionKey(session), `${dispatchChatId}:${dispatcherTelegramUserId}`);
  assert.equal(session.orderId, 42);
  assert.equal(session.step, "date");
  assert.equal(session.isSubmitting, false);
  assert.ok(session.startedAt);
  assert.equal(ctx.replies.length, 1);
  assert.equal(ctx.replies[0]?.text, "Введите новую дату замера для заявки #42.");
  assert.equal(session.expectedReplyToMessageId, ctx.replies[0]?.messageId);
});

await withRescheduleContext(async (context) => {
  context.orders.set(42, createOrderRecord({ orderId: 42 }));
  context.orders.set(43, createOrderRecord({
    orderId: 43,
    dispatchNotificationHeaderMessageId: headerMessageId + 1
  }));
  await handleOrderRescheduleStartCallback(
    createCallbackContext({
      data: "order:reschedule:42"
    }),
    context.params()
  );

  const duplicateCtx = createCallbackContext({
    data: "order:reschedule:43",
    messageId: headerMessageId + 1
  });

  await handleOrderRescheduleStartCallback(duplicateCtx, context.params());

  const session = getSession(context.store);

  assert.equal(session?.orderId, 42);
  assert.equal(duplicateCtx.replies[0]?.text, "Перенос заявки #42 уже начат. Введите новую дату или отмените перенос.");
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withStartedSession(async (context, promptMessageId) => {
  const consumed = await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "18.10.2026"
    }),
    context.params()
  );

  assert.equal(consumed, false);
  assert.equal(getSession(context.store)?.newMeasureDate, undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(promptMessageId, getSession(context.store)?.expectedReplyToMessageId);
});

await withStartedSession(async (context) => {
  const consumed = await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "18.10.2026",
      replyToMessageId: 123
    }),
    context.params()
  );

  assert.equal(consumed, false);
  assert.equal(getSession(context.store)?.newMeasureDate, undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withStartedSession(async (context, promptMessageId) => {
  const ctx = createTextContext({
    text: "31.02.2026",
    replyToMessageId: promptMessageId
  });

  const consumed = await handleOrderRescheduleTextMessage(ctx, context.params());
  const session = getSession(context.store);

  assert.equal(consumed, true);
  assert.ok(session);
  assert.equal(session.step, "date");
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(ctx.replies.length, 1);
  assert.match(ctx.replies[0]?.text ?? "", /Дата некорректна/);
  assert.notEqual(session.expectedReplyToMessageId, promptMessageId);
  assert.equal(session.expectedReplyToMessageId, ctx.replies[0]?.messageId);
});

await withStartedSession(async (context, promptMessageId) => {
  context.orders.delete(42);
  const ctx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(ctx.replies[0]?.text, "Перенос заявки #42 больше нельзя выполнить.");
});

await withStartedSession(async (context, promptMessageId) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    status: "confirmed"
  }));
  const ctx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(ctx.replies[0]?.text, "Перенос заявки #42 больше нельзя выполнить.");
});

await withStartedSession(async (context, promptMessageId) => {
  const ctx = createTextContext({
    text: "18.10.2026",
    replyToMessageId: promptMessageId
  });

  const consumed = await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(consumed, true);
  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 1);
  assert.deepEqual(context.workflowService.rescheduleCalls[0], {
    orderId: 42,
    newMeasureDate: "18 октября",
    newMeasureTime: undefined,
    actor: {
      source: "telegram",
      externalId: String(dispatcherTelegramUserId)
    }
  });
  assert.equal(context.hookResults.length, 1);
});

await withStartedSession(async (context, promptMessageId) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    measureTime: "утром"
  }));
  const dateCtx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  const consumed = await handleOrderRescheduleTextMessage(dateCtx, context.params());
  const session = getSession(context.store);

  assert.equal(consumed, true);
  assert.ok(session);
  assert.equal(session.step, "time");
  assert.equal(session.newMeasureDate, "18 октября");
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(dateCtx.replies[0]?.text, "Введите новое время замера для заявки #42.");
  assert.equal(session.expectedReplyToMessageId, dateCtx.replies[0]?.messageId);
});

await withStartedSession(async (context, promptMessageId) => {
  context.orders.set(42, createOrderRecord({
    orderId: 42,
    measureTime: "утром"
  }));
  const dateCtx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(dateCtx, context.params());

  const timePromptMessageId = getSession(context.store)?.expectedReplyToMessageId;
  assert.ok(timePromptMessageId);

  await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "после 16:00",
      replyToMessageId: timePromptMessageId
    }),
    context.params()
  );

  assert.equal(context.workflowService.rescheduleCalls.length, 1);
  assert.equal(context.workflowService.rescheduleCalls[0]?.newMeasureDate, "18 октября");
  assert.equal(context.workflowService.rescheduleCalls[0]?.newMeasureTime, "после 16:00");
});

await withStartedSession(async (context, promptMessageId) => {
  const ctx = createCallbackContext({
    data: "order:reschedule:cancel:42",
    messageId: promptMessageId
  });

  await handleOrderRescheduleCancelCallback(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
  assert.equal(context.orders.get(42)?.status, "awaiting_coordination");
  assert.equal(ctx.replies[0]?.text, "Перенос заявки #42 отменён.");
});

await withStartedSession(async (context, promptMessageId) => {
  const ctx = createTextContext({
    text: "18.10.2026",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(ctx, context.params());
  await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(context.workflowService.rescheduleCalls.length, 1);
});

await withStartedSession(async (context, promptMessageId) => {
  const serviceResult: SuccessfulRescheduleResult = {
    status: "success",
    orderId: 42,
    previousMeasureDate: "из сервиса старая дата",
    previousMeasureTime: "из сервиса старое время",
    newMeasureDate: "из сервиса новая дата",
    newMeasureTime: "из сервиса новое время"
  };
  context.workflowService.nextResult = serviceResult;

  await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "18 октября",
      replyToMessageId: promptMessageId
    }),
    context.params()
  );

  assert.equal(context.hookResults[0], serviceResult);
});

await withStartedSession(async (context, promptMessageId) => {
  context.workflowService.nextResult = {
    status: "transition_not_allowed",
    orderId: 42,
    currentStatus: "confirmed"
  };
  const ctx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.hookResults.length, 0);
  assert.equal(ctx.replies[0]?.text, "Перенос заявки #42 больше нельзя выполнить.");
});

await withStartedSession(async (context, promptMessageId) => {
  context.workflowService.nextResult = {
    status: "order_not_found",
    orderId: 42
  };

  await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "18 октября",
      replyToMessageId: promptMessageId
    }),
    context.params()
  );

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.hookResults.length, 0);
});

await withStartedSession(async (context, promptMessageId) => {
  context.workflowService.throwOnReschedule = new Error("forced reschedule failure");
  const ctx = createTextContext({
    text: "18 октября",
    replyToMessageId: promptMessageId
  });

  await handleOrderRescheduleTextMessage(ctx, context.params());

  assert.equal(getSession(context.store), undefined);
  assert.equal(context.hookResults.length, 0);
  assert.equal(ctx.replies[0]?.text, "Не удалось выполнить перенос заявки #42. Начните перенос заново.");
});

await withStartedSession(async (context, promptMessageId) => {
  const session = getSession(context.store);

  assert.ok(session);
  session.isSubmitting = true;

  const consumed = await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "18 октября",
      replyToMessageId: promptMessageId
    }),
    context.params()
  );

  assert.equal(consumed, true);
  assert.equal(context.workflowService.rescheduleCalls.length, 0);
});

await withRescheduleContext(async (context) => {
  const consumed = await handleOrderRescheduleTextMessage(
    createTextContext({
      text: "/new"
    }),
    context.params()
  );

  assert.equal(consumed, false);
});

interface RescheduleTestContext {
  orders: Map<number, OrderRecord>;
  orderRepository: OrderRepository;
  workflowService: CountingWorkflowService;
  store: RescheduleSessionStore;
  hookResults: SuccessfulRescheduleResult[];
  params(): HandleOrderRescheduleParams;
}

// Создаёт изолированный набор fake dependencies для adapter-level reschedule-тестов.
async function withRescheduleContext(
  run: (context: RescheduleTestContext) => Promise<void>
): Promise<void> {
  const orders = new Map<number, OrderRecord>();
  const orderRepository = createFakeOrderRepository(orders);
  const workflowService = createCountingWorkflowService();
  const store = createRescheduleSessionStore();
  const hookResults: SuccessfulRescheduleResult[] = [];
  const context: RescheduleTestContext = {
    orders,
    orderRepository,
    workflowService,
    store,
    hookResults,
    params() {
      return {
        orderRepository,
        orderWorkflowService: workflowService,
        rescheduleSessionStore: store,
        dispatchChatId,
        onRescheduleCommitted(result) {
          hookResults.push(result);
        }
      };
    }
  };

  await run(context);
}

// Стартует базовую session по валидной dispatch-кнопке и передаёт message_id prompt-а.
async function withStartedSession(
  run: (context: RescheduleTestContext, promptMessageId: number) => Promise<void>
): Promise<void> {
  await withRescheduleContext(async (context) => {
    context.orders.set(42, createOrderRecord({ orderId: 42 }));
    const ctx = createCallbackContext({
      data: "order:reschedule:42"
    });

    await handleOrderRescheduleStartCallback(ctx, context.params());

    const promptMessageId = getSession(context.store)?.expectedReplyToMessageId;

    assert.ok(promptMessageId);

    await run(context, promptMessageId);
  });
}

// Возвращает активную session стандартного dispatch-чата и тестового диспетчера.
function getSession(store: RescheduleSessionStore) {
  return store.get({
    dispatchChatId,
    actorTelegramUserId: dispatcherTelegramUserId
  });
}

// Создаёт fake repository заявок, где reschedule-handler может только читать заявки.
function createFakeOrderRepository(orders: Map<number, OrderRecord>): OrderRepository {
  return {
    create(_order: SubmittedOrder): number {
      throw new Error("create is not used in reschedule session tests");
    },
    markDispatchNotificationSent() {
      throw new Error("markDispatchNotificationSent is not used in reschedule session tests");
    },
    markDispatchNotificationFailed() {
      throw new Error("markDispatchNotificationFailed is not used in reschedule session tests");
    },
    updateWorkflowStatus() {
      throw new Error("updateWorkflowStatus is not used in reschedule session tests");
    },
    updateScheduleAndFormattedCard() {
      throw new Error("updateScheduleAndFormattedCard is not used in reschedule session tests");
    },
    countOrders() {
      return orders.size;
    },
    getOrdersForAdmin() {
      return [...orders.values()];
    },
    getOrderById(orderId) {
      return orders.get(orderId);
    },
    getOrderItems(_orderId: number): OrderItemRecord[] {
      return [];
    }
  };
}

interface CountingWorkflowService extends OrderWorkflowService {
  rescheduleCalls: RescheduleOrderParams[];
  nextResult?: RescheduleOrderResult;
  throwOnReschedule?: Error;
}

// Создаёт workflow-сервис-счётчик, чтобы проверять границу Telegram adapter -> service.
function createCountingWorkflowService(): CountingWorkflowService {
  const service = {
    rescheduleCalls: [],
    confirmOrder(params): ConfirmOrderResult {
      return {
        status: "order_not_found",
        orderId: params.orderId
      };
    },
    rescheduleOrder(params): RescheduleOrderResult {
      service.rescheduleCalls.push(params);

      if (service.throwOnReschedule) {
        throw service.throwOnReschedule;
      }

      return service.nextResult ?? {
        status: "success",
        orderId: params.orderId,
        previousMeasureDate: "16 июля",
        previousMeasureTime: "утром",
        newMeasureDate: params.newMeasureDate,
        newMeasureTime: params.newMeasureTime ?? undefined
      };
    }
  } as CountingWorkflowService;

  return service;
}

// Создаёт минимальную запись заявки с dispatch ids для guard-а workflow callback.
function createOrderRecord(
  overrides: {
    orderId: number;
    status?: string;
    measureDate?: string;
    measureTime?: string;
    dispatchNotificationChatId?: string;
    dispatchNotificationHeaderMessageId?: number;
  }
): OrderRecord {
  return {
    order_id: overrides.orderId,
    create_datetime: "2026-10-10T09:00:00.000Z",
    modify_datetime: "2026-10-10T09:00:00.000Z",
    status: overrides.status ?? "awaiting_coordination",
    measure_date: overrides.measureDate ?? "16 июля",
    measure_time: overrides.measureTime,
    address: "Москва, Тестовая улица, 1",
    formatted_card_text: "Тестовая карточка",
    has_photos: 0,
    dispatch_notification_status: "sent",
    dispatch_notification_chat_id: overrides.dispatchNotificationChatId ?? dispatchChatId,
    dispatch_notification_header_message_id: overrides.dispatchNotificationHeaderMessageId ?? headerMessageId,
    dispatch_notification_card_message_id: cardMessageId,
    dispatch_notification_attempts: 1
  };
}

interface FakeReply {
  messageId: number;
  text: string;
  extra?: unknown;
}

interface FakeContext extends Context {
  replies: FakeReply[];
  answeredCallbackCount: number;
  nextReplyMessageId: number;
}

// Собирает fake callback context для start/cancel inline-кнопок.
function createCallbackContext(params: {
  data: string;
  chatId?: string;
  messageId?: number;
  fromId?: number;
}): FakeContext {
  const chatId = params.chatId ?? dispatchChatId;
  const fromId = params.fromId ?? dispatcherTelegramUserId;
  const ctx = createBaseFakeContext(chatId, fromId);

  ctx.callbackQuery = {
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
        id: chatId,
        type: "supergroup",
        title: "Dispatch"
      },
      text: "dispatch header"
    }
  } as Context["callbackQuery"];

  return ctx;
}

// Собирает fake text context для reply-flow сообщений dispatch-чата.
function createTextContext(params: {
  text: string;
  chatId?: string;
  fromId?: number;
  replyToMessageId?: number;
  nextReplyMessageId?: number;
}): FakeContext & {
  message: {
    text: string;
    reply_to_message?: {
      message_id: number;
    };
  };
} {
  const chatId = params.chatId ?? dispatchChatId;
  const fromId = params.fromId ?? dispatcherTelegramUserId;
  const ctx = createBaseFakeContext(chatId, fromId) as FakeContext & {
    message: {
      text: string;
      reply_to_message?: {
        message_id: number;
      };
    };
  };
  ctx.nextReplyMessageId = params.nextReplyMessageId ?? 901;

  ctx.message = {
    message_id: 700,
    date: 0,
    chat: {
      id: chatId,
      type: "supergroup",
      title: "Dispatch"
    },
    from: {
      id: fromId,
      is_bot: false,
      first_name: "Dispatcher"
    },
    text: params.text,
    reply_to_message: params.replyToMessageId
      ? {
          message_id: params.replyToMessageId
        }
      : undefined
  } as typeof ctx.message;

  return ctx;
}

// Создаёт общую основу fake Telegraf Context с reply и answerCbQuery.
function createBaseFakeContext(chatId: string, fromId: number): FakeContext {
  const ctx = {
    replies: [],
    answeredCallbackCount: 0,
    nextReplyMessageId: 900,
    chat: {
      id: chatId,
      type: "supergroup",
      title: "Dispatch"
    },
    from: {
      id: fromId,
      is_bot: false,
      first_name: "Dispatcher"
    },
    async answerCbQuery() {
      ctx.answeredCallbackCount += 1;
      return true;
    },
    async reply(text: string, extra?: unknown) {
      const messageId = ctx.nextReplyMessageId;
      ctx.nextReplyMessageId += 1;
      ctx.replies.push({
        messageId,
        text,
        extra
      });

      return {
        message_id: messageId,
        date: 0,
        chat: {
          id: chatId,
          type: "supergroup"
        },
        text
      };
    }
  } as unknown as FakeContext;

  return ctx;
}
