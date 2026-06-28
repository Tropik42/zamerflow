export interface TelegramUser {
  telegram_user_id: string;
  create_datetime: string;
  modify_datetime: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role: string;
  salon_id?: number;
  manager_id?: number;
  is_active: number;
  salon_name?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_role?: string;
}

export interface ManagerAuthCode {
  auth_code: string;
  manager_id: number;
  create_datetime: string;
  used_datetime?: string;
  is_used: number;
}

export interface AuthenticatedUser extends TelegramUser {
  role: "manager" | string;
  salon_id: number;
  manager_id: number;
  salon_name?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_role?: string;
}

export interface TelegramUserIdentity {
  telegram_user_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}
