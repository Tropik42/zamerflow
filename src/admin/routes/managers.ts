import type { FastifyInstance } from "fastify";
import {
  asFormBody,
  checkboxValue,
  requiredNumber,
  requiredString,
  stringValue
} from "../form.js";
import { field, form, layout, selectField, table, value, yesNo } from "../html.js";
import type { SalonRepository } from "../../db/salonRepository.js";
import type {
  SalonManager,
  SalonManagerFormParams,
  SalonManagerRepository
} from "../../db/salonManagerRepository.js";

export function registerManagerRoutes(
  app: FastifyInstance,
  managerRepository: SalonManagerRepository,
  salonRepository: SalonRepository
): void {
  app.get("/admin/managers", async () => {
    const managers = managerRepository.getAllManagers();

    return layout(
      "Менеджеры",
      `<h1>Менеджеры</h1>
      <div class="actions"><a class="button" href="/admin/managers/new">Создать менеджера</a></div>
      ${table(
        [
          "manager_id",
          "salon_name",
          "manager_name",
          "manager_phone",
          "manager_email",
          "position_title",
          "manager_role",
          "sort_order",
          "is_active",
          ""
        ],
        managers.map((manager) => [
          value(manager.manager_id),
          value(manager.salon_name),
          value(manager.manager_name),
          value(manager.manager_phone),
          value(manager.manager_email),
          value(manager.position_title),
          value(manager.manager_role),
          value(manager.sort_order),
          yesNo(manager.is_active),
          `<a href="/admin/managers/${manager.manager_id}/edit">редактировать</a>`
        ])
      )}`
    );
  });

  app.get("/admin/managers/new", async () => {
    return layout(
      "Создать менеджера",
      `<h1>Создать менеджера</h1>${managerForm("/admin/managers", salonRepository.getActiveSalons())}`
    );
  });

  app.post("/admin/managers", async (request, reply) => {
    managerRepository.createManager(parseManagerForm(request.body));
    return reply.redirect("/admin/managers");
  });

  app.get<{ Params: { managerId: string } }>("/admin/managers/:managerId/edit", async (request, reply) => {
    const manager = managerRepository.getManagerById(Number(request.params.managerId));

    if (!manager) {
      reply.code(404);
      return layout("Менеджер не найден", "<h1>Менеджер не найден</h1>");
    }

    return layout(
      "Редактировать менеджера",
      `<h1>Редактировать менеджера</h1>${managerForm(
        `/admin/managers/${manager.manager_id}`,
        salonRepository.getAllSalons(),
        manager
      )}`
    );
  });

  app.post<{ Params: { managerId: string } }>("/admin/managers/:managerId", async (request, reply) => {
    managerRepository.updateManager(Number(request.params.managerId), parseManagerForm(request.body));
    return reply.redirect("/admin/managers");
  });
}

function managerForm(
  action: string,
  salons: { salon_id: number; salon_name: string }[],
  manager?: SalonManager
): string {
  return form(
    action,
    [
      selectField(
        "salon_id",
        "Салон",
        salons.map((salon) => ({ value: salon.salon_id, label: `${salon.salon_name} (#${salon.salon_id})` })),
        manager?.salon_id
      ),
      field({ name: "manager_name", label: "Имя менеджера", value: manager?.manager_name, required: true }),
      field({ name: "manager_phone", label: "Телефон", value: manager?.manager_phone }),
      field({ name: "manager_email", label: "Email", type: "email", value: manager?.manager_email }),
      field({ name: "position_title", label: "Должность", value: manager?.position_title }),
      selectField(
        "manager_role",
        "Роль",
        [
          { value: "manager", label: "manager" },
          { value: "director", label: "director" }
        ],
        manager?.manager_role ?? "manager"
      ),
      field({ name: "sort_order", label: "Порядок сортировки", type: "number", value: manager?.sort_order ?? 1000 }),
      field({ name: "is_active", label: "Активен", type: "checkbox", value: manager?.is_active ?? 1 })
    ].join(""),
    manager ? "Сохранить" : "Создать"
  );
}

function parseManagerForm(body: unknown): SalonManagerFormParams {
  const formBody = asFormBody(body);

  return {
    salon_id: requiredNumber(formBody, "salon_id"),
    manager_name: requiredString(formBody, "manager_name"),
    manager_phone: stringValue(formBody, "manager_phone"),
    manager_email: stringValue(formBody, "manager_email"),
    position_title: stringValue(formBody, "position_title"),
    manager_role: parseManagerRole(stringValue(formBody, "manager_role")),
    sort_order: requiredNumber(formBody, "sort_order", 1000),
    is_active: checkboxValue(formBody, "is_active")
  };
}

function parseManagerRole(value: string | undefined): string {
  return value === "director" ? "director" : "manager";
}
