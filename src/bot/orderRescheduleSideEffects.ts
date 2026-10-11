// Файл оркестрирует post-commit Telegram side effects после переноса заявки.

import type { OrderRepository } from "../db/orderRepository.js";
import { logError, logInfo, logWarn } from "../logger.js";
import type { ManagerNotificationService } from "../services/managerNotificationService.js";
import type { OrderRecord } from "../types/order.js";
import type { RescheduleCommittedEvent } from "./orderRescheduleEvents.js";
import type { WorkflowHeaderUpdateService } from "./telegramWorkflowHeaderService.js";
import type { WorkflowDispatchService } from "./telegramWorkflowDispatchService.js";

export interface OrderRescheduleSideEffects {
  handleCommitted(event: RescheduleCommittedEvent): Promise<void>;
}

export interface CreateOrderRescheduleSideEffectsParams {
  orderRepository: OrderRepository;
  managerNotificationService: ManagerNotificationService;
  workflowHeaderUpdateService: WorkflowHeaderUpdateService;
  workflowDispatchService: WorkflowDispatchService;
}

// Создаёт post-commit orchestrator, который не откатывает business transition при ошибках Telegram.
export function createOrderRescheduleSideEffects(
  params: CreateOrderRescheduleSideEffectsParams
): OrderRescheduleSideEffects {
  return {
    async handleCommitted(event) {
      await handleOrderRescheduleCommitted(params, event);
    }
  };
}

// Выполняет независимые внешние эффекты после successful rescheduleOrder().
export async function handleOrderRescheduleCommitted(
  params: CreateOrderRescheduleSideEffectsParams,
  event: RescheduleCommittedEvent
): Promise<void> {
  logInfo("order_rescheduled", {
    order_id: event.result.orderId,
    from_status: "awaiting_coordination",
    to_status: "awaiting_coordination",
    actor_source: event.actor.source,
    actor_external_id: event.actor.externalId,
    dispatch_chat_id: event.dispatchChatId
  });

  const order = readCommittedOrder(params.orderRepository, event);

  await updateExistingDispatchCard(params, event, order);
  await updateExistingDispatchHeader(params, event, order);
  await sendDispatchRescheduleMessage(params, event, order);
  await notifyManagerAboutReschedule(params, event, order);
}

// Формирует короткое dispatch-сообщение "Было / Стало" строго из результата business transition.
export function formatDispatchRescheduleServiceMessage(
  result: RescheduleCommittedEvent["result"]
): string {
  return [
    `📅 Заявка #${result.orderId} перенесена`,
    `Было: ${formatScheduleLine(result.previousMeasureDate, result.previousMeasureTime)}`,
    `Стало: ${formatScheduleLine(result.newMeasureDate, result.newMeasureTime)}`,
    "Ожидает согласования."
  ].join("\n");
}

// Перечитывает заявку после commit; ошибки чтения не должны ронять post-commit orchestration.
function readCommittedOrder(
  orderRepository: OrderRepository,
  event: RescheduleCommittedEvent
): OrderRecord | undefined {
  try {
    return orderRepository.getOrderById(event.result.orderId);
  } catch (error) {
    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: event.dispatchChatId,
      error_code: safeSideEffectErrorCode(error)
    });
    return undefined;
  }
}

