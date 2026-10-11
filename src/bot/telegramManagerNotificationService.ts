// Файл реализует отправку Telegram-уведомлений менеджеру о событиях workflow заявки.

import type { Context, Telegraf } from "telegraf";
import type {
  ManagerNotificationService,
  ManagerWorkflowNotification
} from "../services/managerNotificationService.js";

export function createTelegramManagerNotificationService(
  bot: Telegraf<Context>
): ManagerNotificationService {
  return {
    async sendWorkflowNotification(notification) {
      if (!notification.recipientExternalId) {
        return {
          status: "failed",
          error: "RECIPIENT_EXTERNAL_ID_MISSING"
        };
      }

      try {
        await bot.telegram.sendMessage(
          notification.recipientExternalId,
          formatManagerWorkflowNotification(notification)
        );

        return {
          status: "sent"
        };
      } catch (error) {
        return {
          status: "failed",
          error: safeTelegramErrorCode(error)
        };
      }
    }
  };
}

// Форматирует текст уведомления менеджеру в зависимости от типа workflow-события.
export function formatManagerWorkflowNotification(
  notification: ManagerWorkflowNotification
): string {
  if (notification.type === "order_confirmed") {
    return [
      `✅ Заявка #${notification.orderId} согласована.`,
      "",
      formatConfirmedMeasureText(notification.measureDate, notification.measureTime)
    ].join("\n");
  }

  return [
    `📅 Заявка #${notification.orderId} перенесена.`,
    "",
    formatRescheduledMeasureText(notification.newMeasureDate, notification.newMeasureTime),
    "",
    "Информацию о согласовании сообщим дополнительно."
  ].join("\n");
}

// Форматирует сообщение о согласованной дате с учётом отсутствующего времени или даты.
function formatConfirmedMeasureText(measureDate?: string, measureTime?: string): string {
  if (measureDate && measureTime) {
    return `Замер согласован на ${measureDate}, ${measureTime}.`;
  }

  if (measureDate) {
    return `Замер согласован на ${measureDate}.`;
  }

  if (measureTime) {
    return `Замер согласован, ${measureTime}.`;
  }

  return "Замер согласован.";
}

// Форматирует сообщение о новой дате после переноса заявки.
function formatRescheduledMeasureText(newMeasureDate: string, newMeasureTime?: string): string {
  if (newMeasureTime) {
    return `Новая дата замера: ${newMeasureDate}, ${newMeasureTime}.`;
  }

  return `Новая дата замера: ${newMeasureDate}.`;
}

// Преобразует ошибку Telegram в стабильный код для логов и тестов.
function safeTelegramErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden|bot was blocked|403/i.test(message)) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (/chat not found|peer_id_invalid/i.test(message)) {
    return "TELEGRAM_CHAT_NOT_FOUND";
  }

  if (/bad request|400/i.test(message)) {
    return "TELEGRAM_BAD_REQUEST";
  }

  return "UNKNOWN_TELEGRAM_ERROR";
}
