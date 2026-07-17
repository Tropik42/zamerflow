import type { Context, Telegraf } from "telegraf";
import { logError, logInfo } from "../logger.js";
import type { DraftPhoto } from "../types/order.js";

export interface DispatchNotificationService {
  sendOrderPackage(params: SendOrderPackageParams): Promise<DispatchPackageResult>;
}

export interface SendOrderPackageParams {
  orderId: number;
  chatId: string;
  salonName?: string;
  managerName?: string;
  measureDate?: string;
  address?: string;
  addressNormalizedSnapshot?: string;
  addressBeltwayHit?: string;
  addressBeltwayDistanceKm?: number;
  formattedCardText: string;
  photos: readonly DraftPhoto[];
}

export type DispatchPackageStage = "header" | "photos" | "card";

export type DispatchPhotoSendMode = "none" | "single_photo" | "media_group";

export type DispatchNotificationErrorCode =
  | "DISPATCH_CHAT_ID_NOT_CONFIGURED"
  | "DISPATCH_CHAT_ID_NOT_GROUP_CHAT"
  | "TELEGRAM_FORBIDDEN"
  | "TELEGRAM_BAD_REQUEST"
  | "TELEGRAM_CHAT_NOT_FOUND"
  | "TELEGRAM_HEADER_SEND_FAILED"
  | "TELEGRAM_PHOTO_SEND_FAILED"
  | "TELEGRAM_MEDIA_GROUP_SEND_FAILED"
  | "TELEGRAM_CARD_SEND_FAILED"
  | "UNKNOWN_DISPATCH_ERROR";

export interface DispatchPackageResult {
  chatId: string;
  headerMessageId?: number;
  photoMessageIds: number[];
  cardMessageId?: number;
  failedStage?: DispatchPackageStage;
  errorCode?: DispatchNotificationErrorCode;
}

export function createDispatchNotificationService(
  bot: Telegraf<Context>
): DispatchNotificationService {
  return {
    async sendOrderPackage(params) {
      const result: DispatchPackageResult = {
        chatId: params.chatId,
        photoMessageIds: []
      };

      try {
        const headerMessage = await bot.telegram.sendMessage(
          params.chatId,
          formatDispatchHeader(params)
        );

        result.headerMessageId = headerMessage.message_id;
        logInfo("dispatch_header_sent", {
          order_id: params.orderId,
          dispatch_chat_id: params.chatId
        });
      } catch (error) {
        result.failedStage = "header";
        result.errorCode = mapDispatchError(error, "header", photoSendMode(params.photos));
        return result;
      }

      const sendMode = photoSendMode(params.photos);

      try {
        result.photoMessageIds = await sendPhotos(bot, params.chatId, params.photos, sendMode);

        logInfo("dispatch_photos_sent", {
          order_id: params.orderId,
          dispatch_chat_id: params.chatId,
          photo_count: params.photos.length,
          send_mode: sendMode
        });
      } catch (error) {
        result.failedStage = "photos";
        result.errorCode = mapDispatchError(error, "photos", sendMode);

        logError("dispatch_photos_failed", {
          order_id: params.orderId,
          dispatch_chat_id: params.chatId,
          photo_count: params.photos.length,
          send_mode: sendMode,
          failed_stage: result.failedStage,
          error_code: result.errorCode
        });
      }

      try {
        const cardMessage = await bot.telegram.sendMessage(
          params.chatId,
          params.formattedCardText
        );

        result.cardMessageId = cardMessage.message_id;
        logInfo("dispatch_card_sent", {
          order_id: params.orderId,
          dispatch_chat_id: params.chatId,
          failed_stage: result.failedStage
        });
      } catch (error) {
        const errorCode = mapDispatchError(error, "card", sendMode);

        if (!result.failedStage) {
          result.failedStage = "card";
          result.errorCode = errorCode;
        }

        logError("dispatch_card_failed", {
          order_id: params.orderId,
          dispatch_chat_id: params.chatId,
          failed_stage: "card",
          error_code: errorCode
        });
      }

      return result;
    }
  };
}

