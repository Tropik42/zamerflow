import type { Context } from "telegraf";
import type { OrderRecord } from "../types/order.js";

export interface ParsedOrderConfirmCallback {
  status: "ok";
  orderId: number;
}

export interface InvalidOrderConfirmCallback {
  status: "invalid";
}

export type ParseOrderConfirmCallbackResult =
  | ParsedOrderConfirmCallback
  | InvalidOrderConfirmCallback;

export interface WorkflowCallbackMessageIdentity {
  chatId: string;
  messageId: number;
  currentText?: string;
}

export type WorkflowCallbackGuardFailureReason =
  | "dispatch_chat_not_configured"
  | "callback_message_missing"
  | "dispatch_chat_mismatch"
  | "stored_dispatch_chat_mismatch"
  | "stored_header_message_mismatch";

export type WorkflowCallbackGuardResult =
  | {
      status: "allowed";
    }
  | {
      status: "denied";
      reason: WorkflowCallbackGuardFailureReason;
    };

export function parseOrderConfirmCallbackData(data: unknown): ParseOrderConfirmCallbackResult {
  if (typeof data !== "string") {
    return { status: "invalid" };
  }

  const match = /^order:confirm:(\d+)$/.exec(data);

  if (!match) {
    return { status: "invalid" };
  }

  const orderId = Number(match[1]);

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return { status: "invalid" };
  }

  return {
    status: "ok",
    orderId
  };
}

export function extractWorkflowCallbackData(ctx: Context): unknown {
  const callbackQuery = ctx.callbackQuery;

  if (!isObject(callbackQuery) || !("data" in callbackQuery)) {
    return undefined;
  }

  return callbackQuery.data;
}

export function extractWorkflowCallbackMessage(
  ctx: Context
): WorkflowCallbackMessageIdentity | undefined {
  const callbackQuery = ctx.callbackQuery;

  if (!isObject(callbackQuery) || !("message" in callbackQuery)) {
    return undefined;
  }

  const message = callbackQuery.message;

  if (!isObject(message) || !("chat" in message) || !("message_id" in message)) {
    return undefined;
  }

  const chat = message.chat;
  const messageId = message.message_id;

  if (!isObject(chat) || !("id" in chat) || typeof messageId !== "number") {
    return undefined;
  }

  const chatId = chat.id;

  if (typeof chatId !== "number" && typeof chatId !== "string") {
    return undefined;
  }

  const text = "text" in message && typeof message.text === "string" ? message.text : undefined;

  return {
    chatId: String(chatId),
    messageId,
    currentText: text
  };
}

export function validateWorkflowCallbackIdentity(params: {
  configuredDispatchChatId?: string;
  message?: WorkflowCallbackMessageIdentity;
  order?: OrderRecord;
}): WorkflowCallbackGuardResult {
  const configuredDispatchChatId = params.configuredDispatchChatId?.trim();

  if (!configuredDispatchChatId) {
    return {
      status: "denied",
      reason: "dispatch_chat_not_configured"
    };
  }

  if (!params.message) {
    return {
      status: "denied",
      reason: "callback_message_missing"
    };
  }

  if (params.message.chatId !== configuredDispatchChatId) {
    return {
      status: "denied",
      reason: "dispatch_chat_mismatch"
    };
  }

  if (
    params.order?.dispatch_notification_chat_id &&
    params.order.dispatch_notification_chat_id !== params.message.chatId
  ) {
    return {
      status: "denied",
      reason: "stored_dispatch_chat_mismatch"
    };
  }

  if (
    params.order?.dispatch_notification_header_message_id !== undefined &&
    params.order.dispatch_notification_header_message_id !== params.message.messageId
  ) {
    return {
      status: "denied",
      reason: "stored_header_message_mismatch"
    };
  }

  return {
    status: "allowed"
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
