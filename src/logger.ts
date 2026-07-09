type LogLevel = "info" | "warn" | "error";

type LogFieldValue =
  | string
  | number
  | boolean
  | null
  | Error
  | undefined;

type LogFields = Record<string, LogFieldValue>;

export function logInfo(event: string, fields?: LogFields): void {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  writeLog("warn", event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  writeLog("error", event, fields);
}

export function truncateForLog(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

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

function sanitizeValue(value: LogFieldValue): LogFieldValue {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return value;
}
