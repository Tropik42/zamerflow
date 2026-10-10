// Файл считает прогресс основного Telegram wizard и добавляет префикс "Шаг N из M".

import type { MainOrderWizardStep, OrderDraft, WizardStep } from "../types/order.js";

const mainStepsWithPayment: MainOrderWizardStep[] = [
  "clientContact",
  "address",
  "metro",
  "measureDate",
  "measureTime",
  "serviceItems",
  "paymentBy",
  "extraCharges",
  "comment"
];

const mainStepsWithoutPayment: MainOrderWizardStep[] = [
  "clientContact",
  "address",
  "metro",
  "measureDate",
  "measureTime",
  "serviceItems",
  "extraCharges",
  "comment"
];

const mainStepByWizardStep: Partial<Record<WizardStep, MainOrderWizardStep>> = {
  clientContact: "clientContact",
  address: "address",
  metro: "metro",
  measureDate: "measureDate",
  measureTime: "measureTime",
  selectServiceItem: "serviceItems",
  manualServiceItem: "serviceItems",
  paymentBy: "paymentBy",
  extraCharges: "extraCharges",
  comment: "comment"
};

// Возвращает список основных шагов с учётом фиксированной оплаты салона.
export function createMainOrderWizardSteps(draft: Pick<OrderDraft, "paymentBy">): MainOrderWizardStep[] {
  return draft.paymentBy ? [...mainStepsWithoutPayment] : [...mainStepsWithPayment];
}

// Рассчитывает номер текущего основного шага для технического шага wizard.
export function getOrderWizardProgress(
  mainSteps: readonly MainOrderWizardStep[],
  wizardStep: WizardStep
): { current: number; total: number } | undefined {
  const mainStep = mainStepByWizardStep[wizardStep];

  if (!mainStep) {
    return undefined;
  }

  const stepIndex = mainSteps.indexOf(mainStep);

  if (stepIndex === -1) {
    return undefined;
  }

  return {
    current: stepIndex + 1,
    total: mainSteps.length
  };
}

// Добавляет к вопросу строку прогресса, если шаг входит в основной сценарий.
export function formatOrderWizardQuestion(
  mainSteps: readonly MainOrderWizardStep[],
  wizardStep: WizardStep,
  questionText: string
): string {
  const progress = getOrderWizardProgress(mainSteps, wizardStep);

  if (!progress) {
    return questionText;
  }

  return [`Шаг ${progress.current} из ${progress.total}`, questionText].join("\n");
}
