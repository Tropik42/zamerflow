// Файл регистрирует Telegram handlers для workflow-действий диспетчера по заявке.

import { Markup, type Context, type Telegraf } from "telegraf";
import type { OrderRepository } from "../db/orderRepository.js";
import { logError, logInfo } from "../logger.js";
import type { ManagerNotificationService } from "../services/managerNotificationService.js";
import { normalizeMeasureDateInput } from "../services/measureDate.js";
import type {
  ActorContext,
  OrderWorkflowService,
  RescheduleOrderResult
} from "../services/orderWorkflowService.js";
import type {
  RescheduleCommittedEvent,
  RescheduleCommittedHandler
} from "./orderRescheduleEvents.js";
import {
  extractWorkflowCallbackData,
  extractWorkflowCallbackMessage,
  parseOrderConfirmCallbackData,
  parseOrderRescheduleCallbackData,
  parseOrderRescheduleCancelCallbackData,
  validateWorkflowCallbackIdentity
} from "./orderWorkflowCallbackGuard.js";
import type {
  RescheduleSession,
  RescheduleSessionStore
} from "./rescheduleSessionStore.js";
import { safeAnswerCbQuery } from "./safeAnswerCbQuery.js";
import type { WorkflowHeaderUpdateService } from "./telegramWorkflowHeaderService.js";

type WorkflowTextContext = Context & {
  message: {
    text: string;
    reply_to_message?: {
      message_id?: number;
    };
  };
};

export interface RegisterOrderWorkflowHandlersParams {
  bot: Telegraf<Context>;
  orderRepository: OrderRepository;
  orderWorkflowService: OrderWorkflowService;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
  rescheduleSessionStore: RescheduleSessionStore;
  onRescheduleCommitted?: RescheduleCommittedHandler;
  dispatchChatId?: string;
}

export interface HandleOrderConfirmCallbackParams {
  orderRepository: OrderRepository;
  orderWorkflowService: OrderWorkflowService;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
  dispatchChatId?: string;
}

export interface HandleOrderRescheduleParams {
  orderRepository: OrderRepository;
  orderWorkflowService: OrderWorkflowService;
  rescheduleSessionStore: RescheduleSessionStore;
  onRescheduleCommitted?: RescheduleCommittedHandler;
  dispatchChatId?: string;
}

// Подключает обработчики inline-кнопок workflow к экземпляру Telegraf.
export function registerOrderWorkflowHandlers(params: RegisterOrderWorkflowHandlersParams): void {
  params.bot.action(/^order:confirm:.+$/, async (ctx) => {
    await handleOrderConfirmCallback(ctx, params);
  });

  params.bot.action(/^order:reschedule:\d+$/, async (ctx) => {
    await handleOrderRescheduleStartCallback(ctx, params);
  });

  params.bot.action(/^order:reschedule:cancel:\d+$/, async (ctx) => {
    await handleOrderRescheduleCancelCallback(ctx, params);
  });

  params.bot.on("text", async (ctx, next) => {
    const consumed = await handleOrderRescheduleTextMessage(
      ctx as WorkflowTextContext,
      params
    );

    if (!consumed) {
      await next();
    }
  });
}

