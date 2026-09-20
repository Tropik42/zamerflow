import assert from "node:assert/strict";
import { formatOrderCard } from "../src/bot/formatOrderCard.js";
import type { OrderDraft } from "../src/types/order.js";

const baseDraft: OrderDraft = {
  measureDate: "14 июля",
  salonNameSnapshot: "Тестовый салон",
  salonEmailSnapshot: "salon@example.com",
  managerNameSnapshot: "Олег",
  managerPhoneSnapshot: "+7-999-123-45-67",
  address: "Москва, Тестовая улица, 1",
  metro: "Тестовая",
  clientContact: "+7-900-000-00-00 Клиент",
  serviceItems: [{ type: "кухня", quantity: 1 }],
  paymentBy: "клиентом",
  basePrice: 2500,
  extraPriceMin: 1000,
  extraPriceMax: 1500,
  mileagePricePerKm: 60,
  addressBeltwayHit: "OUT_MKAD"
};

const formattedCard = formatOrderCard(baseDraft);

assert.match(formattedCard, /Стартовая стоимость \*от 2,500₽\*\./);
assert.match(formattedCard, /Доппозиции \*по 1,000₽-1,500₽\*\./);
assert.match(formattedCard, /Километраж \*от МКАД\* \*60₽\/км\*\./);

const highBasePriceCard = formatOrderCard({
  ...baseDraft,
  basePrice: 12500,
  extraPriceMin: undefined,
  extraPriceMax: undefined,
  mileagePricePerKm: undefined
});

assert.match(highBasePriceCard, /Стартовая стоимость \*от 12,500₽\*\./);
assert.match(highBasePriceCard, /Доппозиции \*по -\*\./);
assert.doesNotMatch(highBasePriceCard, /Километраж/);

const missingPriceCard = formatOrderCard({
  ...baseDraft,
  basePrice: undefined,
  extraPriceMin: 1000,
  extraPriceMax: undefined,
  mileagePricePerKm: undefined
});

assert.match(missingPriceCard, /Стартовая стоимость \*от -\*\./);
assert.match(missingPriceCard, /Доппозиции \*по 1,000₽--\*\./);

const autoAddedSnapshotCard = formatOrderCard({
  ...baseDraft,
  serviceItems: [
    { type: "кухня", quantity: 1 },
    {
      type: "required",
      quantity: 1,
      itemNameSnapshot: "Лифтовой холл + подъезд + паркинг",
      cardTextSnapshot: "Лифтовой холл + подъезд + паркинг 1000₽",
      isAutoAdded: true,
      source: "salon_required_item"
    }
  ]
});

assert.match(autoAddedSnapshotCard, /Лифтовой холл \+ подъезд \+ паркинг 1000₽/);
