import type { FastifyInstance } from "fastify";
import {
  asFormBody,
  checkboxValue,
  numberValue,
  requiredNumber,
  requiredString,
  stringValue
} from "../form.js";
import { field, form, layout, selectField, table, value, yesNo } from "../html.js";
import type {
  SalonRequiredItemFormParams,
  SalonRequiredItemRepository
} from "../../db/salonRequiredItemRepository.js";
import type { SalonRepository, SalonFormParams } from "../../db/salonRepository.js";
import type { PaymentBy, Salon } from "../../types/order.js";

export function registerSalonRoutes(
  app: FastifyInstance,
  salonRepository: SalonRepository,
  salonRequiredItemRepository: SalonRequiredItemRepository
): void {
  app.get("/admin/salons", async () => {
    const salons = salonRepository.getAllSalons();

    return layout(
      "Салоны",
      `<h1>Салоны</h1>
      <div class="actions"><a class="button" href="/admin/salons/new">Создать салон</a></div>
      ${table(
        [
          "salon_id",
          "salon_name",
          "salon_email",
          "base_price",
          "extra_price_min",
          "extra_price_max",
          "mileage_price_per_km",
          "default_payment_by",
          "is_payment_by_fixed",
          "sort_order",
          "is_active",
          ""
        ],
        salons.map((salon) => [
          value(salon.salon_id),
          value(salon.salon_name),
          value(salon.salon_email),
          value(salon.base_price),
          value(salon.extra_price_min),
          value(salon.extra_price_max),
          value(salon.mileage_price_per_km),
          value(salon.default_payment_by),
          yesNo(salon.is_payment_by_fixed),
          value(salon.sort_order),
          yesNo(salon.is_active),
          `<a href="/admin/salons/${salon.salon_id}/edit">редактировать</a>`
        ])
      )}`
    );
  });

  app.get("/admin/salons/new", async () => {
    return layout("Создать салон", `<h1>Создать салон</h1>${salonForm("/admin/salons")}`);
  });

  app.post("/admin/salons", async (request, reply) => {
    salonRepository.createSalon(parseSalonForm(request.body));
    return reply.redirect("/admin/salons");
  });

  app.get<{ Params: { salonId: string } }>("/admin/salons/:salonId/edit", async (request, reply) => {
    const salon = salonRepository.getSalonById(Number(request.params.salonId));

    if (!salon) {
      reply.code(404);
      return layout("Салон не найден", "<h1>Салон не найден</h1>");
    }

    return layout(
      "Редактировать салон",
      `<h1>Редактировать салон</h1>
      ${salonForm(`/admin/salons/${salon.salon_id}`, salon)}
      ${requiredItemsBlock(salon.salon_id, salonRequiredItemRepository)}`
    );
  });

  app.post<{ Params: { salonId: string } }>("/admin/salons/:salonId", async (request, reply) => {
    salonRepository.updateSalon(Number(request.params.salonId), parseSalonForm(request.body));
    return reply.redirect("/admin/salons");
  });

  app.post<{ Params: { salonId: string } }>("/admin/salons/:salonId/required-items", async (request, reply) => {
    const salonId = Number(request.params.salonId);
    salonRequiredItemRepository.createRequiredItem(parseRequiredItemForm(salonId, request.body));
    return reply.redirect(`/admin/salons/${salonId}/edit`);
  });
}

function salonForm(action: string, salon?: Salon): string {
  return form(
    action,
    [
      field({ name: "salon_name", label: "Название", value: salon?.salon_name, required: true }),
      field({ name: "salon_alias", label: "Алиас", value: salon?.salon_alias }),
      field({ name: "salon_email", label: "Email", type: "email", value: salon?.salon_email }),
      field({ name: "base_price", label: "Базовая цена", type: "number", value: salon?.base_price }),
      field({ name: "extra_price_min", label: "Доппозиция от", type: "number", value: salon?.extra_price_min }),
      field({ name: "extra_price_max", label: "Доппозиция до", type: "number", value: salon?.extra_price_max }),
      field({
        name: "mileage_price_per_km",
        label: "Километраж за км",
        type: "number",
        value: salon?.mileage_price_per_km
      }),
      selectField(
        "default_payment_by",
        "Тип оплаты по умолчанию",
        [
          { value: "", label: "Не задан" },
          { value: "клиентом", label: "клиентом" },
          { value: "салоном", label: "салоном" },
          { value: "депозит", label: "депозит" },
          { value: "с ИП на самозанятого", label: "с ИП на самозанятого" }
        ],
        salon?.default_payment_by ?? "",
        false
      ),
      field({
        name: "is_payment_by_fixed",
        label: "Не спрашивать оплату в боте",
        type: "checkbox",
        value: salon?.is_payment_by_fixed ?? 0
      }),
      field({
        name: "payment_terms_text",
        label: "Текст условий оплаты",
        type: "textarea",
        value: salon?.payment_terms_text
      }),
      field({ name: "price_comment", label: "Комментарий к цене", type: "textarea", value: salon?.price_comment }),
      field({ name: "sort_order", label: "Порядок сортировки", type: "number", value: salon?.sort_order ?? 1000 }),
      field({ name: "is_active", label: "Активен", type: "checkbox", value: salon?.is_active ?? 1 })
    ].join(""),
    salon ? "Сохранить" : "Создать"
  );
}