// Обрабатывает нажатие "Согласовано": проверяет guard, меняет статус и запускает side effects.
export async function handleOrderConfirmCallback(
  ctx: Context,
  params: HandleOrderConfirmCallbackParams
): Promise<void> {
  await safeAnswerCbQuery(ctx);

  const parsedCallback = parseOrderConfirmCallbackData(extractWorkflowCallbackData(ctx));

  if (parsedCallback.status !== "ok") {
    return;
  }

  const message = extractWorkflowCallbackMessage(ctx);
  const order = params.orderRepository.getOrderById(parsedCallback.orderId);
  const guard = validateWorkflowCallbackIdentity({
    configuredDispatchChatId: params.dispatchChatId,
    message,
    order
  });

  if (guard.status !== "allowed") {
    return;
  }

  if (!message) {
    return;
  }

  const actor = createTelegramActor(ctx);

  if (!actor) {
    return;
  }

  logInfo("order_coordination_confirm_requested", {
    order_id: parsedCallback.orderId,
    actor_source: actor.source,
    actor_external_id: actor.externalId,
    dispatch_chat_id: message.chatId,
    message_id: message.messageId
  });

  const result = params.orderWorkflowService.confirmOrder({
    orderId: parsedCallback.orderId,
    actor
  });

  if (result.status === "success") {
    logInfo("order_coordination_confirmed", {
      order_id: parsedCallback.orderId,
      from_status: "awaiting_coordination",
      to_status: "confirmed",
      actor_source: actor.source,
      actor_external_id: actor.externalId,
      dispatch_chat_id: message.chatId,
      message_id: message.messageId
    });

    const confirmedOrder = params.orderRepository.getOrderById(parsedCallback.orderId);

    await notifyManagerAfterConfirm(params, {
      orderId: parsedCallback.orderId,
      address: confirmedOrder?.address,
      managerId: confirmedOrder?.manager_id,
      recipientExternalId: confirmedOrder?.telegram_user_id,
      measureDate: confirmedOrder?.measure_date,
      measureTime: confirmedOrder?.measure_time
    });
    await updateDispatchHeaderAfterConfirm(params, {
      orderId: parsedCallback.orderId,
      dispatchChatId: message.chatId,
      messageId: message.messageId,
      currentText: message.currentText
    });
    return;
  }

  if (result.status === "already_confirmed") {
    logInfo("order_coordination_confirm_duplicate", {
      order_id: parsedCallback.orderId,
      actor_source: actor.source,
      actor_external_id: actor.externalId,
      dispatch_chat_id: message.chatId,
      message_id: message.messageId
    });
  }
}

// Стартует reply-flow переноса после проверки dispatch header identity.
export async function handleOrderRescheduleStartCallback(
  ctx: Context,
  params: HandleOrderRescheduleParams
): Promise<void> {
  await safeAnswerCbQuery(ctx);

  const parsedCallback = parseOrderRescheduleCallbackData(extractWorkflowCallbackData(ctx));

  if (parsedCallback.status !== "ok") {
    return;
  }

  const message = extractWorkflowCallbackMessage(ctx);
  const order = params.orderRepository.getOrderById(parsedCallback.orderId);

  if (!order) {
    return;
  }

  const guard = validateWorkflowCallbackIdentity({
    configuredDispatchChatId: params.dispatchChatId,
    message,
    order
  });

  if (guard.status !== "allowed" || !message) {
    return;
  }

  const actorTelegramUserId = getTelegramActorUserId(ctx);

  if (!actorTelegramUserId) {
    return;
  }

  const activeSession = params.rescheduleSessionStore.get({
    dispatchChatId: message.chatId,
    actorTelegramUserId
  });

  if (activeSession) {
    await ctx.reply(
      `Перенос заявки #${activeSession.orderId} уже начат. Введите новую дату или отмените перенос.`
    );
    return;
  }

  if (order.status !== "awaiting_coordination") {
    await ctx.reply(`Перенос заявки #${parsedCallback.orderId} сейчас недоступен.`);
    return;
  }

  const session: RescheduleSession = {
    orderId: parsedCallback.orderId,
    actorTelegramUserId,
    dispatchChatId: message.chatId,
    dispatchHeaderMessageId: message.messageId,
    dispatchHeaderCurrentText: message.currentText,
    step: "date",
    isSubmitting: false,
    startedAt: new Date().toISOString()
  };

  params.rescheduleSessionStore.set(session);

  let promptMessageId: number | undefined;

  try {
    promptMessageId = await sendRescheduleDatePrompt(ctx, parsedCallback.orderId);
  } catch (error) {
    params.rescheduleSessionStore.delete(session);
    throw error;
  }

  if (promptMessageId === undefined) {
    params.rescheduleSessionStore.delete(session);
    return;
  }

  session.expectedReplyToMessageId = promptMessageId;

  logInfo("order_reschedule_started", {
    order_id: parsedCallback.orderId,
    actor_source: "telegram",
    actor_external_id: String(actorTelegramUserId),
    dispatch_chat_id: message.chatId
  });
}

