export interface NavLink {
  href: string;
  label: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "textarea" | "checkbox";
  value?: string | number;
  required?: boolean;
}

export interface SelectOption {
  value: string | number;
  label: string;
}

const navLinks: NavLink[] = [
  { href: "/admin", label: "Главная" },
  { href: "/admin/salons", label: "Салоны" },
  { href: "/admin/managers", label: "Менеджеры" },
  { href: "/admin/auth-codes", label: "Коды доступа" },
  { href: "/admin/orders", label: "Заявки" }
];

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · ZamerFlow</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2933; background: #f5f7fa; }
    body { margin: 0; }
    header { background: #17202a; color: white; padding: 14px 24px; }
    header a { color: white; text-decoration: none; margin-right: 18px; font-weight: 600; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 18px; font-size: 28px; }
    h2 { margin-top: 28px; font-size: 20px; }
    a { color: #0f5e9c; }
    .actions { margin: 16px 0; }
    .button, button { display: inline-block; border: 0; border-radius: 6px; background: #0f5e9c; color: white; padding: 9px 13px; text-decoration: none; cursor: pointer; font: inherit; }
    .button.secondary { background: #566573; }
    .error { background: #fdecea; color: #7f1d1d; border: 1px solid #f5c2c0; padding: 10px 12px; border-radius: 6px; margin: 12px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .stat { background: white; border: 1px solid #d8dee5; border-radius: 8px; padding: 16px; }
    .stat strong { display: block; font-size: 28px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d8dee5; }
    th, td { border-bottom: 1px solid #e5eaf0; padding: 9px 10px; text-align: left; vertical-align: top; }
    th { background: #eef2f6; font-size: 13px; color: #34495e; }
    tr:last-child td { border-bottom: 0; }
    form { background: white; border: 1px solid #d8dee5; border-radius: 8px; padding: 18px; max-width: 760px; }
    label { display: block; margin: 0 0 14px; font-weight: 600; }
    input, textarea, select { display: block; box-sizing: border-box; width: 100%; margin-top: 6px; padding: 8px 9px; border: 1px solid #b8c2cc; border-radius: 5px; font: inherit; }
    input[type="checkbox"] { display: inline-block; width: auto; margin-right: 8px; }
    textarea { min-height: 90px; resize: vertical; }
    pre { white-space: pre-wrap; background: white; border: 1px solid #d8dee5; border-radius: 8px; padding: 14px; }
    dl { display: grid; grid-template-columns: 220px 1fr; gap: 8px 14px; background: white; border: 1px solid #d8dee5; border-radius: 8px; padding: 16px; }
    dt { font-weight: 700; }
    dd { margin: 0; }
  </style>
</head>
<body>
  <header>${navLinks.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join("")}</header>
  <main>${body}</main>
</body>
</html>`;
}

export function table(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Нет данных</td></tr>`;

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function field(config: FieldConfig): string {
  const value = config.value ?? "";
  const required = config.required ? " required" : "";

  if (config.type === "textarea") {
    return `<label>${escapeHtml(config.label)}<textarea name="${config.name}"${required}>${escapeHtml(String(value))}</textarea></label>`;
  }

  if (config.type === "checkbox") {
    const checked = Number(value) === 1 ? " checked" : "";
    return `<label><input type="checkbox" name="${config.name}" value="1"${checked}>${escapeHtml(config.label)}</label>`;
  }

  return `<label>${escapeHtml(config.label)}<input type="${config.type ?? "text"}" name="${config.name}" value="${escapeHtml(String(value))}"${required}></label>`;
}

export function selectField(
  name: string,
  label: string,
  options: SelectOption[],
  selectedValue?: string | number,
  required = true
): string {
  const optionsHtml = options
    .map((option) => {
      const selected = String(option.value) === String(selectedValue ?? "") ? " selected" : "";
      return `<option value="${escapeHtml(String(option.value))}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join("");

  return `<label>${escapeHtml(label)}<select name="${name}"${required ? " required" : ""}>${optionsHtml}</select></label>`;
}

export function form(action: string, content: string, submitLabel: string): string {
  return `<form method="post" action="${action}">${content}<button type="submit">${escapeHtml(submitLabel)}</button></form>`;
}

export function yesNo(value: number | undefined): string {
  return value === 1 ? "да" : "нет";
}

export function value(value: string | number | undefined): string {
  return escapeHtml(value === undefined ? "-" : String(value));
}

export function escapeHtml(valueToEscape: string): string {
  return valueToEscape
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
