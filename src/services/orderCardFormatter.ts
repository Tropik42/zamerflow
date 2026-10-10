import type { OrderDraft, OrderItemRecord, OrderRecord } from "../types/order.js";
import { formatMeasurePaymentForCard } from "./measurePaymentOptions.js";
import { negotiatedMeasureDateText } from "./measureDate.js";
import {
  formatMeasureServiceItemForCardFirst,
  formatMeasureServiceItemForCardList
} from "./measureServiceItems.js";

export interface OrderCardInput {
  salonNameSnapshot?: string;
  salonEmailSnapshot?: string;
  managerNameSnapshot?: string;
  managerPhoneSnapshot?: string;
  managerRoleSnapshot?: string;
  managerContact?: string;
  clientContact?: string;
  address?: string;
  metro?: string;
  measureDate?: string;
  measureTime?: string;
  serviceItems: readonly OrderCardServiceItemInput[];
  paymentBy?: string;
  basePrice?: number;
  extraPriceMin?: number;
  extraPriceMax?: number;
  mileagePricePerKm?: number;
  addressBeltwayHit?: string;
  extraCharges?: string;
  comment?: string;
}

export interface OrderCardServiceItemInput {
  type: string;
  quantity: number;
  comment?: string;
  itemNameSnapshot?: string;
  unitPriceSnapshot?: number;
  priceTextSnapshot?: string;
  cardTextSnapshot?: string;
  isAutoAdded?: boolean;
  source?: string;
  sortOrder?: number;
}

/**
 * Собирает рабочий текст карточки заявки из черновика.
 * @param {OrderDraft} draft Черновик заявки из Telegram-сценария.
 * @returns {string} Отформатированная карточка заявки.
 */
export function formatOrderCard(draft: OrderDraft): string {
  return formatOrderCardInput({
    salonNameSnapshot: draft.salonNameSnapshot,
    salonEmailSnapshot: draft.salonEmailSnapshot,
    managerNameSnapshot: draft.managerNameSnapshot,
    managerPhoneSnapshot: draft.managerPhoneSnapshot,
    managerRoleSnapshot: draft.managerRoleSnapshot,
    managerContact: draft.managerContact,
    clientContact: draft.clientContact,
    address: draft.address,
    metro: draft.metro,
    measureDate: draft.measureDate,
    measureTime: draft.measureTime,
    serviceItems: draft.serviceItems,
    paymentBy: draft.paymentBy,
    basePrice: draft.basePrice,
    extraPriceMin: draft.extraPriceMin,
    extraPriceMax: draft.extraPriceMax,
    mileagePricePerKm: draft.mileagePricePerKm,
    addressBeltwayHit: draft.addressBeltwayHit,
    extraCharges: draft.extraCharges,
    comment: draft.comment
  });
}

export function formatOrderRecordCard(
  order: OrderRecord,
  orderItems: readonly OrderItemRecord[]
): string {
  return formatOrderCardInput({
    salonNameSnapshot: order.salon_name_snapshot,
    salonEmailSnapshot: order.salon_email_snapshot,
    managerNameSnapshot: order.manager_name_snapshot,
    managerPhoneSnapshot: order.manager_phone_snapshot,
    managerRoleSnapshot: order.manager_role_snapshot,
    clientContact: order.client_contact,
    address: order.address,
    metro: order.metro,
    measureDate: order.measure_date,
    measureTime: order.measure_time,
    serviceItems: orderItems.map(mapOrderItemRecordToCardInput),
    paymentBy: order.payment_by,
    basePrice: order.base_price,
    extraPriceMin: order.extra_price_min,
    extraPriceMax: order.extra_price_max,
    mileagePricePerKm: order.mileage_price_per_km,
    addressBeltwayHit: order.address_beltway_hit,
    extraCharges: order.extra_charges,
    comment: order.comment
  });
}

