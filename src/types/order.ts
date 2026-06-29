export type ServiceItemType =
  | "кухня"
  | "шкаф"
  | "ниша под шкаф"
  | "тумба под раковину"
  | "гардеробная"
  | "инсталляция"
  | "ТВ-зона"
  | "рабочая зона"
  | "стеновые панели"
  | "по плану";

export interface ServiceItem {
  type: string;
  quantity: number;
  comment?: string;
  itemNameSnapshot?: string;
  unitPriceSnapshot?: number;
  priceTextSnapshot?: string;
  cardTextSnapshot?: string;
  isAutoAdded?: boolean;
  source?: string;
  sortOrder?: number;
}

export interface Salon {
  salon_id: number;
  create_datetime: string;
  modify_datetime: string;
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

export interface OrderItemRecord {
  order_item_id: number;
  order_id: number;
  create_datetime: string;
  modify_datetime: string;
  item_type: string;
  quantity: number;
  comment?: string;
  item_name_snapshot?: string;
  unit_price_snapshot?: number;
  price_text_snapshot?: string;
  card_text_snapshot?: string;
  is_auto_added: number;
  source?: string;
  sort_order: number;
}

export interface SalonRequiredItem {
  salon_required_item_id: number;
  salon_id: number;
  create_datetime: string;
  modify_datetime: string;
  item_type: string;
  item_name: string;
  unit_price?: number;
  price_text?: string;
  card_text?: string;
  quantity: number;
  is_required: number;
  auto_add_to_order: number;
  comment?: string;
  sort_order: number;
  is_active: number;
}

export type PaymentBy = "клиентом" | "салоном" | "депозит" | "с ИП на самозанятого";

export interface OrderDraft {
  salonId?: number;
  managerId?: number;
  salonNameSnapshot?: string;
  salonEmailSnapshot?: string;
  managerNameSnapshot?: string;
  managerPhoneSnapshot?: string;
  managerRoleSnapshot?: string;
  basePrice?: number;
  extraPriceMin?: number;
  extraPriceMax?: number;
  mileagePricePerKm?: number;
  paymentTermsText?: string;
  priceComment?: string;
  managerContact?: string;
  clientContact?: string;
  address?: string;
  metro?: string;
  measureDate?: string;
  measureTime?: string;
  serviceItems: ServiceItem[];
  paymentBy?: PaymentBy;
  isPaymentByFixed?: boolean;
  extraCharges?: string;
  comment?: string;
}

export interface AcceptedOrder {
  status: "accepted";
  salonId?: number;
  managerId?: number;
  salonNameSnapshot?: string;
  salonEmailSnapshot?: string;
  managerNameSnapshot?: string;
  managerPhoneSnapshot?: string;
  managerRoleSnapshot?: string;
  managerName?: string;
  managerContact?: string;
  clientContact?: string;
  address: string;
  metro?: string;
  measureDate?: string;
  measureTime?: string;
  serviceItems: ServiceItem[];
  paymentBy?: PaymentBy;
  basePrice?: number;
  extraPriceMin?: number;
  extraPriceMax?: number;
  mileagePricePerKm?: number;
  extraCharges?: string;
  comment?: string;
  formattedCardText: string;
  telegramUserId?: string;
}

export interface OrderRecord {
  order_id: number;
  create_datetime: string;
  modify_datetime: string;
  status: string;
  salon_id?: number;
  manager_id?: number;
  salon_name_snapshot?: string;
  salon_email_snapshot?: string;
  manager_name_snapshot?: string;
  manager_phone_snapshot?: string;
  manager_role_snapshot?: string;
  measure_date?: string;
  measure_time?: string;
  address: string;
  metro?: string;
  foreman_contact?: string;
  client_contact?: string;
  payment_by?: string;
  base_price?: number;
  extra_price_min?: number;
  extra_price_max?: number;
  mileage_price_per_km?: number;
  final_price?: number;
  extra_charges?: string;
  comment?: string;
  has_plan?: string;
  formatted_card_text: string;
  telegram_user_id?: string;
}

export type WizardStep =
  | "selectSalon"
  | "managerContact"
  | "clientContact"
  | "address"
  | "metro"
  | "measureDate"
  | "measureTime"
  | "selectServiceItem"
  | "manualServiceItem"
  | "paymentBy"
  | "extraCharges"
  | "comment"
  | "preview";

export interface WizardSession {
  step: WizardStep;
  draft: OrderDraft;
}
