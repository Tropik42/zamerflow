// Файл реализует транзакционные workflow-операции заявки: согласование и перенос.

import type { AppDatabase } from "../db/db.js";
import type { OrderRepository } from "../db/orderRepository.js";
import type { OrderStatusHistoryRepository } from "../db/orderStatusHistoryRepository.js";
import type { OrderRecord } from "../types/order.js";
import { formatOrderRecordCard } from "./orderCardFormatter.js";

export interface ActorContext {
  source: string;
  externalId?: string;
}

export interface OrderWorkflowService {
  confirmOrder(params: ConfirmOrderParams): ConfirmOrderResult;
  rescheduleOrder(params: RescheduleOrderParams): RescheduleOrderResult;
}

export interface ConfirmOrderParams {
  orderId: number;
  actor: ActorContext;
}

export interface RescheduleOrderParams {
  orderId: number;
  newMeasureDate: string;
  newMeasureTime?: string | null;
  actor: ActorContext;
}

export type ConfirmOrderResult =
  | {
      status: "success";
      orderId: number;
    }
  | {
      status: "order_not_found";
      orderId: number;
    }
  | {
      status: "transition_not_allowed";
      orderId: number;
      currentStatus: string;
    }
  | {
      status: "already_confirmed";
      orderId: number;
    };

export type RescheduleOrderResult =
  | {
      status: "success";
      orderId: number;
      previousMeasureDate?: string;
      previousMeasureTime?: string;
      newMeasureDate: string;
      newMeasureTime?: string;
    }
  | {
      status: "order_not_found";
      orderId: number;
    }
  | {
      status: "transition_not_allowed";
      orderId: number;
      currentStatus: string;
    };

export interface CreateOrderWorkflowServiceParams {
  db: AppDatabase;
  orderRepository: OrderRepository;
  orderStatusHistoryRepository: OrderStatusHistoryRepository;
}

// Создаёт сервис workflow, где изменение заявки и запись истории выполняются в одной транзакции.
export function createOrderWorkflowService(
  params: CreateOrderWorkflowServiceParams
): OrderWorkflowService {
  const { db, orderRepository, orderStatusHistoryRepository } = params;

  // Транзакция согласования меняет статус только из awaiting_coordination и пишет историю.
  const confirmOrderTransaction = db.transaction((operation: ConfirmOrderParams): ConfirmOrderResult => {
    const order = orderRepository.getOrderById(operation.orderId);

    if (!order) {
      return {
        status: "order_not_found",
        orderId: operation.orderId
      };
    }

    if (order.status === "confirmed") {
      return {
        status: "already_confirmed",
        orderId: operation.orderId
      };
    }

    if (order.status !== "awaiting_coordination") {
      return {
        status: "transition_not_allowed",
        orderId: operation.orderId,
        currentStatus: order.status
      };
    }

    const now = new Date().toISOString();

    orderRepository.updateWorkflowStatus({
      orderId: operation.orderId,
      status: "confirmed",
      modifyDatetime: now
    });
    orderStatusHistoryRepository.recordEvent({
      orderId: operation.orderId,
      eventType: "confirmed",
      fromStatusCode: "awaiting_coordination",
      toStatusCode: "confirmed",
      actorSource: operation.actor.source,
      actorExternalId: operation.actor.externalId,
      createDatetime: now
    });

    return {
      status: "success",
      orderId: operation.orderId
    };
  });

  // Транзакция переноса обновляет дату, пересобирает карточку и пишет событие истории.
  const rescheduleOrderTransaction = db.transaction(
    (operation: RescheduleOrderParams): RescheduleOrderResult => {
      const order = orderRepository.getOrderById(operation.orderId);

      if (!order) {
        return {
          status: "order_not_found",
          orderId: operation.orderId
        };
      }

      if (order.status !== "awaiting_coordination") {
        return {
          status: "transition_not_allowed",
          orderId: operation.orderId,
          currentStatus: order.status
        };
      }

      const previousMeasureDate = order.measure_date;
      const previousMeasureTime = order.measure_time;
      const newMeasureTime = optionalText(operation.newMeasureTime);
      const updatedOrder: OrderRecord = {
        ...order,
        status: "awaiting_coordination",
        measure_date: operation.newMeasureDate,
        measure_time: newMeasureTime
      };
      const orderItems = orderRepository.getOrderItems(operation.orderId);
      const formattedCardText = formatOrderRecordCard(updatedOrder, orderItems);
      const now = new Date().toISOString();

      orderRepository.updateScheduleAndFormattedCard({
        orderId: operation.orderId,
        status: "awaiting_coordination",
        measureDate: operation.newMeasureDate,
        measureTime: newMeasureTime,
        formattedCardText,
        modifyDatetime: now
      });
      orderStatusHistoryRepository.recordEvent({
        orderId: operation.orderId,
        eventType: "rescheduled",
        fromStatusCode: "awaiting_coordination",
        toStatusCode: "awaiting_coordination",
        previousMeasureDate,
        previousMeasureTime,
        newMeasureDate: operation.newMeasureDate,
        newMeasureTime,
        actorSource: operation.actor.source,
        actorExternalId: operation.actor.externalId,
        createDatetime: now
      });

      return {
        status: "success",
        orderId: operation.orderId,
        previousMeasureDate,
        previousMeasureTime,
        newMeasureDate: operation.newMeasureDate,
        newMeasureTime
      };
    }
  );

  return {
    confirmOrder(params) {
      return confirmOrderTransaction(params);
    },
    rescheduleOrder(params) {
      return rescheduleOrderTransaction(params);
    }
  };
}

// Превращает пустые строки времени в undefined для единообразного хранения.
function optionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}
