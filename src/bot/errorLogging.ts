// Файл готовит безопасный текст ошибок Telegram без утечки bot token в логах.

// Возвращает сообщение ошибки и маскирует Telegram token, если он попал в URL.
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeTelegramToken(message);
}

// Заменяет участок /bot<TOKEN> в тексте ошибки на безопасный placeholder.
function sanitizeTelegramToken(message: string): string {
  return message.replace(/\/bot[^/\s]+/g, "/bot<hidden>");
}
