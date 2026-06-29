import type { AppDatabase } from "./db.js";
import type { AcceptedOrder, OrderItemRecord, OrderRecord } from "../types/order.js";

export interface OrderRepository {
  create(order: AcceptedOrder): number;
  countOrders(): number;
  getOrdersForAdmin(): OrderRecord[];
  getOrderById(orderId: number): OrderRecord | undefined;
  getOrderItems(orderId: number): OrderItemRecord[];
}

/**
 * Создаёт репозиторий для записи заявок и их позиций.
 * @param {AppDatabase} db Открытое подключение к SQLite.
 * @returns {OrderRepository} Методы сохранения заявок.
 */
export function createOrderRepository(db: AppDatabase): OrderRepository {
  const upsertTelegramUser = db.prepare(`
    INSERT INTO telegram_users (
      telegram_user_id,
      create_datetime,
      modify_datetime
    ) VALUES (
      @telegramUserId,
      @createDatetime,
      @modifyDatetime
    )
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      modify_datetime = excluded.modify_datetime
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      create_datetime,
      modify_datetime,
      status,
      salon_id,
      manager_id,
      salon_name_snapshot,
      salon_email_snapshot,
      manager_name_snapshot,
      manager_phone_snapshot,
      manager_role_snapshot,
      measure_date,
      measure_time,
      address,
      metro,
      client_contact,
      payment_by,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      final_price,
      extra_charges,
      comment,
      has_plan,
      formatted_card_text,
      telegram_user_id
    ) VALUES (
      @createDatetime,
      @modifyDatetime,
      @status,
      @salonId,
      @managerId,
      @salonNameSnapshot,
      @salonEmailSnapshot,
      @managerNameSnapshot,
      @managerPhoneSnapshot,
      @managerRoleSnapshot,
      @measureDate,
      @measureTime,
      @address,
      @metro,
      @clientContact,
      @paymentBy,
      @basePrice,
      @extraPriceMin,
      @extraPriceMax,
      @mileagePricePerKm,
      @finalPrice,
      @extraCharges,
      @comment,
      @hasPlan,
      @formattedCardText,
      @telegramUserId
    )
  `);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (
      order_id,
      create_datetime,
      modify_datetime,
      item_type,
      quantity,
      comment,
      item_name_snapshot,
      unit_price_snapshot,
      price_text_snapshot,
      card_text_snapshot,
      is_auto_added,
      source,
      sort_order
    ) VALUES (
      @orderId,
      @createDatetime,
      @modifyDatetime,
      @itemType,
      @quantity,
      @comment,
      @itemNameSnapshot,
      @unitPriceSnapshot,
      @priceTextSnapshot,
      @cardTextSnapshot,
      @isAutoAdded,
      @source,
      @sortOrder
    )
  `);

  const countOrders = db.prepare("SELECT COUNT(*) AS count FROM orders");

  const selectOrdersForAdmin = db.prepare(`
    SELECT
      order_id,
      create_datetime,
      modify_datetime,
      status,
      salon_id,
      manager_id,
      salon_name_snapshot,
      salon_email_snapshot,
      manager_name_snapshot,
      manager_phone_snapshot,
      manager_role_snapshot,
      measure_date,
      measure_time,
      address,
      metro,
      foreman_contact,
      client_contact,
      payment_by,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      final_price,
      extra_charges,
      comment,
      has_plan,
      formatted_card_text,
      telegram_user_id
    FROM orders
    ORDER BY order_id DESC
  `);

  const selectOrderById = db.prepare(`
    SELECT
      order_id,
      create_datetime,
      modify_datetime,
      status,
      salon_id,
      manager_id,
      salon_name_snapshot,
      salon_email_snapshot,
      manager_name_snapshot,
      manager_phone_snapshot,
      manager_role_snapshot,
      measure_date,
      measure_time,
      address,
      metro,
      foreman_contact,
      client_contact,
      payment_by,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      final_price,
      extra_charges,
      comment,
      has_plan,
      formatted_card_text,
      telegram_user_id
    FROM orders
    WHERE order_id = ?
    LIMIT 1
  `);

  const selectOrderItems = db.prepare(`
    SELECT
      order_item_id,
      order_id,
      create_datetime,
      modify_datetime,
      item_type,
      quantity,
      comment,
      item_name_snapshot,
      unit_price_snapshot,
      price_text_snapshot,
      card_text_snapshot,
      is_auto_added,
      source,
      sort_order
    FROM order_items
    WHERE order_id = ?
    ORDER BY sort_order ASC, order_item_id ASC
  `);

  const createOrderWithItems = db.transaction((order: AcceptedOrder) => {
    const now = new Date().toISOString();

    if (order.telegramUserId) {
      upsertTelegramUser.run({
        telegramUserId: order.telegramUserId,
        createDatetime: now,
        modifyDatetime: now
      });
    }

    const result = insertOrder.run({
      createDatetime: now,
      modifyDatetime: now,
      status: order.status,
      salonId: order.salonId ?? null,
      managerId: order.managerId ?? null,
      salonNameSnapshot: order.salonNameSnapshot ?? null,
      salonEmailSnapshot: order.salonEmailSnapshot ?? null,
      managerNameSnapshot: order.managerNameSnapshot ?? order.managerName ?? null,
      managerPhoneSnapshot: order.managerPhoneSnapshot ?? order.managerContact ?? null,
      managerRoleSnapshot: order.managerRoleSnapshot ?? null,
      measureDate: order.measureDate ?? null,
      measureTime: order.measureTime ?? null,
      address: order.address,
      metro: order.metro ?? null,
      clientContact: order.clientContact ?? null,
      paymentBy: order.paymentBy ?? null,
      basePrice: order.basePrice ?? null,
      extraPriceMin: order.extraPriceMin ?? null,
      extraPriceMax: order.extraPriceMax ?? null,
      mileagePricePerKm: order.mileagePricePerKm ?? null,
      finalPrice: null,
      extraCharges: order.extraCharges ?? null,
      comment: order.comment ?? null,
      hasPlan: null,
      formattedCardText: order.formattedCardText,
      telegramUserId: order.telegramUserId ?? null
    });

    const orderId = Number(result.lastInsertRowid);

    order.serviceItems.forEach((item, index) => {
      insertOrderItem.run({
        orderId,
        createDatetime: now,
        modifyDatetime: now,
        itemType: item.type,
        quantity: item.quantity,
        comment: item.comment ?? null,
        itemNameSnapshot: item.itemNameSnapshot ?? null,
        unitPriceSnapshot: item.unitPriceSnapshot ?? null,
        priceTextSnapshot: item.priceTextSnapshot ?? null,
        cardTextSnapshot: item.cardTextSnapshot ?? null,
        isAutoAdded: item.isAutoAdded ? 1 : 0,
        source: item.source ?? "user_input",
        sortOrder: item.sortOrder ?? (index + 1) * 10
      });
    });

    return orderId;
  });

  return {
    create(order) {
      return createOrderWithItems(order);
    },
    countOrders() {
      const row = countOrders.get() as { count: number };
      return Number(row.count);
    },
    getOrdersForAdmin() {
      return selectOrdersForAdmin.all().map(mapOrderRow);
    },
    getOrderById(orderId) {
      const row = selectOrderById.get(orderId);
      return row ? mapOrderRow(row) : undefined;
    },
    getOrderItems(orderId) {
      return selectOrderItems.all(orderId).map(mapOrderItemRow);
    }
  };
}

function mapOrderRow(row: unknown): OrderRecord {
  const order = row as Record<string, unknown>;

  return {
    order_id: Number(order.order_id),
    create_datetime: String(order.create_datetime),
    modify_datetime: String(order.modify_datetime),
    status: String(order.status),
    salon_id: optionalNumber(order.salon_id),
    manager_id: optionalNumber(order.manager_id),
    salon_name_snapshot: optionalString(order.salon_name_snapshot),
    salon_email_snapshot: optionalString(order.salon_email_snapshot),
    manager_name_snapshot: optionalString(order.manager_name_snapshot),
    manager_phone_snapshot: optionalString(order.manager_phone_snapshot),
    manager_role_snapshot: optionalString(order.manager_role_snapshot),
    measure_date: optionalString(order.measure_date),
    measure_time: optionalString(order.measure_time),
    address: String(order.address),
    metro: optionalString(order.metro),
    foreman_contact: optionalString(order.foreman_contact),
    client_contact: optionalString(order.client_contact),
    payment_by: optionalString(order.payment_by),
    base_price: optionalNumber(order.base_price),
    extra_price_min: optionalNumber(order.extra_price_min),
    extra_price_max: optionalNumber(order.extra_price_max),
    mileage_price_per_km: optionalNumber(order.mileage_price_per_km),
    final_price: optionalNumber(order.final_price),
    extra_charges: optionalString(order.extra_charges),
    comment: optionalString(order.comment),
    has_plan: optionalString(order.has_plan),
    formatted_card_text: String(order.formatted_card_text),
    telegram_user_id: optionalString(order.telegram_user_id)
  };
}

function mapOrderItemRow(row: unknown): OrderItemRecord {
  const item = row as Record<string, unknown>;

  return {
    order_item_id: Number(item.order_item_id),
    order_id: Number(item.order_id),
    create_datetime: String(item.create_datetime),
    modify_datetime: String(item.modify_datetime),
    item_type: String(item.item_type),
    quantity: Number(item.quantity),
    comment: optionalString(item.comment),
    item_name_snapshot: optionalString(item.item_name_snapshot),
    unit_price_snapshot: optionalNumber(item.unit_price_snapshot),
    price_text_snapshot: optionalString(item.price_text_snapshot),
    card_text_snapshot: optionalString(item.card_text_snapshot),
    is_auto_added: Number(item.is_auto_added),
    source: optionalString(item.source),
    sort_order: Number(item.sort_order)
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