export function formatOrderCardInput(input: OrderCardInput): string {
  const userServiceItems = input.serviceItems.filter((item) => !item.isAutoAdded);
  const autoAddedItems = input.serviceItems.filter((item) => item.isAutoAdded);
  const firstServiceItem = userServiceItems[0]?.type;
  const extraServiceItemsText = userServiceItems
    .slice(1)
    .map((item) => `- ${formatMeasureServiceItemForCardList(item.type)}`)
    .join("\n");
  const autoAddedItemsText = autoAddedItems
    .map((item) => `🟣 ${item.itemNameSnapshot ?? item.type}`)
    .join("\n");
  const autoAddedTariffText = autoAddedItems
    .map((item) => item.cardTextSnapshot)
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const extraPriceText =
    input.extraPriceMin !== undefined || input.extraPriceMax !== undefined
      ? `${moneyOrDash(input.extraPriceMin)}-${moneyOrDash(input.extraPriceMax)}`
      : "-";

  const lines = [
    titleText(input),
    `_"${valueOrDash(input.salonNameSnapshot)}"_`,
    input.salonEmailSnapshot ? `💌 ${input.salonEmailSnapshot}` : undefined,
    `${managerLabel(input)}: ${valueOrDash(managerText(input))}`,
    "",
    `📍 ${addressText(input)}`,
    `📞 ${valueOrDash(input.clientContact)}`,
    `✏️ Замер ${firstServiceItem ? formatMeasureServiceItemForCardFirst(firstServiceItem) : "-"}`,
    extraServiceItemsText || undefined,
    autoAddedItemsText || undefined,
    "",
    `💰 ${paymentText(input)}`,
    `Стартовая стоимость *от ${moneyOrDash(input.basePrice)}*.`,
    `Доппозиции *по ${extraPriceText}*.`,
    input.addressBeltwayHit === "OUT_MKAD" && input.mileagePricePerKm !== undefined
      ? `Километраж *от МКАД* *${moneyOrDash(input.mileagePricePerKm)}/км*.`
      : undefined,
    autoAddedTariffText || undefined,
    input.extraCharges ? `*Доплаты / особенности:* ${input.extraCharges}` : undefined,
    "",
    input.comment ? `*Комментарий:* ${input.comment}` : undefined
  ];

  return lines.filter((line) => line !== undefined).join("\n");
}

function mapOrderItemRecordToCardInput(item: OrderItemRecord): OrderCardServiceItemInput {
  return {
    type: item.item_name_snapshot ?? item.item_type,
    quantity: item.quantity,
    comment: item.comment,
    itemNameSnapshot: item.item_name_snapshot,
    unitPriceSnapshot: item.unit_price_snapshot,
    priceTextSnapshot: item.price_text_snapshot,
    cardTextSnapshot: item.card_text_snapshot,
    isAutoAdded: item.is_auto_added === 1,
    source: item.source,
    sortOrder: item.sort_order
  };
}

/**
 * Возвращает строковое значение или прочерк для пустого поля.
 * @param {string | undefined} value Исходное значение.
 * @returns {string} Непустое значение или "-".
 */
function valueOrDash(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}

/**
 * Форматирует сумму в рублях или возвращает прочерк.
 * @param {number | undefined} value Сумма в рублях.
 * @returns {string} Строка вида "2,500₽" или "-".
 */
function moneyOrDash(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toLocaleString("en-US")}₽`;
}

function managerText(input: OrderCardInput): string | undefined {
  const managerPhone = input.managerPhoneSnapshot?.trim();
  const managerName = input.managerNameSnapshot?.trim();

  if (managerPhone || managerName) {
    return [managerPhone, managerName].filter((value): value is string => Boolean(value)).join(" ");
  }

  return input.managerContact;
}

function managerLabel(input: OrderCardInput): string {
  return input.managerRoleSnapshot === "director" ? "директор" : "менеджер";
}

function addressText(input: OrderCardInput): string {
  const address = valueOrDash(input.address);
  const metro = input.metro?.trim();

  if (!metro) {
    return address;
  }

  return `ст. м. "${metro}", ${address}`;
}

function paymentText(input: OrderCardInput): string {
  const paymentBy = valueOrDash(formatMeasurePaymentForCard(input.paymentBy));
  return `Оплата ${paymentBy}.`;
}

function titleText(input: OrderCardInput): string {
  const dateText = valueOrDash(input.measureDate);
  const timeText = input.measureTime?.trim();

  if (dateText === negotiatedMeasureDateText) {
    return timeText ? `*${dateText}* ${timeText} ❗` : `*${dateText}*`;
  }

  return timeText ? `*На ${dateText}* ${timeText} ❗` : `*На ${dateText}*`;
}
