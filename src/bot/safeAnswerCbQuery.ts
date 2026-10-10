// Файл безопасно подтверждает Telegram callback query и игнорирует протухшие callback-и.

import type { Context } from "telegraf";

const staleCallbackMessageParts = [
  "query is too old",
  "response timeout expired",
  "query ID is invalid"
];

// Отвечает на callback query, не падая на устаревших кнопках Telegram.
export async function safeAnswerCbQuery(ctx: Context): Promise<void> {
  try {
    await ctx.answerCbQuery();
  } catch (error) {
    if (isStaleCallbackQueryError(error)) {
      console.warn("Telegram callback query acknowledgement skipped: stale callback query.");
      return;
    }

    throw error;
  }
}

// Определяет типичные ошибки Telegraf для слишком старого callback query.
function isStaleCallbackQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return staleCallbackMessageParts.some((part) => message.includes(part));
}
