import type { Context, Telegraf } from "telegraf";

export interface DispatchNotificationService {
  sendOrderCard(params: SendOrderCardParams): Promise<DispatchNotificationResult>;
}

export interface SendOrderCardParams {
  orderId: number;
  chatId: string;
  salonName?: string;
  managerName?: string;
  measureDate?: string;
  address?: string;
  addressNormalizedSnapshot?: string;
  addressBeltwayHit?: string;
  formattedCardText: string;
}

export interface DispatchNotificationResult {
  chatId: string;
  headerMessageId?: number;
  cardMessageId: number;
}

export function createDispatchNotificationService(
  bot: Telegraf<Context>
): DispatchNotificationService {
  return {
    async sendOrderCard(params) {
      const headerMessage = await bot.telegram.sendMessage(
        params.chatId,
        formatDispatchHeader(params)
      );
      const cardMessage = await bot.telegram.sendMessage(
        params.chatId,
        params.formattedCardText
      );

      return {
        chatId: params.chatId,
        headerMessageId: headerMessage.message_id,
        cardMessageId: cardMessage.message_id
      };
    }
  };
}

function formatDispatchHeader(params: SendOrderCardParams): string {
  return [
    "О Повелитель, поступила новая заявка!",
    "",
    `🆕 Заявка #${params.orderId}`,
    "",
    `Салон: ${valueOrDash(params.salonName)}`,
    `Менеджер: ${valueOrDash(params.managerName)}`,
    `Дата замера: ${valueOrDash(params.measureDate)}`,
    "Статус: принята менеджером",
    "",
    ...formatAddressBlock(params)
  ].join("\n");
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}

function formatAddressBlock(params: SendOrderCardParams): string[] {
  const locationText = formatBeltwayHit(params.addressBeltwayHit);
  const normalizedAddress = params.addressNormalizedSnapshot?.trim();

  if (normalizedAddress && locationText !== "Не определено") {
    return [
      `Адрес, введённый менеджером: "${valueOrDash(params.address)}"`,
      `Адрес определён как: "${normalizedAddress}"`,
      `Расположение: ${locationText}`
    ];
  }

  return [
    `Адрес, введённый менеджером: "${valueOrDash(params.address)}"`,
    "Адрес автоматически определить не удалось.",
    "Расположение: Не определено"
  ];
}

function formatBeltwayHit(value: string | undefined): string {
  switch (value) {
    case "IN_MKAD":
      return "Внутри МКАД";
    case "OUT_MKAD":
      return "За МКАД";
    case "IN_KAD":
      return "Внутри КАД";
    case "OUT_KAD":
      return "За КАД";
    case "UNKNOWN":
    default:
      return "Не определено";
  }
}
