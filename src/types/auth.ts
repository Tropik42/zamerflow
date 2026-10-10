// Файл описывает типы авторизации Telegram-пользователей и одноразовых кодов менеджеров.

// TelegramUser отражает строку telegram_users вместе с присоединёнными данными салона и менеджера.
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

// ManagerAuthCode отражает одноразовый код, который админ выдаёт менеджеру.
export interface ManagerAuthCode {
  auth_code: string;
  manager_id: number;
  create_datetime: string;
  used_datetime?: string;
  is_used: number;
}

// AuthenticatedUser описывает активного пользователя, уже привязанного к салону и менеджеру.
export interface AuthenticatedUser extends TelegramUser {
  role: "manager" | string;
  salon_id: number;
  manager_id: number;
  salon_name?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_role?: string;
}

// TelegramUserIdentity хранит данные Telegram-профиля, нужные при привязке к менеджеру.
export interface TelegramUserIdentity {
  telegram_user_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}
