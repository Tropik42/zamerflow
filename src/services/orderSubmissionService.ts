import type { OrderRepository } from "../db/orderRepository.js";
import { logError, logInfo, logWarn } from "../logger.js";
import type { AcceptedOrder, DispatchNotificationStatus } from "../types/order.js";
import type { DispatchNotificationService } from "./dispatchNotificationService.js";

export interface OrderSubmissionService {
  submitAcceptedOrder(params: SubmitAcceptedOrderParams): Promise<SubmitAcceptedOrderResult>;
}

export interface SubmitAcceptedOrderParams {
  order: AcceptedOrder;
  sourceChatId?: number | string;
}

export interface SubmitAcceptedOrderResult {
  orderId: number;
  dispatchNotificationStatus: Exclude<DispatchNotificationStatus, "not_sent">;
  dispatchNotificationError?: DispatchNotificationErrorCode;
}

export type DispatchNotificationErrorCode =
  | "DISPATCH_CHAT_ID_NOT_CONFIGURED"
  | "DISPATCH_CHAT_ID_NOT_GROUP_CHAT"
  | "TELEGRAM_FORBIDDEN"
  | "TELEGRAM_BAD_REQUEST"
  | "TELEGRAM_CHAT_NOT_FOUND"
  | "TELEGRAM_SEND_FAILED"
  | "UNKNOWN_DISPATCH_ERROR";

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
    async submitAcceptedOrder({ order, sourceChatId }) {
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
          address_geo_source: order.addressGeoSource
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
        const result = await dispatchNotificationService.sendOrderCard({
          orderId,
          chatId: dispatchChatId,
          salonName: order.salonNameSnapshot,
          managerName: order.managerNameSnapshot,
          measureDate: order.measureDate,
          address: order.address,
          addressNormalizedSnapshot: order.addressNormalizedSnapshot,
          addressBeltwayHit: order.addressBeltwayHit,
          formattedCardText: order.formattedCardText
        });
        const sentAt = new Date().toISOString();

        orderRepository.markDispatchNotificationSent({
          orderId,
          chatId: result.chatId,
          headerMessageId: result.headerMessageId,
          cardMessageId: result.cardMessageId,
          sentAt
        });

        logInfo("dispatch_notification_sent", {
          order_id: orderId,
          chat_id: result.chatId,
          header_message_id: result.headerMessageId,
          card_message_id: result.cardMessageId,
          attempt: 1
        });

        return {
          orderId,
          dispatchNotificationStatus: "sent"
        };
      } catch (error) {
        const errorCode = mapDispatchError(error);
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

function mapDispatchError(error: unknown): DispatchNotificationErrorCode {
  const response = getTelegramErrorResponse(error);

  if (response?.error_code === 403) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (response?.error_code === 400) {
    const description = response.description?.toLowerCase() ?? "";

    if (description.includes("chat not found") || description.includes("chat_id")) {
      return "TELEGRAM_CHAT_NOT_FOUND";
    }

    return "TELEGRAM_BAD_REQUEST";
  }

  if (response) {
    return "TELEGRAM_SEND_FAILED";
  }

  return "UNKNOWN_DISPATCH_ERROR";
}

function getTelegramErrorResponse(
  error: unknown
): { error_code?: number; description?: string } | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const response = (error as { response?: unknown }).response;

  if (!response || typeof response !== "object") {
    return undefined;
  }

  const candidate = response as Record<string, unknown>;
  return {
    error_code: typeof candidate.error_code === "number" ? candidate.error_code : undefined,
    description: typeof candidate.description === "string" ? candidate.description : undefined
  };
}
