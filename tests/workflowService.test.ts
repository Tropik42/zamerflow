import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { createOrderRepository, type OrderRepository } from "../src/db/orderRepository.js";
import {
  createOrderStatusHistoryRepository,
  type OrderStatusHistoryRepository,
  type RecordOrderStatusHistoryEventParams
} from "../src/db/orderStatusHistoryRepository.js";
import {
  createOrderWorkflowService,
  type ActorContext,
  type OrderWorkflowService
} from "../src/services/orderWorkflowService.js";

const migrationsDir = path.join(process.cwd(), "migrations");
const actor: ActorContext = {
  source: "test",
  externalId: "workflow-service-test"
};

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "awaiting_coordination"
  });

  const result = service.confirmOrder({ orderId, actor });

  assert.deepEqual(result, {
    status: "success",
    orderId
  });
  assert.equal(orderRepository.getOrderById(orderId)?.status, "confirmed");

  const history = historyRepository.listByOrderId(orderId);

  assert.equal(history.length, 1);
  assert.equal(history[0]?.event_type, "confirmed");
  assert.equal(history[0]?.from_status_code, "awaiting_coordination");
  assert.equal(history[0]?.to_status_code, "confirmed");
  assert.equal(history[0]?.actor_source, actor.source);
  assert.equal(history[0]?.actor_external_id, actor.externalId);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "confirmed",
    modifyDatetime: "2026-10-10T10:00:00.000Z"
  });

  historyRepository.recordEvent({
    orderId,
    eventType: "confirmed",
    fromStatusCode: "awaiting_coordination",
    toStatusCode: "confirmed",
    createDatetime: "2026-10-10T10:00:00.000Z"
  });

  const before = orderRepository.getOrderById(orderId);
  const result = service.confirmOrder({ orderId, actor });
  const after = orderRepository.getOrderById(orderId);

  assert.deepEqual(result, {
    status: "already_confirmed",
    orderId
  });
  assert.equal(historyRepository.listByOrderId(orderId).length, 1);
  assert.equal(after?.status, "confirmed");
  assert.equal(after?.modify_datetime, before?.modify_datetime);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "accepted",
    modifyDatetime: "2026-10-10T10:00:00.000Z"
  });
  const before = orderRepository.getOrderById(orderId);

  const result = service.confirmOrder({ orderId, actor });
  const after = orderRepository.getOrderById(orderId);

  assert.deepEqual(result, {
    status: "transition_not_allowed",
    orderId,
    currentStatus: "accepted"
  });
  assert.equal(after?.status, "accepted");
  assert.equal(after?.modify_datetime, before?.modify_datetime);
  assert.equal(historyRepository.listByOrderId(orderId).length, 0);
});

withWorkflowContext(({ db, orderRepository, service }) => {
  const countBefore = orderRepository.countOrders();
  const historyCountBefore = countHistory(db);

  const result = service.confirmOrder({ orderId: 999_999, actor });

  assert.deepEqual(result, {
    status: "order_not_found",
    orderId: 999_999
  });
  assert.equal(orderRepository.countOrders(), countBefore);
  assert.equal(countHistory(db), historyCountBefore);
});

