import type { OrderRepository } from "../db/orderRepository.js";
import { logError, logInfo, logWarn } from "../logger.js";
import type { AcceptedOrder, DispatchNotificationStatus, DraftPhoto } from "../types/order.js";
import type {
  DispatchNotificationErrorCode,
  DispatchNotificationService
} from "./dispatchNotificationService.js";

export interface OrderSubmissionService {
  submitAcceptedOrder(params: SubmitAcceptedOrderParams): Promise<SubmitAcceptedOrderResult>;
}

export interface SubmitAcceptedOrderParams {
  order: AcceptedOrder;
  photos: readonly DraftPhoto[];
  sourceChatId?: number | string;
}

export interface SubmitAcceptedOrderResult {
  orderId: number;
  dispatchNotificationStatus: Exclude<DispatchNotificationStatus, "not_sent">;
  dispatchNotificationError?: DispatchNotificationErrorCode;
}

export interface CreateOrderSubmissionServiceParams {
  orderRepository: OrderRepository;
  dispatchNotificationService: DispatchNotificationService;
  dispatchChatId?: string;
}

export function createOrderSubmissionService(
  params: CreateOrderSubmissionServiceParams
): OrderSubmissionService {
  const { orderRepository, dispatchNotificationService, dispatchChatId } = params;

  return {
    async submitAcceptedOrder({ order, photos, sourceChatId }) {
      let orderId: number;

      try {
        orderId = orderRepository.create(order);
        logInfo("order_created", {
          order_id: orderId,
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

function isLikelyTelegramGroupChatId(chatId: string): boolean {
  return chatId.trim().startsWith("-");
}
