// Файл выполняет точечные Telegram-операции dispatch-чата после workflow-действий.

import type { Context, Telegraf } from "telegraf";

export interface WorkflowDispatchService {
  updateDispatchCard(params: UpdateDispatchCardParams): Promise<WorkflowDispatchCardUpdateResult>;
  sendRescheduleMessage(
    params: SendDispatchRescheduleMessageParams
  ): Promise<WorkflowDispatchMessageResult>;
}

export interface UpdateDispatchCardParams {
  chatId: string;
  messageId: number;
  text: string;
}

export interface SendDispatchRescheduleMessageParams {
  chatId: string;
  text: string;
}

export type WorkflowDispatchErrorCode =
  | "TELEGRAM_FORBIDDEN"
  | "TELEGRAM_BAD_REQUEST"
  | "TELEGRAM_CHAT_NOT_FOUND"
  | "TELEGRAM_MESSAGE_NOT_FOUND"
  | "TELEGRAM_MESSAGE_NOT_MODIFIED"
  | "UNKNOWN_TELEGRAM_ERROR";

export type WorkflowDispatchCardUpdateResult =
  | {
      status: "updated";
    }
  | {
      status: "failed";
      error: WorkflowDispatchErrorCode;
    };

export type WorkflowDispatchMessageResult =
  | {
      status: "sent";
      messageId?: number;
    }
  | {
      status: "failed";
      error: WorkflowDispatchErrorCode;
    };

// Создаёт adapter для редактирования существующей карточки и отправки короткого сообщения переноса.
export function createTelegramWorkflowDispatchService(
  bot: Telegraf<Context>
): WorkflowDispatchService {
  return {
    async updateDispatchCard(params) {
      try {
        await bot.telegram.editMessageText(
          params.chatId,
          params.messageId,
          undefined,
          params.text
        );

        return {
          status: "updated"
        };
      } catch (error) {
        return {
          status: "failed",
          error: safeTelegramErrorCode(error)
        };
      }
    },
    async sendRescheduleMessage(params) {
      try {
        const message = await bot.telegram.sendMessage(params.chatId, params.text);

        return {
          status: "sent",
          messageId: extractMessageId(message)
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

// Преобразует ошибку Telegram в стабильный код для post-commit side effects.
function safeTelegramErrorCode(error: unknown): WorkflowDispatchErrorCode {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden|bot was blocked|403/i.test(message)) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (/message is not modified/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_MODIFIED";
  }

  if (/message to edit not found|message not found/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_FOUND";
  }

  if (/chat not found|peer_id_invalid/i.test(message)) {
    return "TELEGRAM_CHAT_NOT_FOUND";
  }

  if (/bad request|400/i.test(message)) {
    return "TELEGRAM_BAD_REQUEST";
  }

  return "UNKNOWN_TELEGRAM_ERROR";
}

// Достаёт message_id из результата Telegram API без привязки к конкретному типу сообщения.
function extractMessageId(message: unknown): number | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const candidate = message as Record<string, unknown>;
  return typeof candidate.message_id === "number" ? candidate.message_id : undefined;
}