withWorkflowContext(({ db, orderRepository, service }) => {
  const countBefore = orderRepository.countOrders();
  const historyCountBefore = countHistory(db);

  const result = service.rescheduleOrder({
    orderId: 999_999,
    newMeasureDate: "18 июля",
    newMeasureTime: "после 15:00",
    actor
  });

  assert.deepEqual(result, {
    status: "order_not_found",
    orderId: 999_999
  });
  assert.equal(orderRepository.countOrders(), countBefore);
  assert.equal(countHistory(db), historyCountBefore);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "awaiting_coordination",
    measureDate: "16 июля",
    measureTime: "утром",
    formattedCardText: "old card",
    salonNameSnapshot: "Snapshot Salon",
    salonEmailSnapshot: "snapshot@example.com",
    managerNameSnapshot: "Олег",
    managerPhoneSnapshot: "+7-999-123-45-67",
    managerRoleSnapshot: "director",
    addressNormalizedSnapshot: "Москва, Тестовая улица, 1",
    addressBeltwayHit: "OUT_MKAD",
    basePrice: 2500,
    extraPriceMin: 1000,
    extraPriceMax: 1500,
    mileagePricePerKm: 60
  });

  insertOrderItem(db, orderId, {
    itemType: "кухня",
    sortOrder: 10
  });
  insertOrderItem(db, orderId, {
    itemType: "required",
    itemNameSnapshot: "Лифтовой холл + подъезд + паркинг",
    unitPriceSnapshot: 1000,
    priceTextSnapshot: "1,000₽",
    cardTextSnapshot: "Лифтовой холл + подъезд + паркинг 1000₽",
    isAutoAdded: true,
    source: "salon_required_item",
    sortOrder: 20
  });

  const before = orderRepository.getOrderById(orderId);
  const itemsBefore = orderRepository.getOrderItems(orderId);
  const result = service.rescheduleOrder({
    orderId,
    newMeasureDate: "18 июля",
    newMeasureTime: "после 15:00",
    actor
  });
  const after = orderRepository.getOrderById(orderId);
  const itemsAfter = orderRepository.getOrderItems(orderId);
  const history = historyRepository.listByOrderId(orderId);

  assert.deepEqual(result, {
    status: "success",
    orderId,
    previousMeasureDate: "16 июля",
    previousMeasureTime: "утром",
    newMeasureDate: "18 июля",
    newMeasureTime: "после 15:00"
  });
  assert.equal(after?.status, "awaiting_coordination");
  assert.equal(after?.measure_date, "18 июля");
  assert.equal(after?.measure_time, "после 15:00");
  assert.notEqual(after?.formatted_card_text, "old card");
  assert.match(after?.formatted_card_text ?? "", /^\*На 18 июля\* после 15:00 ❗$/m);
  assert.doesNotMatch(after?.formatted_card_text ?? "", /^\*На 16 июля\*/m);
  assert.match(after?.formatted_card_text ?? "", /_"Snapshot Salon"_/);
  assert.match(after?.formatted_card_text ?? "", /директор: \+7-999-123-45-67 Олег/);
  assert.match(after?.formatted_card_text ?? "", /Лифтовой холл \+ подъезд \+ паркинг 1000₽/);

  assert.equal(after?.salon_name_snapshot, before?.salon_name_snapshot);
  assert.equal(after?.salon_email_snapshot, before?.salon_email_snapshot);
  assert.equal(after?.manager_name_snapshot, before?.manager_name_snapshot);
  assert.equal(after?.manager_phone_snapshot, before?.manager_phone_snapshot);
  assert.equal(after?.base_price, before?.base_price);
  assert.equal(after?.address_normalized_snapshot, before?.address_normalized_snapshot);
  assert.deepEqual(itemsAfter, itemsBefore);

  assert.equal(history.length, 1);
  assert.equal(history[0]?.event_type, "rescheduled");
  assert.equal(history[0]?.from_status_code, "awaiting_coordination");
  assert.equal(history[0]?.to_status_code, "awaiting_coordination");
  assert.equal(history[0]?.previous_measure_date, "16 июля");
  assert.equal(history[0]?.previous_measure_time, "утром");
  assert.equal(history[0]?.new_measure_date, "18 июля");
  assert.equal(history[0]?.new_measure_time, "после 15:00");
  assert.equal(history[0]?.actor_source, actor.source);
  assert.equal(history[0]?.actor_external_id, actor.externalId);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "awaiting_coordination",
    measureDate: "16 июля",
    measureTime: "утром"
  });

  insertOrderItem(db, orderId, {
    itemType: "шкаф"
  });

  const result = service.rescheduleOrder({
    orderId,
    newMeasureDate: "18 июля",
    newMeasureTime: null,
    actor
  });
  const order = orderRepository.getOrderById(orderId);
  const history = historyRepository.listByOrderId(orderId);

  assert.deepEqual(result, {
    status: "success",
    orderId,
    previousMeasureDate: "16 июля",
    previousMeasureTime: "утром",
    newMeasureDate: "18 июля",
    newMeasureTime: undefined
  });
  assert.equal(order?.measure_date, "18 июля");
  assert.equal(order?.measure_time, undefined);
  assert.match(order?.formatted_card_text ?? "", /^\*На 18 июля\*$/m);
  assert.equal(history[0]?.new_measure_time, undefined);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "confirmed",
    measureDate: "16 июля",
    measureTime: "утром",
    formattedCardText: "old card",
    modifyDatetime: "2026-10-10T10:00:00.000Z"
  });
  const before = orderRepository.getOrderById(orderId);

  const result = service.rescheduleOrder({
    orderId,
    newMeasureDate: "18 июля",
    newMeasureTime: "после 15:00",
    actor
  });
  const after = orderRepository.getOrderById(orderId);

  assert.deepEqual(result, {
    status: "transition_not_allowed",
    orderId,
    currentStatus: "confirmed"
  });
  assert.deepEqual(after, before);
  assert.equal(historyRepository.listByOrderId(orderId).length, 0);
});

