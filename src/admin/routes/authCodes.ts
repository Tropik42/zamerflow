import type { FastifyInstance } from "fastify";
import { asFormBody, requiredNumber, requiredString } from "../form.js";
import { escapeHtml, form, layout, selectField, table, value, yesNo } from "../html.js";
import type { ManagerAuthCodeRepository } from "../../db/managerAuthCodeRepository.js";
import type { SalonManagerRepository } from "../../db/salonManagerRepository.js";

export function registerAuthCodeRoutes(
  app: FastifyInstance,
  authCodeRepository: ManagerAuthCodeRepository,
  managerRepository: SalonManagerRepository
): void {
  app.get<{ Querystring: { error?: string } }>("/admin/auth-codes", async (request) => {
    return authCodesPage(
      authCodeRepository,
      managerRepository,
      request.query.error === "duplicate" ? "Код уже существует. Введите другой код." : undefined
    );
  });

  app.post("/admin/auth-codes", async (request, reply) => {
    const body = asFormBody(request.body);
    const created = authCodeRepository.createAuthCode(
      requiredString(body, "auth_code"),
      requiredNumber(body, "manager_id")
    );

    if (!created) {
      return reply.redirect("/admin/auth-codes?error=duplicate");
    }

    return reply.redirect("/admin/auth-codes");
  });

  app.post<{ Params: { authCode: string } }>("/admin/auth-codes/:authCode/reset", async (request, reply) => {
    authCodeRepository.resetAuthCode(request.params.authCode);
    return reply.redirect("/admin/auth-codes");
  });
}

function authCodesPage(
  authCodeRepository: ManagerAuthCodeRepository,
  managerRepository: SalonManagerRepository,
  error?: string
): string {
  const codes = authCodeRepository.getAllCodes();
  const managers = managerRepository.getActiveManagers();

  return layout(
    "Коды доступа",
    `<h1>Коды доступа</h1>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <h2>Создать код</h2>
    ${form(
      "/admin/auth-codes",
      [
        selectField(
          "manager_id",
          "Менеджер",
          managers.map((manager) => ({
            value: manager.manager_id,
            label: `${manager.salon_name ?? "Без салона"} / ${manager.manager_name} (#${manager.manager_id})`
          }))
        ),
        '<label>Код доступа<input type="text" name="auth_code" required></label>'
      ].join(""),
      "Создать код"
    )}
    <h2>Список кодов</h2>
    ${table(
      ["auth_code", "salon_name", "manager_name", "is_used", "create_datetime", "used_datetime", ""],
      codes.map((code) => [
        value(code.auth_code),
        value(code.salon_name),
        value(code.manager_name),
        yesNo(code.is_used),
        value(code.create_datetime),
        value(code.used_datetime),
        `<form method="post" action="/admin/auth-codes/${encodeURIComponent(
          code.auth_code
        )}/reset" style="padding:0;border:0;background:transparent;"><button type="submit">сбросить</button></form>`
      ])
    )}`
  );
}
