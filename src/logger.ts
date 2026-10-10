// Файл содержит минимальный структурный JSON-логгер для MVP.

type LogLevel = "info" | "warn" | "error";

type LogFieldValue =
  | string
  | number
  | boolean
  | null
  | Error
  | undefined;

type LogFields = Record<string, LogFieldValue>;

// Пишет информационное событие в stdout.
export function logInfo(event: string, fields?: LogFields): void {
  writeLog("info", event, fields);
}

// Пишет предупреждение в stdout/stderr через console.warn.
export function logWarn(event: string, fields?: LogFields): void {
  writeLog("warn", event, fields);
}

// Пишет ошибку в stderr.
export function logError(event: string, fields?: LogFields): void {
  writeLog("error", event, fields);
}

// Обрезает длинные значения, чтобы логи не раздувались адресами или ошибками API.
export function truncateForLog(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// Собирает JSON-строку события и выбирает нужный console-метод по уровню.
function writeLog(level: LogLevel, event: string, fields?: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeFields(fields)
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

// Убирает undefined-поля из логов и нормализует Error-объекты.
function sanitizeFields(fields: LogFields | undefined): LogFields {
  if (!fields) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, sanitizeValue(value)])
  ) as LogFields;
}

// Преобразует Error в компактную строку, остальные значения оставляет как есть.
function sanitizeValue(value: LogFieldValue): LogFieldValue {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return value;
}