withWorkflowContext(({ db, orderRepository, historyRepository, service }) => {
  const orderId = insertOrder(db, {
    status: "awaiting_coordination",
    measureDate: "16 июля",
    measureTime: "10:00"
  });

  insertOrderItem(db, orderId, {
    itemType: "кухня"
  });

  const firstResult = service.rescheduleOrder({
    orderId,
    newMeasureDate: "18 июля",
    newMeasureTime: "12:00",
    actor
  });
  const secondResult = service.rescheduleOrder({
    orderId,
    newMeasureDate: "20 июля",
    newMeasureTime: "14:00",
    actor
  });
  const history = historyRepository.listByOrderId(orderId);

  assert.deepEqual(firstResult, {
    status: "success",
    orderId,
    previousMeasureDate: "16 июля",
    previousMeasureTime: "10:00",
    newMeasureDate: "18 июля",
    newMeasureTime: "12:00"
  });
  assert.deepEqual(secondResult, {
    status: "success",
    orderId,
    previousMeasureDate: "18 июля",
    previousMeasureTime: "12:00",
    newMeasureDate: "20 июля",
    newMeasureTime: "14:00"
  });
  assert.deepEqual(
    history.map((event) => ({
      previousMeasureDate: event.previous_measure_date,
      previousMeasureTime: event.previous_measure_time,
      newMeasureDate: event.new_measure_date,
      newMeasureTime: event.new_measure_time
    })),
    [
      {
        previousMeasureDate: "16 июля",
        previousMeasureTime: "10:00",
        newMeasureDate: "18 июля",
        newMeasureTime: "12:00"
      },
      {
        previousMeasureDate: "18 июля",
        previousMeasureTime: "12:00",
        newMeasureDate: "20 июля",
        newMeasureTime: "14:00"
      }
    ]
  );
});

withWorkflowContext(({ db, orderRepository, historyRepository }) => {
  const throwingHistoryRepository = createThrowingHistoryRepository(historyRepository);
  const service = createOrderWorkflowService({
    db,
    orderRepository,
    orderStatusHistoryRepository: throwingHistoryRepository
  });
  const orderId = insertOrder(db, {
    status: "awaiting_coordination",
    modifyDatetime: "2026-10-10T10:00:00.000Z"
  });

  assert.throws(() => {
    service.confirmOrder({ orderId, actor });
  }, /forced history failure/);

  const order = orderRepository.getOrderById(orderId);

  assert.equal(order?.status, "awaiting_coordination");
  assert.equal(order?.modify_datetime, "2026-10-10T10:00:00.000Z");
  assert.equal(historyRepository.listByOrderId(orderId).length, 0);
});

withWorkflowContext(({ db, orderRepository, historyRepository }) => {
  const throwingHistoryRepository = createThrowingHistoryRepository(historyRepository);
  const service = createOrderWorkflowService({
    db,
    orderRepository,
    orderStatusHistoryRepository: throwingHistoryRepository
  });
  const orderId = insertOrder(db, {
    status: "awaiting_coordination",
    measureDate: "16 июля",
    measureTime: "утром",
    formattedCardText: "old card",
    modifyDatetime: "2026-10-10T10:00:00.000Z"
  });

  insertOrderItem(db, orderId, {
    itemType: "кухня"
  });

  assert.throws(() => {
    service.rescheduleOrder({
      orderId,
      newMeasureDate: "18 июля",
      newMeasureTime: "после 15:00",
      actor
    });
  }, /forced history failure/);

  const order = orderRepository.getOrderById(orderId);

  assert.equal(order?.status, "awaiting_coordination");
  assert.equal(order?.measure_date, "16 июля");
  assert.equal(order?.measure_time, "утром");
  assert.equal(order?.formatted_card_text, "old card");
  assert.equal(order?.modify_datetime, "2026-10-10T10:00:00.000Z");
  assert.equal(historyRepository.listByOrderId(orderId).length, 0);
});

interface WorkflowContext {
  db: Database.Database;
  orderRepository: OrderRepository;
  historyRepository: OrderStatusHistoryRepository;
  service: OrderWorkflowService;
}

