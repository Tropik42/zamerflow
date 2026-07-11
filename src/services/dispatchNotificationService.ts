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
    `🆕 Новая заявка #${params.orderId}`,
    "",
    `Салон: ${valueOrDash(params.salonName)}`,
    `Менеджер: ${valueOrDash(params.managerName)}`,
    `Дата замера: ${valueOrDash(params.measureDate)}`,
    "Статус: принята менеджером"
  ].join("\n");
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}
