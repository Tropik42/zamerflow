export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeTelegramToken(message);
}

function sanitizeTelegramToken(message: string): string {
  return message.replace(/\/bot[^/\s]+/g, "/bot<hidden>");
}