function requiredItemsBlock(
  salonId: number,
  salonRequiredItemRepository: SalonRequiredItemRepository
): string {
  const items = salonRequiredItemRepository.getRequiredItemsBySalonId(salonId);

  return `<h2>Обязательные позиции</h2>
    ${table(
      [
        "item_name",
        "unit_price",
        "price_text",
        "card_text",
        "is_required",
        "auto_add_to_order",
        "is_active"
      ],
      items.map((item) => [
        value(item.item_name),
        value(item.unit_price),
        value(item.price_text),
        value(item.card_text),
        yesNo(item.is_required),
        yesNo(item.auto_add_to_order),
        yesNo(item.is_active)
      ])
    )}
    <h2>Добавить обязательную позицию</h2>
    ${form(
      `/admin/salons/${salonId}/required-items`,
      [
        field({ name: "item_type", label: "Тип", value: "delivery_path_measurement", required: true }),
        field({ name: "item_name", label: "Название", required: true }),
        field({ name: "unit_price", label: "Цена", type: "number" }),
        field({ name: "price_text", label: "Текст цены" }),
        field({ name: "card_text", label: "Строка для карточки" }),
        field({ name: "quantity", label: "Количество", type: "number", value: 1 }),
        field({ name: "is_required", label: "Обязательная", type: "checkbox", value: 1 }),
        field({ name: "auto_add_to_order", label: "Автоматически добавлять", type: "checkbox", value: 1 }),
        field({ name: "comment", label: "Комментарий", type: "textarea" }),
        field({ name: "sort_order", label: "Порядок сортировки", type: "number", value: 1000 }),
        field({ name: "is_active", label: "Активна", type: "checkbox", value: 1 })
      ].join(""),
      "Добавить позицию"
    )}`;
}

function parseSalonForm(body: unknown): SalonFormParams {
  const formBody = asFormBody(body);
  const defaultPaymentBy = paymentByValue(formBody, "default_payment_by");

  return {
    salon_name: requiredString(formBody, "salon_name"),
    salon_alias: stringValue(formBody, "salon_alias"),
    salon_email: stringValue(formBody, "salon_email"),
    base_price: numberValue(formBody, "base_price"),
    extra_price_min: numberValue(formBody, "extra_price_min"),
    extra_price_max: numberValue(formBody, "extra_price_max"),
    mileage_price_per_km: numberValue(formBody, "mileage_price_per_km"),
    default_payment_by: defaultPaymentBy,
    is_payment_by_fixed: defaultPaymentBy ? checkboxValue(formBody, "is_payment_by_fixed") : 0,
    payment_terms_text: stringValue(formBody, "payment_terms_text"),
    price_comment: stringValue(formBody, "price_comment"),
    sort_order: requiredNumber(formBody, "sort_order", 1000),
    is_active: checkboxValue(formBody, "is_active")
  };
}

function paymentByValue(body: ReturnType<typeof asFormBody>, name: string): PaymentBy | undefined {
  const valueToParse = stringValue(body, name);

  return (
    valueToParse === "клиентом" ||
    valueToParse === "салоном" ||
    valueToParse === "депозит" ||
    valueToParse === "с ИП на самозанятого"
  )
    ? valueToParse
    : undefined;
}

function parseRequiredItemForm(salonId: number, body: unknown): SalonRequiredItemFormParams {
  const formBody = asFormBody(body);

  return {
    salon_id: salonId,
    item_type: requiredString(formBody, "item_type"),
    item_name: requiredString(formBody, "item_name"),
    unit_price: numberValue(formBody, "unit_price"),
    price_text: stringValue(formBody, "price_text"),
    card_text: stringValue(formBody, "card_text"),
    quantity: requiredNumber(formBody, "quantity", 1),
    is_required: checkboxValue(formBody, "is_required"),
    auto_add_to_order: checkboxValue(formBody, "auto_add_to_order"),
    comment: stringValue(formBody, "comment"),
    sort_order: requiredNumber(formBody, "sort_order", 1000),
    is_active: checkboxValue(formBody, "is_active")
  };
}