// Отменяет активную reschedule-сессию без изменения заявки и workflow history.
export async function handleOrderRescheduleCancelCallback(
  ctx: Context,
  params: HandleOrderRescheduleParams
): Promise<void> {
  await safeAnswerCbQuery(ctx);

  const parsedCallback = parseOrderRescheduleCancelCallbackData(extractWorkflowCallbackData(ctx));

  if (parsedCallback.status !== "ok") {
    return;
  }

  const message = extractWorkflowCallbackMessage(ctx);
  const configuredDispatchChatId = params.dispatchChatId?.trim();

  if (!configuredDispatchChatId || !message || message.chatId !== configuredDispatchChatId) {
    return;
  }

  const actorTelegramUserId = getTelegramActorUserId(ctx);

  if (!actorTelegramUserId) {
    return;
  }

  const session = params.rescheduleSessionStore.get({
    dispatchChatId: message.chatId,
    actorTelegramUserId
  });

  if (
    !session ||
    session.orderId !== parsedCallback.orderId ||
    session.expectedReplyToMessageId !== message.messageId
  ) {
    return;
  }

  params.rescheduleSessionStore.delete(session);

  logInfo("order_reschedule_cancelled", {
    order_id: session.orderId,
    actor_source: "telegram",
    actor_external_id: String(actorTelegramUserId),
    dispatch_chat_id: session.dispatchChatId
  });

  await ctx.reply(`Перенос заявки #${session.orderId} отменён.`);
}

// Обрабатывает только reply на актуальный prompt reschedule-сессии, остальные тексты пропускает дальше.
export async function handleOrderRescheduleTextMessage(
  ctx: WorkflowTextContext,
  params: HandleOrderRescheduleParams
): Promise<boolean> {
  const actorTelegramUserId = getTelegramActorUserId(ctx);
  const dispatchChatId = ctx.chat?.id ? String(ctx.chat.id) : undefined;
  const configuredDispatchChatId = params.dispatchChatId?.trim();

  if (!actorTelegramUserId || !dispatchChatId || dispatchChatId !== configuredDispatchChatId) {
    return false;
  }

  const session = params.rescheduleSessionStore.get({
    dispatchChatId,
    actorTelegramUserId
  });

  if (!session || !isReplyToExpectedReschedulePrompt(ctx, session)) {
    return false;
  }

  if (session.isSubmitting) {
    return true;
  }

  const text = ctx.message.text.trim();

  if (session.step === "date") {
    await handleRescheduleDateReply(ctx, params, session, text);
    return true;
  }

  await submitReschedule(ctx, params, session, {
    newMeasureDate: session.newMeasureDate,
    newMeasureTime: text
  });
  return true;
}

// Создаёт actor context из Telegram-пользователя, который нажал workflow-кнопку.
function createTelegramActor(ctx: Context): ActorContext | undefined {
  const actorTelegramUserId = getTelegramActorUserId(ctx);

  if (!actorTelegramUserId) {
    return undefined;
  }

  return {
    source: "telegram",
    externalId: String(actorTelegramUserId)
  };
}

// Возвращает Telegram user id диспетчера, который нажал кнопку или отправил reply.
function getTelegramActorUserId(ctx: Context): number | undefined {
  return typeof ctx.from?.id === "number" ? ctx.from.id : undefined;
}

