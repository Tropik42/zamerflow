// Файл проверяет нормализацию даты замера и переход wizard после выбора даты.

import assert from "node:assert/strict";
import {
  applyMeasureDateToSession,
  negotiatedMeasureDateText,
  normalizeMeasureDateInput
} from "../src/bot/measureDate.js";
import type { WizardSession } from "../src/types/order.js";

const currentYear = 2026;

// Проверяет успешную нормализацию даты в ожидаемый текст карточки.
function assertAccepted(input: string, expectedValue: string): void {
  assert.deepEqual(normalizeMeasureDateInput(input, currentYear), {
    status: "accepted",
    value: expectedValue
  });
}

// Проверяет отклонение календарно некорректной даты.
function assertRejected(input: string): void {
  assert.deepEqual(normalizeMeasureDateInput(input, currentYear), {
    status: "rejected"
  });
}

assertAccepted("18 октября", "18 октября");
assertAccepted("18 Октября", "18 октября");
assertAccepted("18 ОКТЯБРЯ", "18 октября");
assertAccepted("18 октября 2026", "18 октября");
assertAccepted("18.10", "18 октября");
assertAccepted("18.10.26", "18 октября");
assertAccepted("18.10.2026", "18 октября");
assertAccepted("18.10.2027", "18 октября 2027");
assertAccepted("29.02.2028", "29 февраля 2028");
assertAccepted("29 февраля", "29 февраля");

assertRejected("29.02.2026");
assertRejected("31.02.2026");
assertRejected("32 октября");
assertRejected("18.13.2026");
assertRejected("00.10.2026");

assertAccepted("после готовности кухни", "после готовности кухни");
assertAccepted("28.09.26 или по договорённости", "28.09.26 или по договорённости");

const session: Pick<WizardSession, "draft" | "step"> = {
  step: "measureDate",
  draft: {
    serviceItems: []
  }
};

applyMeasureDateToSession(session, negotiatedMeasureDateText);

assert.equal(session.draft.measureDate, negotiatedMeasureDateText);
assert.equal(session.step, "measureTime");
