// Файл связывает сервис нормализации даты с состоянием Telegram wizard.

import type { WizardSession } from "../types/order.js";

export * from "../services/measureDate.js";

// Сохраняет выбранную дату в сессии и переводит wizard к вопросу о времени.
export function applyMeasureDateToSession(
  session: Pick<WizardSession, "draft" | "step">,
  measureDate: string
): void {
  session.draft.measureDate = measureDate;
  session.step = "measureTime";
}