// Нормализует дату переноса и решает, нужен ли отдельный ввод нового времени.
async function handleRescheduleDateReply(
  ctx: WorkflowTextContext,
  params: HandleOrderRescheduleParams,
  session: RescheduleSession,
  text: string
): Promise<void> {
  const normalizedDate = normalizeMeasureDateInput(text);

  if (normalizedDate.status === "rejected") {
    const promptMessageId = await sendRescheduleDatePrompt(
      ctx,
      session.orderId,
      "Дата некорректна. Проверьте день, месяц и год."
    );

    if (promptMessageId !== undefined) {
      session.expectedReplyToMessageId = promptMessageId;
    }

    return;
  }

  const order = params.orderRepository.getOrderById(session.orderId);

  if (!order || order.status !== "awaiting_coordination") {
    params.rescheduleSessionStore.delete(session);
    await ctx.reply(`Перенос заявки #${session.orderId} больше нельзя выполнить.`);
    return;
  }

  session.newMeasureDate = normalizedDate.value;

  if (order.measure_time) {
    session.step = "time";

    const promptMessageId = await sendRescheduleTimePrompt(ctx, session.orderId);

    if (promptMessageId !== undefined) {
      session.expectedReplyToMessageId = promptMessageId;
    }

    return;
  }

  await submitReschedule(ctx, params, session, {
    newMeasureDate: normalizedDate.value,
    newMeasureTime: undefined
  });
}

// Вызывает бизнес-сервис переноса и очищает session после финального результата.
async function submitReschedule(
  ctx: Context,
  params: HandleOrderRescheduleParams,
  session: RescheduleSession,
  schedule: {
    newMeasureDate?: string;
    newMeasureTime?: string;
  }
): Promise<void> {
  if (session.isSubmitting) {
    return;
  }

  if (!schedule.newMeasureDate) {
    session.step = "date";
    session.newMeasureDate = undefined;

    const promptMessageId = await sendRescheduleDatePrompt(ctx, session.orderId);

    if (promptMessageId !== undefined) {
      session.expectedReplyToMessageId = promptMessageId;
    }

    return;
  }

  session.isSubmitting = true;

  let result: RescheduleOrderResult;
  const actor: ActorContext = {
    source: "telegram",
    externalId: String(session.actorTelegramUserId)
  };

  try {
    result = params.orderWorkflowService.rescheduleOrder({
      orderId: session.orderId,
      newMeasureDate: schedule.newMeasureDate,
      newMeasureTime: schedule.newMeasureTime,
      actor
    });
  } catch {
    params.rescheduleSessionStore.delete(session);
    await ctx.reply(`Не удалось выполнить перенос заявки #${session.orderId}. Начните перенос заново.`);
    return;
  }

  if (result.status === "success") {
    const event: RescheduleCommittedEvent = {
      result,
      actor,
      dispatchChatId: session.dispatchChatId,
      dispatchHeaderMessageId: session.dispatchHeaderMessageId,
      dispatchHeaderCurrentText: session.dispatchHeaderCurrentText
    };

    params.rescheduleSessionStore.delete(session);
    await runRescheduleCommittedHook(params, event);
    return;
  }

  params.rescheduleSessionStore.delete(session);
  await ctx.reply(`Перенос заявки #${session.orderId} больше нельзя выполнить.`);
}

