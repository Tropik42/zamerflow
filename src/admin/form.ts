export type FormBody = Record<string, string | undefined>;

export function asFormBody(body: unknown): FormBody {
  return typeof body === "object" && body !== null ? (body as FormBody) : {};
}

export function stringValue(body: FormBody, name: string): string | undefined {
  const value = body[name]?.trim();
  return value ? value : undefined;
}

export function requiredString(body: FormBody, name: string): string {
  return stringValue(body, name) ?? "";
}

export function numberValue(body: FormBody, name: string): number | undefined {
  const value = stringValue(body, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function requiredNumber(body: FormBody, name: string, fallback = 0): number {
  return numberValue(body, name) ?? fallback;
}

export function checkboxValue(body: FormBody, name: string): number {
  return body[name] === "1" ? 1 : 0;
}
