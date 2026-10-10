// Файл форматирует профиль авторизованного менеджера для команды /whoami.

import type { AuthenticatedUser } from "../types/auth.js";

// Собирает короткий профиль пользователя с салоном, ролью и контактом.
export function formatWhoamiProfile(user: AuthenticatedUser): string {
  return [
    `имя: ${formatManagerName(user.manager_name)}`,
    `салон: ${formatValue(user.salon_name)}`,
    `роль: ${formatManagerRole(user.manager_role ?? user.role)}`,
    `контакт: ${formatValue(user.manager_phone)}`
  ].join("\n");
}

// Нормализует пробелы в имени менеджера перед выводом.
function formatManagerName(managerName: string | undefined): string {
  return formatValue(managerName?.trim().replace(/\s+/g, " "));
}

// Показывает директорскую роль по-русски, остальные роли оставляет как есть.
function formatManagerRole(role: string | undefined): string {
  switch (role) {
    case "manager":
      return "менеджер";
    case "director":
      return "директор";
    default:
      return formatValue(role);
  }
}

// Возвращает значение или прочерк для пустого поля профиля.
function formatValue(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}
