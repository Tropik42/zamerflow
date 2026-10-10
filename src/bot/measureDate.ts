import type { WizardSession } from "../types/order.js";

export * from "../services/measureDate.js";

export function applyMeasureDateToSession(
  session: Pick<WizardSession, "draft" | "step">,
  measureDate: string
): void {
  session.draft.measureDate = measureDate;
  session.step = "measureTime";
}
