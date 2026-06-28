import type { OrderDraft } from "../types/order.js";
import { formatMeasurePaymentForCard } from "./measurePaymentOptions.js";
import { formatMeasureServiceItemForCard } from "./measureServiceItems.js";

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
 * @returns {string} Строка вида "2500₽" или "-".
 */
function moneyOrDash(value: number | undefined): string {
  return value === undefined ? "-" : `${value}₽`;
}

function managerText(draft: OrderDraft): string | undefined {
  if (draft.managerNameSnapshot && draft.managerPhoneSnapshot) {
    return `${draft.managerNameSnapshot}, ${draft.managerPhoneSnapshot}`;
  }

  return draft.managerNameSnapshot ?? draft.managerContact;
}

function managerLabel(draft: OrderDraft): string {
  return draft.managerRoleSnapshot === "director" ? "директор" : "менеджер";
}

function addressText(draft: OrderDraft): string {
  const address = valueOrDash(draft.address);
  const metro = draft.metro?.trim();

  if (!metro) {
    return address;
  }

  return `ст. м. "${metro}", ${address}`;
}

function paymentText(draft: OrderDraft): string {
  const paymentBy = valueOrDash(formatMeasurePaymentForCard(draft.paymentBy));
  return `Оплата ${paymentBy}.`;
}

/**
 * Собирает рабочий текст карточки заявки из черновика.
 * @param {OrderDraft} draft Черновик заявки из Telegram-сценария.
 * @returns {string} Отформатированная карточка заявки.
 */
export function formatOrderCard(draft: OrderDraft): string {
  const userServiceItems = draft.serviceItems.filter((item) => !item.isAutoAdded);
  const autoAddedItems = draft.serviceItems.filter((item) => item.isAutoAdded);
  const firstServiceItem = userServiceItems[0]?.type;
  const extraServiceItemsText = userServiceItems
    .slice(1)
    .map((item) => `- ${formatMeasureServiceItemForCard(item.type)}`)
    .join("\n");
  const autoAddedItemsText = autoAddedItems
    .map((item) => `🟣 ${item.itemNameSnapshot ?? item.type}`)
    .join("\n");
  const autoAddedTariffText = autoAddedItems
    .map((item) => item.cardTextSnapshot)
    .filter((line): line is string => Boolean(line))
    .join("\n");
  const extraPriceText =
    draft.extraPriceMin !== undefined || draft.extraPriceMax !== undefined
      ? `${moneyOrDash(draft.extraPriceMin)}-${moneyOrDash(draft.extraPriceMax)}`
      : "-";

  const lines = [
    `*На ${valueOrDash(draft.measureDate)}*`,
    `_"${valueOrDash(draft.salonNameSnapshot)}"_`,
    draft.salonEmailSnapshot ? `💌 ${draft.salonEmailSnapshot}` : undefined,
    `${managerLabel(draft)}: ${valueOrDash(managerText(draft))}`,
    "",
    `📍 ${addressText(draft)}`,
    `📞 ${valueOrDash(draft.clientContact)}`,
    `✏️ Замер ${firstServiceItem ? formatMeasureServiceItemForCard(firstServiceItem) : "-"}`,
    extraServiceItemsText || undefined,
    autoAddedItemsText || undefined,
    "",
    `💰 ${paymentText(draft)}`,
    `Стартовая стоимость *от ${moneyOrDash(draft.basePrice)}*.`,
    `Доппозиции *по ${extraPriceText}*.`,
    draft.mileagePricePerKm !== undefined
      ? `Километраж *от МКАД* *${draft.mileagePricePerKm}₽/км*.`
      : undefined,
    autoAddedTariffText || undefined,
    draft.extraCharges ? `*Доплаты / особенности:* ${draft.extraCharges}` : undefined,
    "",
    draft.comment ? `*Комментарий:* ${draft.comment}` : undefined
  ];

  return lines.filter((line) => line !== undefined).join("\n");
}
