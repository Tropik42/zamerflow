export const russianPhoneFormatHint = "+7-XXX-XXX-XX-XX";

export class PhoneNormalizationError extends Error {
  readonly digitCount?: number;

  constructor(
    message = `Телефон должен быть российским номером в формате ${russianPhoneFormatHint}.`,
    digitCount?: number
  ) {
    super(message);
    this.name = "PhoneNormalizationError";
    this.digitCount = digitCount;
  }
}

export interface ContactPhoneNormalizationResult {
  value: string;
  normalizedPhone?: string;
}

const phoneAllowedCharacters = /^[+\d\s()-]+$/;
const phoneCandidatePattern = /\+?\d[\d\s()-]{8,}\d/g;

export function normalizeRussianPhone(value: string): string {
  const trimmed = value.trim();
  const digitCount = countPhoneDigits(trimmed);

  if (!trimmed || !phoneAllowedCharacters.test(trimmed)) {
    throw new PhoneNormalizationError(undefined, digitCount);
  }

  if (trimmed.includes("+") && !trimmed.startsWith("+")) {
    throw new PhoneNormalizationError(undefined, digitCount);
  }

  if ((trimmed.match(/\+/g) ?? []).length > 1) {
    throw new PhoneNormalizationError(undefined, digitCount);
  }

  if (trimmed.startsWith("+") && !trimmed.startsWith("+7")) {
    throw new PhoneNormalizationError(undefined, digitCount);
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length !== 11 || (digits[0] !== "7" && digits[0] !== "8")) {
    throw new PhoneNormalizationError(undefined, digitCount);
  }

  const nationalNumber = digits.slice(1);

  return [
    "+7",
    nationalNumber.slice(0, 3),
    nationalNumber.slice(3, 6),
    nationalNumber.slice(6, 8),
    nationalNumber.slice(8, 10)
  ].join("-");
}

export function normalizeOptionalRussianPhone(value: string | undefined): string | undefined {
  return value ? normalizeRussianPhone(value) : undefined;
}

export function normalizeRussianPhoneInText(value: string): ContactPhoneNormalizationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { value: trimmed };
  }

  try {
    const normalizedPhone = normalizeRussianPhone(trimmed);
    return {
      value: normalizedPhone,
      normalizedPhone
    };
  } catch (error) {
    if (!(error instanceof PhoneNormalizationError)) {
      throw error;
    }
  }

  for (const candidate of trimmed.matchAll(phoneCandidatePattern)) {
    try {
      const normalizedPhone = normalizeRussianPhone(candidate[0]);
      return {
        value: replacePhoneCandidate(trimmed, candidate.index ?? 0, candidate[0], normalizedPhone),
        normalizedPhone
      };
    } catch (error) {
      if (error instanceof PhoneNormalizationError && isLikelyRussianPhoneAttempt(candidate[0])) {
        throw error;
      }

      throw error;
    }
  }

  if (hasExplicitInvalidRussianPhoneAttempt(trimmed)) {
    throw new PhoneNormalizationError(undefined, countPhoneDigits(trimmed));
  }

  return { value: trimmed };
}

export function countPhoneDigits(value: string): number {
  return value.replace(/\D/g, "").length;
}

function replacePhoneCandidate(
  text: string,
  startIndex: number,
  candidate: string,
  normalizedPhone: string
): string {
  return `${text.slice(0, startIndex)}${normalizedPhone}${text.slice(startIndex + candidate.length)}`
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyRussianPhoneAttempt(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  return trimmed.startsWith("+7") || digits.length >= 10;
}

function hasExplicitInvalidRussianPhoneAttempt(value: string): boolean {
  if (phoneAllowedCharacters.test(value) && /\d/.test(value)) {
    return true;
  }

  const digits = value.replace(/\D/g, "");

  return value.includes("+7") || digits.length >= 10 || hasShortRussianPhoneAttempt(value);
}

function hasShortRussianPhoneAttempt(value: string): boolean {
  for (const candidate of value.matchAll(/\+?\d[\d\s()-]*/g)) {
    const text = candidate[0].trim();
    const digits = text.replace(/\D/g, "");

    if ((text.startsWith("+7") || digits[0] === "7" || digits[0] === "8") && digits.length >= 5) {
      return true;
    }
  }

  return false;
}