async function sendPhotos(
  bot: Telegraf<Context>,
  chatId: string,
  photos: readonly DraftPhoto[],
  sendMode: DispatchPhotoSendMode
): Promise<number[]> {
  if (sendMode === "none") {
    return [];
  }

  if (sendMode === "single_photo") {
    const message = await bot.telegram.sendPhoto(chatId, photos[0].fileId);
    return [message.message_id];
  }

  const messages = await bot.telegram.sendMediaGroup(
    chatId,
    photos.map((photo) => ({
      type: "photo" as const,
      media: photo.fileId
    }))
  );

  return messages.map((message) => message.message_id);
}

function photoSendMode(photos: readonly DraftPhoto[]): DispatchPhotoSendMode {
  if (photos.length === 0) {
    return "none";
  }

  return photos.length === 1 ? "single_photo" : "media_group";
}

function formatDispatchHeader(params: SendOrderPackageParams): string {
  return [
    "О Повелитель, поступила новая заявка!",
    "",
    `🆕 Заявка #${params.orderId}`,
    "",
    `Салон: ${valueOrDash(params.salonName)}`,
    `Менеджер: ${valueOrDash(params.managerName)}`,
    `Дата замера: ${valueOrDash(params.measureDate)}`,
    "Статус: принята менеджером",
    `Фотографии: ${params.photos.length > 0 ? params.photos.length : "нет"}`,
    "",
    ...formatAddressBlock(params)
  ].join("\n");
}

function valueOrDash(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}

function formatAddressBlock(params: SendOrderPackageParams): string[] {
  const locationText = formatBeltwayHit(params.addressBeltwayHit);
  const normalizedAddress = params.addressNormalizedSnapshot?.trim();

  if (normalizedAddress && locationText !== "Не определено") {
    return [
      `Адрес, введённый менеджером: "${valueOrDash(params.address)}"`,
      `Адрес определён как: "${normalizedAddress}"`,
      `Расположение: ${locationText}`,
      ...formatBeltwayDistance(params)
    ];
  }

  return [
    `Адрес, введённый менеджером: "${valueOrDash(params.address)}"`,
    "Адрес автоматически определить не удалось.",
    "Расположение: Не определено"
  ];
}

function formatBeltwayDistance(params: SendOrderPackageParams): string[] {
  if (params.addressBeltwayHit !== "OUT_MKAD") {
    return [];
  }

  const distance = params.addressBeltwayDistanceKm;
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance <= 0) {
    return [];
  }

  return [`Примерное расстояние от МКАД: ${Math.ceil(distance)} км`];
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

function mapDispatchError(
  error: unknown,
  stage: DispatchPackageStage,
  sendMode: DispatchPhotoSendMode
): DispatchNotificationErrorCode {
  const response = getTelegramErrorResponse(error);

  if (response?.error_code === 403) {
    return "TELEGRAM_FORBIDDEN";
  }

  if (response?.error_code === 400) {
    const description = response.description?.toLowerCase() ?? "";

    if (description.includes("chat not found") || description.includes("chat_id")) {
      return "TELEGRAM_CHAT_NOT_FOUND";
    }

    return mapStageSendError(stage, sendMode);
  }

  if (response) {
    return mapStageSendError(stage, sendMode);
  }

  return mapStageSendError(stage, sendMode);
}

function mapStageSendError(
  stage: DispatchPackageStage,
  sendMode: DispatchPhotoSendMode
): DispatchNotificationErrorCode {
  switch (stage) {
    case "header":
      return "TELEGRAM_HEADER_SEND_FAILED";
    case "photos":
      return sendMode === "media_group"
        ? "TELEGRAM_MEDIA_GROUP_SEND_FAILED"
        : "TELEGRAM_PHOTO_SEND_FAILED";
    case "card":
      return "TELEGRAM_CARD_SEND_FAILED";
  }
}

function getTelegramErrorResponse(
  error: unknown
): { error_code?: number; description?: string } | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const response = (error as { response?: unknown }).response;

  if (!response || typeof response !== "object") {
    return undefined;
  }

  const candidate = response as Record<string, unknown>;
  return {
    error_code: typeof candidate.error_code === "number" ? candidate.error_code : undefined,
    description: typeof candidate.description === "string" ? candidate.description : undefined
  };
}
