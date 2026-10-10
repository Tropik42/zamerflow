export const negotiatedMeasureDateText = "По договорённости";

export const measureDateQuestionText = 'Дата замера? Пример: "18 октября" или "18.10.2026".';

export type MeasureDateNormalizationResult =
  | {
      status: "accepted";
      value: string;
    }
  | {
      status: "rejected";
    };

const monthNames = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
];

const monthNumberByName = new Map(monthNames.map((name, index) => [name, index + 1]));

const numericDatePattern = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/;
const namedDatePattern = /^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/iu;

export function normalizeMeasureDateInput(
  value: string,
  currentYear = new Date().getFullYear()
): MeasureDateNormalizationResult {
  const trimmedValue = value.trim();
  const numericMatch = trimmedValue.match(numericDatePattern);

  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1] ?? "", 10);
    const month = Number.parseInt(numericMatch[2] ?? "", 10);
    const year = normalizeYear(numericMatch[3]);

    return normalizeRecognizedDate({ day, month, year, hasExplicitYear: year !== undefined, currentYear });
  }

  const namedMatch = trimmedValue.match(namedDatePattern);

  if (namedMatch) {
    const day = Number.parseInt(namedMatch[1] ?? "", 10);
    const monthName = (namedMatch[2] ?? "").toLocaleLowerCase("ru-RU");
    const month = monthNumberByName.get(monthName);

    if (month === undefined) {
      return { status: "accepted", value };
    }

    const year = namedMatch[3] ? Number.parseInt(namedMatch[3], 10) : undefined;

    return normalizeRecognizedDate({ day, month, year, hasExplicitYear: year !== undefined, currentYear });
  }

  return { status: "accepted", value };
}

function normalizeYear(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length === 2) {
    return 2000 + Number.parseInt(value, 10);
  }

  return Number.parseInt(value, 10);
}

function normalizeRecognizedDate(params: {
  day: number;
  month: number;
  year: number | undefined;
  hasExplicitYear: boolean;
  currentYear: number;
}): MeasureDateNormalizationResult {
  const { day, month, year, hasExplicitYear, currentYear } = params;

  if (!isValidCalendarDate(day, month, year)) {
    return { status: "rejected" };
  }

  const monthName = monthNames[month - 1];
  const normalizedDate = `${day} ${monthName}`;

  if (!hasExplicitYear || year === currentYear) {
    return { status: "accepted", value: normalizedDate };
  }

  return { status: "accepted", value: `${normalizedDate} ${year}` };
}

function isValidCalendarDate(day: number, month: number, year: number | undefined): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= daysInMonth(month, year);
}

function daysInMonth(month: number, year: number | undefined): number {
  if (month === 2) {
    return year === undefined || isLeapYear(year) ? 29 : 28;
  }

  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }

  return 31;
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}