// Запускает post-commit hook переноса так, чтобы сбой side effects не повторял business submit.
async function runRescheduleCommittedHook(
  params: HandleOrderRescheduleParams,
  event: RescheduleCommittedEvent
): Promise<void> {
  try {
    await params.onRescheduleCommitted?.(event);
  } catch (error) {
    logError("order_reschedule_post_commit_failed", {
      order_id: event.result.orderId,
      actor_source: event.actor.source,
      actor_external_id: event.actor.externalId,
      dispatch_chat_id: event.dispatchChatId,
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Отправляет prompt новой даты и возвращает message_id для проверки будущего reply.
async function sendRescheduleDatePrompt(
  ctx: Context,
  orderId: number,
  prefixText?: string
): Promise<number | undefined> {
  return sendReschedulePrompt(
    ctx,
    [prefixText, `Введите новую дату замера для заявки #${orderId}.`]
      .filter((value): value is string => Boolean(value))
      .join("\n\n"),
    orderId
  );
}

// Отправляет prompt нового времени и возвращает message_id для проверки будущего reply.
async function sendRescheduleTimePrompt(ctx: Context, orderId: number): Promise<number | undefined> {
  return sendReschedulePrompt(ctx, `Введите новое время замера для заявки #${orderId}.`, orderId);
}

// Отправляет вопрос reschedule-flow с кнопкой отмены переноса.
async function sendReschedulePrompt(
  ctx: Context,
  text: string,
  orderId: number
): Promise<number | undefined> {
  const message = await ctx.reply(text, rescheduleCancelKeyboard(orderId));

  return extractSentMessageId(message);
}

// Создаёт inline-кнопку отмены активного переноса.
function rescheduleCancelKeyboard(orderId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Отменить перенос", `order:reschedule:cancel:${orderId}`)]
  ]);
}

// Проверяет, что сообщение является reply на актуальный prompt конкретной reschedule-сессии.
function isReplyToExpectedReschedulePrompt(
  ctx: WorkflowTextContext,
  session: RescheduleSession
): boolean {
  return ctx.message.reply_to_message?.message_id === session.expectedReplyToMessageId;
}

// Достаёт message_id из результата ctx.reply без привязки к конкретному подтипу Telegram message.
function extractSentMessageId(message: unknown): number | undefined {
  if (!isObject(message) || typeof message.message_id !== "number") {
    return undefined;
  }

  return message.message_id;
}

// Уведомляет менеджера о согласовании и логирует неуспешные side effects без rollback статуса.
async function notifyManagerAfterConfirm(
  params: HandleOrderConfirmCallbackParams,
  notification: {
    orderId: number;
    address?: string;
    managerId?: number;
    recipientExternalId?: string;
    measureDate?: string;
    measureTime?: string;
  }
): Promise<void> {
  try {
    const result = await params.managerNotificationService.sendWorkflowNotification({
      type: "order_confirmed",
      orderId: notification.orderId,
      address: notification.address,
      managerId: notification.managerId,
      recipientExternalId: notification.recipientExternalId,
      measureDate: notification.measureDate,
      measureTime: notification.measureTime
    });

    if (result.status === "sent") {
      logInfo("manager_notification_sent", {
        order_id: notification.orderId,
        notification_type: "order_confirmed"
      });
      return;
    }

    logError("manager_notification_failed", {
      order_id: notification.orderId,
      notification_type: "order_confirmed",
      error_code: result.error
    });
  } catch (error) {
    logError("manager_notification_failed", {
      order_id: notification.orderId,
      notification_type: "order_confirmed",
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Обновляет dispatch-заголовок и убирает workflow-кнопки после успешного согласования.
async function updateDispatchHeaderAfterConfirm(
  params: HandleOrderConfirmCallbackParams,
  header: {
    orderId: number;
    dispatchChatId: string;
    messageId: number;
    currentText?: string;
  }
): Promise<void> {
  try {
    const result = await params.workflowHeaderUpdateService.updateWorkflowHeader({
      orderId: header.orderId,
      chatId: header.dispatchChatId,
      messageId: header.messageId,
      currentText: header.currentText,
      statusText: "согласовано",
      controls: {
        type: "none"
      }
    });

    if (result.status === "updated") {
      logInfo("dispatch_header_updated", {
        order_id: header.orderId,
        dispatch_chat_id: header.dispatchChatId,
        message_id: header.messageId
      });
      return;
    }

    logError("dispatch_header_update_failed", {
      order_id: header.orderId,
      dispatch_chat_id: header.dispatchChatId,
      message_id: header.messageId,
      error_code: result.error
    });
  } catch (error) {
    logError("dispatch_header_update_failed", {
      order_id: header.orderId,
      dispatch_chat_id: header.dispatchChatId,
      message_id: header.messageId,
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Преобразует ошибку побочного эффекта в стабильный код для логов.
function safeSideEffectErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden|403/i.test(message)) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (/bad request|400/i.test(message)) {
    return "TELEGRAM_BAD_REQUEST";
  }

  return "UNKNOWN_SIDE_EFFECT_ERROR";
}

// Узкая проверка object для безопасного чтения message_id из результата Telegram API.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