// Редактирует существующую чистую карточку без отправки новой полной карточки.
async function updateExistingDispatchCard(
  params: CreateOrderRescheduleSideEffectsParams,
  event: RescheduleCommittedEvent,
  order: OrderRecord | undefined
): Promise<void> {
  const chatId = order?.dispatch_notification_chat_id;
  const messageId = order?.dispatch_notification_card_message_id;

  if (!order) {
    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: event.dispatchChatId,
      error_code: "ORDER_NOT_FOUND"
    });
    return;
  }

  if (!chatId) {
    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      message_id: messageId,
      error_code: "DISPATCH_CHAT_ID_MISSING"
    });
    return;
  }

  if (messageId === undefined) {
    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      error_code: "DISPATCH_CARD_MESSAGE_ID_MISSING"
    });
    return;
  }

  try {
    const result = await params.workflowDispatchService.updateDispatchCard({
      chatId,
      messageId,
      text: order.formatted_card_text
    });

    if (result.status === "updated") {
      logInfo("dispatch_card_updated", {
        order_id: event.result.orderId,
        dispatch_chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      message_id: messageId,
      error_code: result.error
    });
  } catch (error) {
    logWarn("dispatch_card_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      message_id: messageId,
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Обновляет существующий dispatch-header через общий WorkflowHeaderUpdateService.
async function updateExistingDispatchHeader(
  params: CreateOrderRescheduleSideEffectsParams,
  event: RescheduleCommittedEvent,
  order: OrderRecord | undefined
): Promise<void> {
  const chatId = order?.dispatch_notification_chat_id ?? event.dispatchChatId;
  const messageId = order?.dispatch_notification_header_message_id ?? event.dispatchHeaderMessageId;

  if (!event.dispatchHeaderCurrentText) {
    logWarn("dispatch_header_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      message_id: messageId,
      error_code: "DISPATCH_HEADER_CURRENT_TEXT_MISSING"
    });
    return;
  }

  try {
    const result = await params.workflowHeaderUpdateService.updateWorkflowHeader({
      orderId: event.result.orderId,
      chatId,
      messageId,
      currentText: event.dispatchHeaderCurrentText,
      measureDate: event.result.newMeasureDate,
      statusText: "ожидает согласования",
      controls: {
        type: "workflow",
        orderId: event.result.orderId
      }
    });

    if (result.status === "updated") {
      logInfo("dispatch_header_updated", {
        order_id: event.result.orderId,
        dispatch_chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    logWarn("dispatch_header_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      message_id: messageId,
      error_code: result.error
    });
  } catch (error) {
    logWarn("dispatch_header_update_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      message_id: messageId,
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Отправляет короткое служебное сообщение о переносе в dispatch-чат.
async function sendDispatchRescheduleMessage(
  params: CreateOrderRescheduleSideEffectsParams,
  event: RescheduleCommittedEvent,
  order: OrderRecord | undefined
): Promise<void> {
  const chatId = order?.dispatch_notification_chat_id ?? event.dispatchChatId;

  if (!chatId) {
    logWarn("dispatch_reschedule_message_failed", {
      order_id: event.result.orderId,
      error_code: "DISPATCH_CHAT_ID_MISSING"
    });
    return;
  }

  try {
    const result = await params.workflowDispatchService.sendRescheduleMessage({
      chatId,
      text: formatDispatchRescheduleServiceMessage(event.result)
    });

    if (result.status === "sent") {
      logInfo("dispatch_reschedule_message_sent", {
        order_id: event.result.orderId,
        dispatch_chat_id: chatId,
        message_id: result.messageId
      });
      return;
    }

    logWarn("dispatch_reschedule_message_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      error_code: result.error
    });
  } catch (error) {
    logWarn("dispatch_reschedule_message_failed", {
      order_id: event.result.orderId,
      dispatch_chat_id: chatId,
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Уведомляет менеджера о новой дате через общий ManagerNotificationService.
async function notifyManagerAboutReschedule(
  params: CreateOrderRescheduleSideEffectsParams,
  event: RescheduleCommittedEvent,
  order: OrderRecord | undefined
): Promise<void> {
  try {
    const result = await params.managerNotificationService.sendWorkflowNotification({
      type: "order_rescheduled",
      orderId: event.result.orderId,
      managerId: order?.manager_id,
      recipientExternalId: order?.telegram_user_id,
      previousMeasureDate: event.result.previousMeasureDate,
      previousMeasureTime: event.result.previousMeasureTime,
      newMeasureDate: event.result.newMeasureDate,
      newMeasureTime: event.result.newMeasureTime
    });

    if (result.status === "sent") {
      logInfo("manager_notification_sent", {
        order_id: event.result.orderId,
        notification_type: "order_rescheduled"
      });
      return;
    }

    logError("manager_notification_failed", {
      order_id: event.result.orderId,
      notification_type: "order_rescheduled",
      error_code: result.error
    });
  } catch (error) {
    logError("manager_notification_failed", {
      order_id: event.result.orderId,
      notification_type: "order_rescheduled",
      error_code: safeSideEffectErrorCode(error)
    });
  }
}

// Собирает человекочитаемую дату/время без лишней запятой и undefined.
function formatScheduleLine(
  measureDate: string | undefined,
  measureTime: string | undefined
): string {
  const dateText = measureDate?.trim() || "-";
  const timeText = measureTime?.trim();

  return timeText ? `${dateText}, ${timeText}` : dateText;
}

// Преобразует неожиданную ошибку side effect boundary в безопасный код для логов.
function safeSideEffectErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden|bot was blocked|403/i.test(message)) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (/message is not modified/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_MODIFIED";
  }

  if (/message to edit not found|message not found/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_FOUND";
  }

  if (/chat not found|peer_id_invalid/i.test(message)) {
    return "TELEGRAM_CHAT_NOT_FOUND";
  }

  if (/bad request|400/i.test(message)) {
    return "TELEGRAM_BAD_REQUEST";
  }

  return "UNKNOWN_SIDE_EFFECT_ERROR";
}
