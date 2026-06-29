import type { AuthenticatedUser } from "../types/auth.js";

export function formatWhoamiProfile(user: AuthenticatedUser): string {
  return [
    `имя: ${formatManagerName(user.manager_name)}`,
    `салон: ${formatValue(user.salon_name)}`,
    `роль: ${formatManagerRole(user.manager_role ?? user.role)}`,
    `контакт: ${formatValue(user.manager_phone)}`
  ].join("\n");
}

function formatManagerName(managerName: string | undefined): string {
  return formatValue(managerName?.trim().replace(/\s+/g, " "));
}

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

function formatValue(value: string | undefined): string {
  return value?.trim() ? value.trim() : "-";
}
