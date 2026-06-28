import type { AppDatabase } from "./db.js";
import type { SalonRequiredItem } from "../types/order.js";

export interface SalonRequiredItemFormParams {
  salon_id: number;
  item_type: string;
  item_name: string;
  unit_price?: number;
  price_text?: string;
  card_text?: string;
  quantity: number;
  is_required: number;
  auto_add_to_order: number;
  comment?: string;
  sort_order: number;
  is_active: number;
}

export interface SalonRequiredItemRepository {
  getActiveRequiredItemsBySalonId(salonId: number): SalonRequiredItem[];
  getRequiredItemsBySalonId(salonId: number): SalonRequiredItem[];
  createRequiredItem(params: SalonRequiredItemFormParams): number;
  updateRequiredItem(id: number, params: SalonRequiredItemFormParams): void;
  disableRequiredItem(id: number): void;
}

export function createSalonRequiredItemRepository(db: AppDatabase): SalonRequiredItemRepository {
  const selectFields = `
    SELECT
      salon_required_item_id,
      salon_id,
      create_datetime,
      modify_datetime,
      item_type,
      item_name,
      unit_price,
      price_text,
      card_text,
      quantity,
      is_required,
      auto_add_to_order,
      comment,
      sort_order,
      is_active
    FROM salon_required_items
  `;

  const selectActiveBySalonId = db.prepare(`
    ${selectFields}
    WHERE salon_id = ? AND is_active = 1 AND auto_add_to_order = 1
    ORDER BY sort_order ASC, salon_required_item_id ASC
  `);

  const selectBySalonId = db.prepare(`
    ${selectFields}
    WHERE salon_id = ?
    ORDER BY sort_order ASC, salon_required_item_id ASC
  `);

  const insertRequiredItem = db.prepare(`
    INSERT INTO salon_required_items (
      salon_id,
      create_datetime,
      modify_datetime,
      item_type,
      item_name,
      unit_price,
      price_text,
      card_text,
      quantity,
      is_required,
      auto_add_to_order,
      comment,
      sort_order,
      is_active
    ) VALUES (
      @salonId,
      datetime('now'),
      datetime('now'),
      @itemType,
      @itemName,
      @unitPrice,
      @priceText,
      @cardText,
      @quantity,
      @isRequired,
      @autoAddToOrder,
      @comment,
      @sortOrder,
      @isActive
    )
  `);

  const updateRequiredItem = db.prepare(`
    UPDATE salon_required_items
    SET
      salon_id = @salonId,
      modify_datetime = datetime('now'),
      item_type = @itemType,
      item_name = @itemName,
      unit_price = @unitPrice,
      price_text = @priceText,
      card_text = @cardText,
      quantity = @quantity,
      is_required = @isRequired,
      auto_add_to_order = @autoAddToOrder,
      comment = @comment,
      sort_order = @sortOrder,
      is_active = @isActive
    WHERE salon_required_item_id = @id
  `);

  const disableRequiredItem = db.prepare(`
    UPDATE salon_required_items
    SET
      is_active = 0,
      modify_datetime = datetime('now')
    WHERE salon_required_item_id = ?
  `);

  return {
    getActiveRequiredItemsBySalonId(salonId) {
      return selectActiveBySalonId.all(salonId).map(mapSalonRequiredItemRow);
    },
    getRequiredItemsBySalonId(salonId) {
      return selectBySalonId.all(salonId).map(mapSalonRequiredItemRow);
    },
    createRequiredItem(params) {
      const result = insertRequiredItem.run(toSqlParams(params));
      return Number(result.lastInsertRowid);
    },
    updateRequiredItem(id, params) {
      updateRequiredItem.run({
        ...toSqlParams(params),
        id
      });
    },
    disableRequiredItem(id) {
      disableRequiredItem.run(id);
    }
  };
}

function mapSalonRequiredItemRow(row: unknown): SalonRequiredItem {
  const item = row as Record<string, unknown>;

  return {
    salon_required_item_id: Number(item.salon_required_item_id),
    salon_id: Number(item.salon_id),
    create_datetime: String(item.create_datetime),
    modify_datetime: String(item.modify_datetime),
    item_type: String(item.item_type),
    item_name: String(item.item_name),
    unit_price: optionalNumber(item.unit_price),
    price_text: optionalString(item.price_text),
    card_text: optionalString(item.card_text),
    quantity: Number(item.quantity),
    is_required: Number(item.is_required),
    auto_add_to_order: Number(item.auto_add_to_order),
    comment: optionalString(item.comment),
    sort_order: Number(item.sort_order),
    is_active: Number(item.is_active)
  };
}

function toSqlParams(params: SalonRequiredItemFormParams) {
  return {
    salonId: params.salon_id,
    itemType: params.item_type,
    itemName: params.item_name,
    unitPrice: params.unit_price ?? null,
    priceText: params.price_text ?? null,
    cardText: params.card_text ?? null,
    quantity: params.quantity,
    isRequired: params.is_required,
    autoAddToOrder: params.auto_add_to_order,
    comment: params.comment ?? null,
    sortOrder: params.sort_order,
    isActive: params.is_active
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
