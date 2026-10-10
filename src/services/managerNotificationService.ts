export interface ManagerNotificationService {
  sendWorkflowNotification(
    notification: ManagerWorkflowNotification
  ): Promise<ManagerNotificationResult>;
}

export type ManagerWorkflowNotification =
  | ManagerOrderConfirmedNotification
  | ManagerOrderRescheduledNotification;

export interface ManagerOrderConfirmedNotification {
  type: "order_confirmed";
  orderId: number;
  managerId?: number;
  recipientExternalId?: string;
  measureDate?: string;
  measureTime?: string;
}

export interface ManagerOrderRescheduledNotification {
  type: "order_rescheduled";
  orderId: number;
  managerId?: number;
  recipientExternalId?: string;
  previousMeasureDate?: string;
  previousMeasureTime?: string;
  newMeasureDate: string;
  newMeasureTime?: string;
}

export type ManagerNotificationResult =
  | {
      status: "sent";
    }
  | {
      status: "failed";
      error: string;
    };
