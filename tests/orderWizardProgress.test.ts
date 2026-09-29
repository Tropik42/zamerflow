import assert from "node:assert/strict";
import {
  createMainOrderWizardSteps,
  formatOrderWizardQuestion,
  getOrderWizardProgress
} from "../src/bot/orderWizardProgress.js";

const stepsWithPayment = createMainOrderWizardSteps({});
const stepsWithoutPayment = createMainOrderWizardSteps({ paymentBy: "салоном" });

assert.equal(stepsWithPayment.length, 9);
assert.equal(stepsWithoutPayment.length, 8);

assert.deepEqual(
  stepsWithPayment.map((_, index) => getOrderWizardProgress(stepsWithPayment, [
    "clientContact",
    "address",
    "metro",
    "measureDate",
    "measureTime",
    "selectServiceItem",
    "paymentBy",
    "extraCharges",
    "comment"
  ][index])),
  [
    { current: 1, total: 9 },
    { current: 2, total: 9 },
    { current: 3, total: 9 },
    { current: 4, total: 9 },
    { current: 5, total: 9 },
    { current: 6, total: 9 },
    { current: 7, total: 9 },
    { current: 8, total: 9 },
    { current: 9, total: 9 }
  ]
);

assert.deepEqual(getOrderWizardProgress(stepsWithoutPayment, "clientContact"), { current: 1, total: 8 });
assert.deepEqual(getOrderWizardProgress(stepsWithoutPayment, "selectServiceItem"), { current: 6, total: 8 });
assert.deepEqual(getOrderWizardProgress(stepsWithoutPayment, "extraCharges"), { current: 7, total: 8 });
assert.deepEqual(getOrderWizardProgress(stepsWithoutPayment, "comment"), { current: 8, total: 8 });
assert.equal(getOrderWizardProgress(stepsWithoutPayment, "paymentBy"), undefined);

assert.equal(
  formatOrderWizardQuestion(stepsWithPayment, "measureDate", "Дата замера."),
  "Шаг 4 из 9\nДата замера."
);
assert.equal(
  formatOrderWizardQuestion(stepsWithoutPayment, "measureDate", "Дата замера."),
  "Шаг 4 из 8\nДата замера."
);

assert.equal(
  formatOrderWizardQuestion(stepsWithPayment, "manualServiceItem", "Введите позицию под замер вручную."),
  "Шаг 6 из 9\nВведите позицию под замер вручную."
);
assert.equal(
  formatOrderWizardQuestion(stepsWithPayment, "photos", "Есть фото / проект / план помещения?"),
  "Есть фото / проект / план помещения?"
);
