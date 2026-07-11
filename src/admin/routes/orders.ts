import type { FastifyInstance } from "fastify";
import { escapeHtml, layout, table, value } from "../html.js";
import type { OrderRepository } from "../../db/orderRepository.js";
import type { OrderRecord } from "../../types/order.js";

export function registerOrderRoutes(app: FastifyInstance, orderRepository: OrderRepository): void {
  app.get("/admin/orders", async () => {
    const orders = orderRepository.getOrdersForAdmin();

    return layout(
      "Заявки",
      `<h1>Заявки</h1>
      ${table(
        [
          "order_id",
          "create_datetime",
          "status",
          "dispatch_notification_status",
          "salon_name_snapshot",
          "manager_name_snapshot",
          "manager_role_snapshot",
          "measure_date",
          "measure_time",
          "address",
          "base_price",
          ""
        ],
        orders.map((order) => [
          value(order.order_id),
          value(order.create_datetime),
          value(order.status),
          value(order.dispatch_notification_status),
          value(order.salon_name_snapshot),
          value(order.manager_name_snapshot),
          value(order.manager_role_snapshot),
          value(order.measure_date),
          value(order.measure_time),
          value(order.address),
          value(order.base_price),
          `<a href="/admin/orders/${order.order_id}">открыть</a>`
        ])
      )}`
    );
  });

  app.get<{ Params: { orderId: string } }>("/admin/orders/:orderId", async (request, reply) => {
    const order = orderRepository.getOrderById(Number(request.params.orderId));

    if (!order) {
      reply.code(404);
      return layout("Заявка не найдена", "<h1>Заявка не найдена</h1>");
    }

    const items = orderRepository.getOrderItems(order.order_id);

    return layout(
      `Заявка #${order.order_id}`,
      `<h1>Заявка #${order.order_id}</h1>
      ${orderDetails(order)}
      <h2>Позиции</h2>
      ${table(
        [
          "order_item_id",
          "item_type",
          "item_name_snapshot",
          "quantity",
          "unit_price_snapshot",
          "price_text_snapshot",
          "card_text_snapshot",
          "is_auto_added",
          "source",
          "comment",
          "sort_order"
        ],
        items.map((item) => [
          value(item.order_item_id),
          value(item.item_type),
          value(item.item_name_snapshot),
          value(item.quantity),
          value(item.unit_price_snapshot),
          value(item.price_text_snapshot),
          value(item.card_text_snapshot),
          value(item.is_auto_added),
          value(item.source),
          value(item.comment),
          value(item.sort_order)
        ])
      )}
      <h2>Карточка</h2>
      <pre>${escapeHtml(order.formatted_card_text)}</pre>`
    );
  });
}

function orderDetails(order: OrderRecord): string {
  const rows: Array<[string, string | number | undefined]> = [
    ["create_datetime", order.create_datetime],
    ["modify_datetime", order.modify_datetime],
    ["status", order.status],
    ["dispatch_notification_status", order.dispatch_notification_status],
    ["dispatch_notification_sent_at", order.dispatch_notification_sent_at],
    ["dispatch_notification_attempts", order.dispatch_notification_attempts],
    ["dispatch_notification_error", order.dispatch_notification_error],
    ["dispatch_notification_chat_id", order.dispatch_notification_chat_id],
    ["dispatch_notification_header_message_id", order.dispatch_notification_header_message_id],
    ["dispatch_notification_card_message_id", order.dispatch_notification_card_message_id],
    ["dispatch_notification_last_attempt_at", order.dispatch_notification_last_attempt_at],
    ["telegram_user_id", order.telegram_user_id],
    ["salon_id", order.salon_id],
    ["manager_id", order.manager_id],
    ["salon_name_snapshot", order.salon_name_snapshot],
    ["salon_email_snapshot", order.salon_email_snapshot],
    ["manager_name_snapshot", order.manager_name_snapshot],
    ["manager_phone_snapshot", order.manager_phone_snapshot],
    ["manager_role_snapshot", order.manager_role_snapshot],
    ["measure_date", order.measure_date],
    ["measure_time", order.measure_time],
    ["address", order.address],
    ["address_normalized_snapshot", order.address_normalized_snapshot],
    ["address_geo_source", order.address_geo_source],
    ["address_beltway_hit", order.address_beltway_hit],
    ["address_beltway_distance_km", order.address_beltway_distance_km],
    ["address_geo_qc_geo", order.address_geo_qc_geo],
    ["address_geo_qc", order.address_geo_qc],
    ["address_geo_qc_house", order.address_geo_qc_house],
    ["metro", order.metro],
    ["client_contact", order.client_contact],
    ["payment_by", order.payment_by],
    ["base_price", order.base_price],
    ["extra_price_min", order.extra_price_min],
    ["extra_price_max", order.extra_price_max],
    ["mileage_price_per_km", order.mileage_price_per_km],
    ["extra_charges", order.extra_charges],
    ["comment", order.comment],
    ["has_plan", order.has_plan]
  ];

  return `<dl>${rows
    .map(([label, rowValue]) => `<dt>${escapeHtml(label)}</dt><dd>${value(rowValue)}</dd>`)
    .join("")}</dl>`;
}
