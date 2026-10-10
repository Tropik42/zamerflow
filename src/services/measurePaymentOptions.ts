// Файл хранит варианты оплаты замера и форматирование оплаты для карточки.

import type { PaymentBy } from "../types/order.js";

export interface MeasurePaymentOption {
  key: string;
  value: PaymentBy;
  buttonLabel: string;
  cardLabel: string;
}

export const measurePaymentOptions: MeasurePaymentOption[] = [
  {
    key: "client",
    value: "клиентом",
    buttonLabel: "клиент",
    cardLabel: "клиентом"
  },
  {
    key: "salon",
    value: "салоном",
    buttonLabel: "салон",
    cardLabel: "салоном"
  },
  {
    key: "deposit",
    value: "депозит",
    buttonLabel: "депозит",
    cardLabel: "депозитом"
  },
  {
    key: "ipToSelfEmployed",
    value: "с ИП на самозанятого",
    buttonLabel: "с ИП на самозанятого",
    cardLabel: "с ИП на самозанятого"
  }
];

// Ищет вариант оплаты по callback-key из inline-кнопки.
export function getMeasurePaymentOptionByKey(key: string): MeasurePaymentOption | undefined {
  return measurePaymentOptions.find((option) => option.key === key);
}

// Проверяет, что строка является допустимым доменным значением оплаты.
export function isMeasurePaymentValue(value: string): value is PaymentBy {
  return measurePaymentOptions.some((option) => option.value === value);
}

// Форматирует значение оплаты в человеческий текст для карточки заявки.
export function formatMeasurePaymentForCard(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return measurePaymentOptions.find((option) => option.value === value)?.cardLabel ?? value;
}
