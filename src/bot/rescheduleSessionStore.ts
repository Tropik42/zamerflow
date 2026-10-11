// Файл хранит in-memory сессии переноса заявки для Telegram dispatch-чата.

export type RescheduleSessionStep = "date" | "time";

export interface RescheduleSession {
  orderId: number;
  actorTelegramUserId: number;
  dispatchChatId: string;
  step: RescheduleSessionStep;
  newMeasureDate?: string;
  isSubmitting: boolean;
  startedAt: string;
  expectedReplyToMessageId?: number;
}

export interface RescheduleSessionKeyParams {
  dispatchChatId: string;
  actorTelegramUserId: number;
}

export interface RescheduleSessionStore {
  get(params: RescheduleSessionKeyParams): RescheduleSession | undefined;
  set(session: RescheduleSession): void;
  delete(params: RescheduleSessionKeyParams): void;
}

// Создаёт изолируемое in-memory хранилище с одной сессией на пару dispatch chat + user.
export function createRescheduleSessionStore(): RescheduleSessionStore {
  const sessions = new Map<string, RescheduleSession>();

  return {
    get(params) {
      return sessions.get(createRescheduleSessionKey(params));
    },
    set(session) {
      sessions.set(createRescheduleSessionKey(session), session);
    },
    delete(params) {
      sessions.delete(createRescheduleSessionKey(params));
    }
  };
}

// Формирует стабильный ключ сессии по dispatch-чату и Telegram user id диспетчера.
export function createRescheduleSessionKey(params: RescheduleSessionKeyParams): string {
  return `${params.dispatchChatId}:${params.actorTelegramUserId}`;
}
