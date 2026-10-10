// Файл сохраняет принятую заявку и фиксирует результат отправки в диспетчерский чат.

import type { AppDatabase } from "../db/db.js";
import type { OrderRepository } from "../db/orderRepository.js";
import type { OrderStatusHistoryRepository } from "../db/orderStatusHistoryRepository.js";
import { logError, logInfo, logWarn } from "../logger.js";
import type { DispatchNotificationStatus, DraftPhoto, SubmittedOrder } from "../types/order.js";
import type {
  DispatchNotificationErrorCode,
  DispatchNotificationService
} from "./dispatchNotificationService.js";

export interface OrderSubmissionService {
  submitOrder(params: SubmitOrderParams): Promise<SubmitOrderResult>;
}

export interface SubmitOrderParams {
  order: SubmittedOrder;
  photos: readonly DraftPhoto[];
  sourceChatId?: number | string;
}

export interface SubmitOrderResult {
  orderId: number;
  dispatchNotificationStatus: Exclude<DispatchNotificationStatus, "not_sent">;
  dispatchNotificationError?: DispatchNotificationErrorCode;
}

export interface CreateOrderSubmissionServiceParams {
  db: AppDatabase;
  orderRepository: OrderRepository;
  orderStatusHistoryRepository: OrderStatusHistoryRepository;
  dispatchNotificationService: DispatchNotificationService;
  dispatchChatId?: string;
}

// Создаёт сервис принятия заявок с транзакционной записью orders/order_items/history.
export function createOrderSubmissionService(
  params: CreateOrderSubmissionServiceParams
): OrderSubmissionService {
  const {
    db,
    orderRepository,
    orderStatusHistoryRepository,
    dispatchNotificationService,
    dispatchChatId
  } = params;

  // Сохраняет заявку и начальное событие workflow в одной SQLite-транзакции.
  const createOrderWithInitialHistory = db.transaction((order: SubmittedOrder) => {
    const orderId = orderRepository.create(order);
    const now = new Date().toISOString();

    orderStatusHistoryRepository.recordEvent({
      orderId,
      eventType: "created",
      toStatusCode: "awaiting_coordination",
      newMeasureDate: order.measureDate,
      newMeasureTime: order.measureTime,
      actorSource: "telegram",
      actorExternalId: order.telegramUserId,
      createDatetime: now
    });

    return orderId;
  });

  return {
    async submitOrder({ order, photos, sourceChatId }) {
      let orderId: number;

      try {
        orderId = createOrderWithInitialHistory(order);
        logInfo("order_created", {
          order_id: orderId,
          status: order.status,
          telegram_user_id: order.telegramUserId,
          chat_id: sourceChatId,
          salon_id: order.salonId,
          salon_name: order.salonNameSnapshot,
          manager_id: order.managerId,
          manager_name: order.managerNameSnapshot,
          measure_date: order.measureDate,
          measure_time: order.measureTime,
          address_beltway_hit: order.addressBeltwayHit,
          address_beltway_distance_km: order.addressBeltwayDistanceKm,
          address_geo_source: order.addressGeoSource,
          photo_count: photos.length
        });
      } catch (error) {
        logError("order_save_failed", {
          telegram_user_id: order.telegramUserId,
          chat_id: sourceChatId,
          salon_id: order.salonId,
          manager_id: order.managerId,
          message: error instanceof Error ? error.name : "UNKNOWN_ERROR"
        });
        throw error;
      }

      if (!dispatchChatId) {
        // Без DISPATCH_CHAT_ID заявка остаётся сохранённой, но dispatch считается неуспешным.
        const errorCode = "DISPATCH_CHAT_ID_NOT_CONFIGURED";
        const attemptedAt = new Date().toISOString();

        orderRepository.markDispatchNotificationFailed({
          orderId,
          error: errorCode,
          attemptedAt
        });

        logWarn("dispatch_notification_skipped", {
          order_id: orderId,
          error_code: errorCode
        });

        return {
          orderId,
          dispatchNotificationStatus: "failed",
          dispatchNotificationError: errorCode
        };
      }

      if (!isLikelyTelegramGroupChatId(dispatchChatId)) {
        // Dispatch разрешён только в групповой чат, чтобы не отправлять рабочие заявки в личку.
        const errorCode = "DISPATCH_CHAT_ID_NOT_GROUP_CHAT";
        const attemptedAt = new Date().toISOString();

        orderRepository.markDispatchNotificationFailed({
          orderId,
          error: errorCode,
          attemptedAt,
          chatId: dispatchChatId
        });

        logWarn("dispatch_notification_skipped", {
          order_id: orderId,
          chat_id: dispatchChatId,
          error_code: errorCode
        });

        return {
          orderId,
          dispatchNotificationStatus: "failed",
          dispatchNotificationError: errorCode
        };
      }

      try {
        const result = await dispatchNotificationService.sendOrderPackage({
          orderId,
          chatId: dispatchChatId,
          salonName: order.salonNameSnapshot,
          managerName: order.managerNameSnapshot,
          measureDate: order.measureDate,
          address: order.address,
          addressNormalizedSnapshot: order.addressNormalizedSnapshot,
          addressBeltwayHit: order.addressBeltwayHit,
          addressBeltwayDistanceKm: order.addressBeltwayDistanceKm,
          formattedCardText: order.formattedCardText,
          photos
        });
        const attemptedAt = new Date().toISOString();

        if (!result.failedStage && result.cardMessageId) {
          orderRepository.markDispatchNotificationSent({
            orderId,
            chatId: result.chatId,
            headerMessageId: result.headerMessageId,
            cardMessageId: result.cardMessageId,
            sentAt: attemptedAt
          });

          logInfo("dispatch_notification_sent", {
            order_id: orderId,
            chat_id: result.chatId,
            header_message_id: result.headerMessageId,
            card_message_id: result.cardMessageId,
            photo_count: photos.length,
            attempt: 1
          });

          return {
            orderId,
            dispatchNotificationStatus: "sent"
          };
        }

        const errorCode = result.errorCode ?? "UNKNOWN_DISPATCH_ERROR";

        orderRepository.markDispatchNotificationFailed({
          orderId,
          error: errorCode,
          attemptedAt,
          chatId: result.chatId,
          headerMessageId: result.headerMessageId,
          cardMessageId: result.cardMessageId
        });

        logError("dispatch_notification_failed", {
          order_id: orderId,
          chat_id: result.chatId,
          error_code: errorCode,
          failed_stage: result.failedStage,
          photo_count: photos.length,
          attempt: 1
        });

        return {
          orderId,
          dispatchNotificationStatus: "failed",
          dispatchNotificationError: errorCode
        };
      } catch {
        const errorCode = "UNKNOWN_DISPATCH_ERROR";
        const attemptedAt = new Date().toISOString();

        orderRepository.markDispatchNotificationFailed({
          orderId,
          error: errorCode,
          attemptedAt,
          chatId: dispatchChatId
        });

        logError("dispatch_notification_failed", {
          order_id: orderId,
          chat_id: dispatchChatId,
          error_code: errorCode,
          failed_stage: "unknown",
          photo_count: photos.length,
          attempt: 1
        });

        return {
          orderId,
          dispatchNotificationStatus: "failed",
          dispatchNotificationError: errorCode
        };
      }
    }
  };
}

// Проверяет грубый признак Telegram group/supergroup chat id.
function isLikelyTelegramGroupChatId(chatId: string): boolean {
  return chatId.trim().startsWith("-");
}
