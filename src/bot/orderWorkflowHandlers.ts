// Файл регистрирует Telegram handlers для workflow-действий диспетчера по заявке.

import type { Context, Telegraf } from "telegraf";
import type { OrderRepository } from "../db/orderRepository.js";
import { logError, logInfo } from "../logger.js";
import type { ManagerNotificationService } from "../services/managerNotificationService.js";
import type {
  ActorContext,
  OrderWorkflowService
} from "../services/orderWorkflowService.js";
import {
  extractWorkflowCallbackData,
  extractWorkflowCallbackMessage,
  parseOrderConfirmCallbackData,
  validateWorkflowCallbackIdentity
} from "./orderWorkflowCallbackGuard.js";
import { safeAnswerCbQuery } from "./safeAnswerCbQuery.js";
import type { WorkflowHeaderUpdateService } from "./telegramWorkflowHeaderService.js";

export interface RegisterOrderWorkflowHandlersParams {
  bot: Telegraf<Context>;
  orderRepository: OrderRepository;
  orderWorkflowService: OrderWorkflowService;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
  dispatchChatId?: string;
}

export interface HandleOrderConfirmCallbackParams {
  orderRepository: OrderRepository;
  orderWorkflowService: OrderWorkflowService;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
  dispatchChatId?: string;
}

// Подключает обработчики inline-кнопок workflow к экземпляру Telegraf.
export function registerOrderWorkflowHandlers(params: RegisterOrderWorkflowHandlersParams): void {
  params.bot.action(/^order:confirm:.+$/, async (ctx) => {
    await handleOrderConfirmCallback(ctx, params);
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

// Создаёт actor context из Telegram-пользователя, который нажал workflow-кнопку.
function createTelegramActor(ctx: Context): ActorContext | undefined {
  if (!ctx.from || typeof ctx.from.id !== "number") {
    return undefined;
  }

  return {
    source: "telegram",
    externalId: String(ctx.from.id)
  };
}

// Уведомляет менеджера о согласовании и логирует неуспешные side effects без rollback статуса.
async function notifyManagerAfterConfirm(
  params: HandleOrderConfirmCallbackParams,
  notification: {
    orderId: number;
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
