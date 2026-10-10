export function formatOrderSubmittedMessage(orderId: number): string {
  return [
    `✅ Заявка #${orderId} принята.`,
    "",
    "Информацию о согласовании или переносе сообщим дополнительно."
  ].join("\n");
}

export function formatOrderSubmittedDispatchFailureMessage(orderId: number): string {
  return [
    formatOrderSubmittedMessage(orderId),
    "",
    "⚠️ Не удалось полностью отправить заявку в рабочий чат.",
    "Фотографии временно не сохраняются, поэтому для их повторной отправки может потребоваться создать заявку заново или отправить фото вручную."
  ].join("\n");
}
