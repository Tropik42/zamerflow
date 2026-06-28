import type { AppDatabase } from "./db.js";
import type { PaymentBy, Salon } from "../types/order.js";

export interface SalonRepository {
  getActiveSalons(): Salon[];
  getAllSalons(): Salon[];
  getSalonById(salonId: number): Salon | undefined;
  countSalons(): number;
  createSalon(params: SalonFormParams): number;
  updateSalon(salonId: number, params: SalonFormParams): void;
}

export interface SalonFormParams {
  salon_name: string;
  salon_alias?: string;
  salon_email?: string;
  base_price?: number;
  extra_price_min?: number;
  extra_price_max?: number;
  mileage_price_per_km?: number;
  default_payment_by?: PaymentBy;
  is_payment_by_fixed: number;
  payment_terms_text?: string;
  price_comment?: string;
  sort_order: number;
  is_active: number;
}

/**
 * Создаёт репозиторий для чтения справочника салонов.
 * @param {AppDatabase} db Открытое подключение к SQLite.
 * @returns {SalonRepository} Методы чтения активных салонов и салона по id.
 */
export function createSalonRepository(db: AppDatabase): SalonRepository {
  const selectActiveSalons = db.prepare(`
    SELECT
      salon_id,
      create_datetime,
      modify_datetime,
      salon_name,
      salon_alias,
      salon_email,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      default_payment_by,
      is_payment_by_fixed,
      payment_terms_text,
      price_comment,
      sort_order,
      is_active
    FROM salons
    WHERE is_active = 1
    ORDER BY sort_order ASC, salon_name ASC
  `);

  const selectAllSalons = db.prepare(`
    SELECT
      salon_id,
      create_datetime,
      modify_datetime,
      salon_name,
      salon_alias,
      salon_email,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      default_payment_by,
      is_payment_by_fixed,
      payment_terms_text,
      price_comment,
      sort_order,
      is_active
    FROM salons
    ORDER BY sort_order ASC, salon_name ASC
  `);

  const selectSalonById = db.prepare(`
    SELECT
      salon_id,
      create_datetime,
      modify_datetime,
      salon_name,
      salon_alias,
      salon_email,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      default_payment_by,
      is_payment_by_fixed,
      payment_terms_text,
      price_comment,
      sort_order,
      is_active
    FROM salons
    WHERE salon_id = ?
    LIMIT 1
  `);

  const countSalons = db.prepare("SELECT COUNT(*) AS count FROM salons");

  const insertSalon = db.prepare(`
    INSERT INTO salons (
      create_datetime,
      modify_datetime,
      salon_name,
      salon_alias,
      salon_email,
      base_price,
      extra_price_min,
      extra_price_max,
      mileage_price_per_km,
      default_payment_by,
      is_payment_by_fixed,
      payment_terms_text,
      price_comment,
      sort_order,
      is_active
    ) VALUES (
      datetime('now'),
      datetime('now'),
      @salonName,
      @salonAlias,
      @salonEmail,
      @basePrice,
      @extraPriceMin,
      @extraPriceMax,
      @mileagePricePerKm,
      @defaultPaymentBy,
      @isPaymentByFixed,
      @paymentTermsText,
      @priceComment,
      @sortOrder,
      @isActive
    )
  `);

  const updateSalon = db.prepare(`
    UPDATE salons
    SET
      modify_datetime = datetime('now'),
      salon_name = @salonName,
      salon_alias = @salonAlias,
      salon_email = @salonEmail,
      base_price = @basePrice,
      extra_price_min = @extraPriceMin,
      extra_price_max = @extraPriceMax,
      mileage_price_per_km = @mileagePricePerKm,
      default_payment_by = @defaultPaymentBy,
      is_payment_by_fixed = @isPaymentByFixed,
      payment_terms_text = @paymentTermsText,
      price_comment = @priceComment,
      sort_order = @sortOrder,
      is_active = @isActive
    WHERE salon_id = @salonId
  `);

  return {
    getActiveSalons() {
      return selectActiveSalons.all().map(mapSalonRow);
    },
    getAllSalons() {
      return selectAllSalons.all().map(mapSalonRow);
    },
    getSalonById(salonId) {
      const row = selectSalonById.get(salonId);
      return row ? mapSalonRow(row) : undefined;
    },
    countSalons() {
      const row = countSalons.get() as { count: number };
      return Number(row.count);
    },
    createSalon(params) {
      const result = insertSalon.run(toSalonSqlParams(params));
      return Number(result.lastInsertRowid);
    },
    updateSalon(salonId, params) {
      updateSalon.run({
        ...toSalonSqlParams(params),
        salonId
      });
    }
  };
}

function toSalonSqlParams(params: SalonFormParams) {
  return {
    salonName: params.salon_name,
    salonAlias: params.salon_alias ?? null,
    salonEmail: params.salon_email ?? null,
    basePrice: params.base_price ?? null,
    extraPriceMin: params.extra_price_min ?? null,
    extraPriceMax: params.extra_price_max ?? null,
    mileagePricePerKm: params.mileage_price_per_km ?? null,
    defaultPaymentBy: params.default_payment_by ?? null,
    isPaymentByFixed: params.is_payment_by_fixed,
    paymentTermsText: params.payment_terms_text ?? null,
    priceComment: params.price_comment ?? null,
    sortOrder: params.sort_order,
    isActive: params.is_active
  };
}

/**
 * Преобразует строку SQLite в типизированную модель салона.
 * @param {unknown} row Сырая строка результата better-sqlite3.
 * @returns {Salon} Типизированный салон.
 */
function mapSalonRow(row: unknown): Salon {
  const salon = row as Record<string, unknown>;

  return {
    salon_id: Number(salon.salon_id),
    create_datetime: String(salon.create_datetime),
    modify_datetime: String(salon.modify_datetime),
    salon_name: String(salon.salon_name),
    salon_alias: optionalString(salon.salon_alias),
    salon_email: optionalString(salon.salon_email),
    base_price: optionalNumber(salon.base_price),
    extra_price_min: optionalNumber(salon.extra_price_min),
    extra_price_max: optionalNumber(salon.extra_price_max),
    mileage_price_per_km: optionalNumber(salon.mileage_price_per_km),
    default_payment_by: optionalPaymentBy(salon.default_payment_by),
    is_payment_by_fixed: Number(salon.is_payment_by_fixed),
    payment_terms_text: optionalString(salon.payment_terms_text),
    price_comment: optionalString(salon.price_comment),
    sort_order: Number(salon.sort_order),
    is_active: Number(salon.is_active)
  };
}

/**
 * Преобразует nullable SQLite-значение в необязательную строку.
 * @param {unknown} value Значение из SQLite.
 * @returns {string | undefined} Строка или undefined.
 */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Преобразует nullable SQLite-значение в необязательное число.
 * @param {unknown} value Значение из SQLite.
 * @returns {number | undefined} Число или undefined.
 */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalPaymentBy(value: unknown): PaymentBy | undefined {
  return (
    value === "клиентом" ||
    value === "салоном" ||
    value === "депозит" ||
    value === "с ИП на самозанятого"
  )
    ? value
    : undefined;
}
