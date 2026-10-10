// Файл содержит helper-функции для безопасного чтения HTML form body в админке.

export type FormBody = Record<string, string | undefined>;

// Приводит неизвестное тело Fastify-запроса к словарю полей формы.
export function asFormBody(body: unknown): FormBody {
  return typeof body === "object" && body !== null ? (body as FormBody) : {};
}

// Возвращает trimmed-строку из формы или undefined для пустого значения.
export function stringValue(body: FormBody, name: string): string | undefined {
  const value = body[name]?.trim();
  return value ? value : undefined;
}

// Возвращает строковое поле формы, подставляя пустую строку для обязательных input.
export function requiredString(body: FormBody, name: string): string {
  return stringValue(body, name) ?? "";
}

// Преобразует числовое поле формы в number и отбрасывает некорректные значения.
export function numberValue(body: FormBody, name: string): number | undefined {
  const value = stringValue(body, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Возвращает число из формы или fallback для обязательных числовых полей.
export function requiredNumber(body: FormBody, name: string, fallback = 0): number {
  return numberValue(body, name) ?? fallback;
}

// Приводит checkbox из HTML-формы к SQLite-совместимому 0/1.
export function checkboxValue(body: FormBody, name: string): number {
  return body[name] === "1" ? 1 : 0;
}