function withWorkflowContext(run: (context: WorkflowContext) => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zamerflow-workflow-service-"));
  const db = new Database(path.join(tempDir, "test.sqlite"));

  db.pragma("foreign_keys = ON");

  try {
    runMigrations(db, migrationsDir);

    const orderRepository = createOrderRepository(db);
    const historyRepository = createOrderStatusHistoryRepository(db);
    const service = createOrderWorkflowService({
      db,
      orderRepository,
      orderStatusHistoryRepository: historyRepository
    });

    run({
      db,
      orderRepository,
      historyRepository,
      service
    });
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function insertOrder(
  db: Database.Database,
  params: {
    status?: string;
    modifyDatetime?: string;
    measureDate?: string;
    measureTime?: string;
    formattedCardText?: string;
    salonNameSnapshot?: string;
    salonEmailSnapshot?: string;
    managerNameSnapshot?: string;
    managerPhoneSnapshot?: string;
    managerRoleSnapshot?: string;
    addressNormalizedSnapshot?: string;
    addressBeltwayHit?: string;
    basePrice?: number;
    extraPriceMin?: number;
    extraPriceMax?: number;
    mileagePricePerKm?: number;
  } = {}
): number {
  const createDatetime = "2026-10-10T09:00:00.000Z";
  const modifyDatetime = params.modifyDatetime ?? createDatetime;
  const result = db
    .prepare(
      `
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
        address_normalized_snapshot,
        address_geo_source,
        address_beltway_hit,
        address_beltway_distance_km,
        address_geo_qc_geo,
        address_geo_qc,
        address_geo_qc_house,
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
        has_photos,
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
        @addressNormalizedSnapshot,
        @addressGeoSource,
        @addressBeltwayHit,
        @addressBeltwayDistanceKm,
        @addressGeoQcGeo,
        @addressGeoQc,
        @addressGeoQcHouse,
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
        @hasPhotos,
        @formattedCardText,
        @telegramUserId
      )
      `
    )
    .run({
      createDatetime,
      modifyDatetime,
      status: params.status ?? "awaiting_coordination",
      salonId: null,
      managerId: null,
      salonNameSnapshot: params.salonNameSnapshot ?? "Тестовый салон",
      salonEmailSnapshot: params.salonEmailSnapshot ?? "salon@example.com",
      managerNameSnapshot: params.managerNameSnapshot ?? "Менеджер",
      managerPhoneSnapshot: params.managerPhoneSnapshot ?? "+7-900-000-00-00",
      managerRoleSnapshot: params.managerRoleSnapshot ?? "manager",
      measureDate: params.measureDate ?? "16 июля",
      measureTime: params.measureTime ?? null,
      address: "Москва, Тестовая улица, 1",
      addressNormalizedSnapshot: params.addressNormalizedSnapshot ?? null,
      addressGeoSource: params.addressNormalizedSnapshot ? "dadata" : null,
      addressBeltwayHit: params.addressBeltwayHit ?? "IN_MKAD",
      addressBeltwayDistanceKm: params.addressBeltwayHit === "OUT_MKAD" ? 12.4 : null,
      addressGeoQcGeo: 0,
      addressGeoQc: 0,
      addressGeoQcHouse: 0,
      metro: "Тестовая",
      clientContact: "+7-900-111-22-33 Клиент",
      paymentBy: "клиентом",
      basePrice: params.basePrice ?? 2500,
      extraPriceMin: params.extraPriceMin ?? 1000,
      extraPriceMax: params.extraPriceMax ?? 1500,
      mileagePricePerKm: params.mileagePricePerKm ?? null,
      finalPrice: null,
      extraCharges: "без особенностей",
      comment: "тестовый комментарий",
      hasPlan: null,
      hasPhotos: 0,
      formattedCardText: params.formattedCardText ?? "old card",
      telegramUserId: null
    });

  return Number(result.lastInsertRowid);
}

function insertOrderItem(
  db: Database.Database,
  orderId: number,
  params: {
    itemType: string;
    itemNameSnapshot?: string;
    unitPriceSnapshot?: number;
    priceTextSnapshot?: string;
    cardTextSnapshot?: string;
    isAutoAdded?: boolean;
    source?: string;
    sortOrder?: number;
  }
): void {
  db.prepare(
    `
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
    `
  ).run({
    orderId,
    createDatetime: "2026-10-10T09:00:00.000Z",
    modifyDatetime: "2026-10-10T09:00:00.000Z",
    itemType: params.itemType,
    quantity: 1,
    comment: null,
    itemNameSnapshot: params.itemNameSnapshot ?? null,
    unitPriceSnapshot: params.unitPriceSnapshot ?? null,
    priceTextSnapshot: params.priceTextSnapshot ?? null,
    cardTextSnapshot: params.cardTextSnapshot ?? null,
    isAutoAdded: params.isAutoAdded ? 1 : 0,
    source: params.source ?? "user_input",
    sortOrder: params.sortOrder ?? 10
  });
}

function countHistory(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM order_status_history").get() as {
    count: number;
  };

  return Number(row.count);
}

function createThrowingHistoryRepository(
  repository: OrderStatusHistoryRepository
): OrderStatusHistoryRepository {
  return {
    recordEvent(event: RecordOrderStatusHistoryEventParams) {
      repository.recordEvent(event);
      throw new Error("forced history failure");
    },
    listByOrderId(orderId) {
      return repository.listByOrderId(orderId);
    }
  };
}
