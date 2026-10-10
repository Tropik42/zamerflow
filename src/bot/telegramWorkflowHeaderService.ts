import type { Context, Telegraf } from "telegraf";
import { createDispatchHeaderKeyboard } from "../services/dispatchNotificationService.js";

export interface WorkflowHeaderUpdateService {
  updateWorkflowHeader(params: UpdateWorkflowHeaderParams): Promise<WorkflowHeaderUpdateResult>;
}

export interface UpdateWorkflowHeaderParams {
  orderId: number;
  chatId: string;
  messageId: number;
  currentText?: string;
  statusText: string;
  measureDate?: string;
  controls: WorkflowHeaderControls;
}

export type WorkflowHeaderControls =
  | {
      type: "none";
    }
  | {
      type: "workflow";
      orderId: number;
    };

export type WorkflowHeaderUpdateResult =
  | {
      status: "updated";
    }
  | {
      status: "failed";
      error: string;
    };

export function createTelegramWorkflowHeaderService(
  bot: Telegraf<Context>
): WorkflowHeaderUpdateService {
  return {
    async updateWorkflowHeader(params) {
      const nextText = updateWorkflowHeaderText({
        currentText: params.currentText,
        statusText: params.statusText,
        measureDate: params.measureDate
      });

      try {
        await bot.telegram.editMessageText(
          params.chatId,
          params.messageId,
          undefined,
          nextText,
          createWorkflowHeaderReplyMarkup(params.controls)
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
    }
  };
}

export function updateWorkflowHeaderText(params: {
  currentText?: string;
  statusText: string;
  measureDate?: string;
}): string {
  const lines = params.currentText?.split("\n") ?? [];
  const withStatus = replaceOrAppendLine(lines, /^Статус:/, `Статус: ${params.statusText}`);

  if (params.measureDate !== undefined) {
    return replaceOrAppendLine(
      withStatus,
      /^Дата замера:/,
      `Дата замера: ${valueOrDash(params.measureDate)}`
    ).join("\n");
  }

  return withStatus.join("\n");
}

function createWorkflowHeaderReplyMarkup(controls: WorkflowHeaderControls) {
  if (controls.type === "workflow") {
    return createDispatchHeaderKeyboard(controls.orderId);
  }

  return {
    reply_markup: {
      inline_keyboard: []
    }
  };
}

function replaceOrAppendLine(lines: string[], pattern: RegExp, newLine: string): string[] {
  const index = lines.findIndex((line) => pattern.test(line));

  if (index === -1) {
    return [...lines, newLine];
  }

  const nextLines = [...lines];
  nextLines[index] = newLine;
  return nextLines;
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}

function safeTelegramErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/forbidden|bot was blocked|403/i.test(message)) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (/message is not modified/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_MODIFIED";
  }

  if (/message to edit not found|chat not found|peer_id_invalid/i.test(message)) {
    return "TELEGRAM_MESSAGE_NOT_FOUND";
  }

  if (/bad request|400/i.test(message)) {
    return "TELEGRAM_BAD_REQUEST";
  }

  return "UNKNOWN_TELEGRAM_ERROR";
}
