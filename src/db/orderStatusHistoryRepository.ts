import type { AppDatabase } from "./db.js";
import {
  orderStatusCodes,
  orderWorkflowEventTypes,
  type OrderStatusCode,
  type OrderStatusHistoryRecord,
  type OrderWorkflowEventType
} from "../types/order.js";

export interface OrderStatusHistoryRepository {
  recordEvent(event: RecordOrderStatusHistoryEventParams): number;
  listByOrderId(orderId: number): OrderStatusHistoryRecord[];
}

export interface RecordOrderStatusHistoryEventParams {
  orderId: number;
  eventType: OrderWorkflowEventType;
  fromStatusCode?: OrderStatusCode;
  toStatusCode?: OrderStatusCode;
  comment?: string;
  previousMeasureDate?: string;
  previousMeasureTime?: string;
  newMeasureDate?: string;
  newMeasureTime?: string;
  actorSource?: string;
  actorExternalId?: string;
  createDatetime?: string;
}

export function createOrderStatusHistoryRepository(db: AppDatabase): OrderStatusHistoryRepository {
  const insertHistoryEvent = db.prepare(`
    INSERT INTO order_status_history (
      order_id,
      event_type,
      from_status_code,
      to_status_code,
      comment,
      previous_measure_date,
      previous_measure_time,
      new_measure_date,
      new_measure_time,
      actor_source,
      actor_external_id,
      create_datetime
    ) VALUES (
      @orderId,
      @eventType,
      @fromStatusCode,
      @toStatusCode,
      @comment,
      @previousMeasureDate,
      @previousMeasureTime,
      @newMeasureDate,
      @newMeasureTime,
      @actorSource,
      @actorExternalId,
      @createDatetime
    )
  `);

  const selectHistoryByOrderId = db.prepare(`
    SELECT
      order_status_history_id,
      order_id,
      event_type,
      from_status_code,
      to_status_code,
      comment,
      previous_measure_date,
      previous_measure_time,
      new_measure_date,
      new_measure_time,
      actor_source,
      actor_external_id,
      create_datetime
    FROM order_status_history
    WHERE order_id = ?
    ORDER BY create_datetime ASC, order_status_history_id ASC
  `);

  return {
    recordEvent(event) {
      const result = insertHistoryEvent.run({
        orderId: event.orderId,
        eventType: event.eventType,
        fromStatusCode: event.fromStatusCode ?? null,
        toStatusCode: event.toStatusCode ?? null,
        comment: event.comment ?? null,
        previousMeasureDate: event.previousMeasureDate ?? null,
        previousMeasureTime: event.previousMeasureTime ?? null,
        newMeasureDate: event.newMeasureDate ?? null,
        newMeasureTime: event.newMeasureTime ?? null,
        actorSource: event.actorSource ?? null,
        actorExternalId: event.actorExternalId ?? null,
        createDatetime: event.createDatetime ?? new Date().toISOString()
      });

      return Number(result.lastInsertRowid);
    },
    listByOrderId(orderId) {
      return selectHistoryByOrderId.all(orderId).map(mapOrderStatusHistoryRow);
    }
  };
}

function mapOrderStatusHistoryRow(row: unknown): OrderStatusHistoryRecord {
  const history = row as Record<string, unknown>;

  return {
    order_status_history_id: Number(history.order_status_history_id),
    order_id: Number(history.order_id),
    event_type: mapOrderWorkflowEventType(history.event_type),
    from_status_code: mapOptionalOrderStatusCode(history.from_status_code),
    to_status_code: mapOptionalOrderStatusCode(history.to_status_code),
    comment: optionalString(history.comment),
    previous_measure_date: optionalString(history.previous_measure_date),
    previous_measure_time: optionalString(history.previous_measure_time),
    new_measure_date: optionalString(history.new_measure_date),
    new_measure_time: optionalString(history.new_measure_time),
    actor_source: optionalString(history.actor_source),
    actor_external_id: optionalString(history.actor_external_id),
    create_datetime: String(history.create_datetime)
  };
}

function mapOrderWorkflowEventType(value: unknown): OrderWorkflowEventType {
  if (typeof value === "string" && (orderWorkflowEventTypes as readonly string[]).includes(value)) {
    return value as OrderWorkflowEventType;
  }

  throw new Error(`Unknown order workflow event type: ${String(value)}`);
}

function mapOptionalOrderStatusCode(value: unknown): OrderStatusCode | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "string" && (orderStatusCodes as readonly string[]).includes(value)) {
    return value as OrderStatusCode;
  }

  throw new Error(`Unknown order status code: ${String(value)}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
