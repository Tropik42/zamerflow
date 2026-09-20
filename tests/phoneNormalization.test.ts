import assert from "node:assert/strict";
import {
  countPhoneDigits,
  normalizeRussianPhone,
  normalizeRussianPhoneInText,
  PhoneNormalizationError
} from "../src/services/phoneNormalization.js";

const expectedPhone = "+7-999-123-45-67";

assert.equal(normalizeRussianPhone("89991234567"), expectedPhone);
assert.equal(normalizeRussianPhone("79991234567"), expectedPhone);
assert.equal(normalizeRussianPhone("+7 999 123 45 67"), expectedPhone);
assert.equal(normalizeRussianPhone("+7 (999) 123-45-67"), expectedPhone);

assert.equal(
  normalizeRussianPhoneInText("89209144098 Виктория").value,
  "+7-920-914-40-98 Виктория"
);
assert.equal(
  normalizeRussianPhoneInText("Виктория +7 (920) 914-40-98").value,
  "Виктория +7-920-914-40-98"
);
assert.equal(
  normalizeRussianPhoneInText("Виктория, связь через ресепшен").value,
  "Виктория, связь через ресепшен"
);
assert.equal(countPhoneDigits("89094 Виктория"), 5);
assert.throws(() => normalizeRussianPhone("12345"), PhoneNormalizationError);
assert.throws(() => normalizeRussianPhoneInText("89094"), PhoneNormalizationError);
assert.throws(() => normalizeRussianPhoneInText("89094 Виктория"), PhoneNormalizationError);
assert.throws(() => normalizeRussianPhoneInText("+7 999 123"), PhoneNormalizationError);
