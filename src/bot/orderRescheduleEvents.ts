// Файл описывает adapter-level событие успешного переноса заявки после SQLite commit.

import type { ActorContext, RescheduleOrderResult } from "../services/orderWorkflowService.js";

export type SuccessfulRescheduleOrderResult = Extract<RescheduleOrderResult, { status: "success" }>;

export interface RescheduleCommittedEvent {
  result: SuccessfulRescheduleOrderResult;
  actor: ActorContext;
  dispatchChatId: string;
  dispatchHeaderMessageId: number;
  dispatchHeaderCurrentText?: string;
}

export type RescheduleCommittedHandler = (
  event: RescheduleCommittedEvent
) => void | Promise<void>;
