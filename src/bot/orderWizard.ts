import { Markup, type Context, type Telegraf } from "telegraf";
import type { ManagerAuthCodeRepository } from "../db/managerAuthCodeRepository.js";
import type { OrderRepository } from "../db/orderRepository.js";
import type { SalonRequiredItemRepository } from "../db/salonRequiredItemRepository.js";
import type { SalonRepository } from "../db/salonRepository.js";
import type { TelegramUserRepository } from "../db/telegramUserRepository.js";
import { formatOrderCard } from "./formatOrderCard.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  AcceptedOrder,
  OrderDraft,
  PaymentBy,
  ServiceItemType,
  WizardSession
} from "../types/order.js";

type TextContext = Context & {
  message: {
    text: string;
  };
};

const cancelText = "❌ Отменить создание заявки";
const newOrderText = "➕ Новая заявка";
const whoamiText = "👤 Кто я";
const helpText = "ℹ️ Помощь";
const skipText = "Пропустить";
const finishItemsText = "Готово";
const salonsPerPage = 10;
const paymentByByCode: Record<string, PaymentBy> = {
  client: "клиентом",
  salon: "салоном",
  deposit: "депозит",
  ipToSelfEmployed: "с ИП на самозанятого"
};

const serviceItemTypes: ServiceItemType[] = [
  "кухня",
  "ниша под шкаф",
  "тумба под раковину",
  "гардеробная",
  "инсталляция",
  "ТВ-зона",
  "рабочая зона",
  "стеновые панели",
  "другое"
];

const sessions = new Map<string, WizardSession>();
const pendingAuthTelegramUserIds = new Set<string>();

/**
 * Регистрирует команды, текстовые обработчики и inline-действия сценария заявки.
 * @param {Telegraf<Context>} bot Экземпляр Telegram-бота.
 * @param {OrderRepository} orderRepository Репозиторий для сохранения заявок.
 * @param {SalonRepository} salonRepository Репозиторий для чтения справочника салонов.
 * @returns {void}
 */
export function registerOrderWizard(
  bot: Telegraf<Context>,
  orderRepository: OrderRepository,
  salonRepository: SalonRepository,
  salonRequiredItemRepository: SalonRequiredItemRepository,
  telegramUserRepository: TelegramUserRepository,
  managerAuthCodeRepository: ManagerAuthCodeRepository
): void {
  bot.start(async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.reply(
        "Привет! Я ZamerFlow. Чтобы оформить заявку в группе, отправьте /new и отвечайте на вопросы reply-сообщениями."
      );
      return;
    }

    await handleStart(ctx, telegramUserRepository);
  });

  bot.command("new", async (ctx) => {
    await startNewOrder(ctx, salonRepository, salonRequiredItemRepository, telegramUserRepository);
  });

  bot.command("whoami", async (ctx) => {
    await showWhoami(ctx, telegramUserRepository);
  });

  bot.command("cancel", async (ctx) => {
    await cancelOrder(ctx);
  });

  bot.hears(newOrderText, async (ctx) => {
    await startNewOrder(ctx, salonRepository, salonRequiredItemRepository, telegramUserRepository);
  });

  bot.hears(whoamiText, async (ctx) => {
    await showWhoami(ctx, telegramUserRepository);
  });

  bot.hears(helpText, async (ctx) => {
    await ctx.reply(
      "Чтобы оформить заявку, нажмите «➕ Новая заявка» или отправьте /new.",
      mainKeyboard()
    );
  });

  bot.hears(cancelText, async (ctx) => {
    await cancelOrder(ctx);
  });

  bot.action(/^salon:page:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    if (!session || session.step !== "selectSalon") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    const page = Number.parseInt(ctx.match[1] ?? "0", 10);
    await ctx.editMessageReplyMarkup(salonsKeyboard(salonRepository.getActiveSalons(), page).reply_markup);
  });

  bot.action(/^salon:select:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    if (!session || session.step !== "selectSalon") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    const salonId = Number.parseInt(ctx.match[1] ?? "", 10);
    const salon = salonRepository.getSalonById(salonId);

    if (!salon || salon.is_active !== 1) {
      await ctx.reply("Салон не найден или неактивен. Выберите салон из списка.");
      await ctx.reply("Выбери салон:", salonsKeyboard(salonRepository.getActiveSalons(), 0));
      return;
    }

    session.draft.salonId = salon.salon_id;
    session.draft.salonNameSnapshot = salon.salon_name;
    session.draft.salonEmailSnapshot = salon.salon_email;
    session.draft.basePrice = salon.base_price;
    session.draft.extraPriceMin = salon.extra_price_min;
    session.draft.extraPriceMax = salon.extra_price_max;
    session.draft.mileagePricePerKm = salon.mileage_price_per_km;
    session.draft.paymentTermsText = salon.payment_terms_text;
    session.draft.priceComment = salon.price_comment;
    session.draft.paymentBy = salon.is_payment_by_fixed === 1 ? salon.default_payment_by : undefined;
    session.draft.isPaymentByFixed = salon.is_payment_by_fixed === 1 && Boolean(salon.default_payment_by);
    session.draft.serviceItems.push(...getRequiredServiceItems(salon.salon_id, salonRequiredItemRepository));
    session.step = "managerContact";

    await replyQuestion(ctx, "2. Контакт менеджера?");
  });

  bot.action(/^service_item:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    const itemIndex = Number.parseInt(ctx.match[1] ?? "", 10);
    const serviceItemType = serviceItemTypes[itemIndex];

    if (!session || session.step !== "selectServiceItem" || !serviceItemType) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    await addServiceItem(ctx, session, serviceItemType);
  });

  bot.action("finish_items", async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    if (!session || session.step !== "selectServiceItem") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    if (session.draft.serviceItems.length === 0) {
      await ctx.reply("Добавьте хотя бы одну позицию под замер.", serviceItemsKeyboard(false));
      return;
    }

    await askPaymentOrExtraCharges(ctx, session);
  });

  bot.action(/^payment:(client|salon|deposit|ipToSelfEmployed)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    const paymentBy = paymentByByCode[ctx.match[1] ?? ""];

    if (!session || session.step !== "paymentBy" || !paymentBy) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    session.draft.paymentBy = paymentBy;
    session.step = "extraCharges";
    await replyQuestion(ctx, "9. Доплаты / особенности. Можно пропустить.", true);
  });

  bot.action("accept_order", async (ctx) => {
    const sessionKey = getSessionKey(ctx);
    const userId = ctx.from?.id;
    const session = sessionKey ? sessions.get(sessionKey) : undefined;

    await ctx.answerCbQuery();

    if (!userId || !sessionKey || !session || session.step !== "preview") {
      await ctx.reply("Черновик не найден. Начните новую заявку.", mainKeyboardForChat(ctx));
      return;
    }

    if (!isCompleteDraft(session.draft)) {
      await ctx.reply("Черновик заполнен не полностью. Начните заявку заново.", mainKeyboardForChat(ctx));
      sessions.delete(sessionKey);
      return;
    }

    const formattedCardText = formatOrderCard(session.draft);
    const order: AcceptedOrder = {
      ...session.draft,
      status: "accepted",
      address: session.draft.address,
      formattedCardText,
      telegramUserId: String(userId)
    };

    orderRepository.create(order);
    sessions.delete(sessionKey);

    await ctx.reply(
      "Заявка сохранена. Карточку можно скопировать и отправить куда нужно.",
      mainKeyboardForChat(ctx)
    );
  });

  bot.action("restart_order", async (ctx) => {
    await ctx.answerCbQuery();
    await startNewOrder(ctx, salonRepository, salonRequiredItemRepository, telegramUserRepository);
  });

  bot.action("cancel_order", async (ctx) => {
    await ctx.answerCbQuery();
    await cancelOrder(ctx);
  });

  bot.action("skip_optional", async (ctx) => {
    await ctx.answerCbQuery();

    const session = getSession(ctx);
    if (!session) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    await skipOptionalStep(ctx, session);
  });

  bot.on("text", async (ctx) => {
    await handleText(ctx as TextContext, telegramUserRepository, managerAuthCodeRepository);
  });
}

/**
 * Обрабатывает /start: проверяет привязку пользователя или переводит в ожидание кода.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {TelegramUserRepository} telegramUserRepository Репозиторий Telegram-пользователей.
 * @returns {Promise<void>}
 */
async function handleStart(
  ctx: Context,
  telegramUserRepository: TelegramUserRepository
): Promise<void> {
  const telegramUserId = getTelegramUserId(ctx);

  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  const user = telegramUserRepository.findByTelegramUserId(telegramUserId);

  if (isActiveAuthenticatedUser(user)) {
    pendingAuthTelegramUserIds.delete(telegramUserId);
    await ctx.reply(
      `Вы авторизованы как ${user.manager_name ?? "-"}, салон ${user.salon_name ?? "-"}.`,
      mainKeyboard()
    );
    return;
  }

  pendingAuthTelegramUserIds.add(telegramUserId);
  await ctx.reply(
    "Вы пока не привязаны к менеджеру. Введите код доступа, который вам выдал Олег.",
    Markup.removeKeyboard()
  );
}

async function handleAuthCodeAttempt(
  ctx: TextContext,
  authCode: string,
  telegramUserRepository: TelegramUserRepository,
  managerAuthCodeRepository: ManagerAuthCodeRepository
): Promise<void> {
  const telegramUserId = getTelegramUserId(ctx);

  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  const existingUser = telegramUserRepository.findByTelegramUserId(telegramUserId);
  if (isActiveAuthenticatedUser(existingUser)) {
    pendingAuthTelegramUserIds.delete(telegramUserId);
    await ctx.reply(
      `Вы уже авторизованы как ${existingUser.manager_name ?? "-"}, салон ${existingUser.salon_name ?? "-"}.`,
      mainKeyboard()
    );
    return;
  }

  try {
    const user = managerAuthCodeRepository.consumeAuthCode(authCode, {
      telegram_user_id: telegramUserId,
      username: ctx.from?.username,
      first_name: ctx.from?.first_name,
      last_name: ctx.from?.last_name
    });

    if (!user) {
      await ctx.reply("Код не найден или уже использован. Проверьте код и попробуйте ещё раз.");
      return;
    }

    pendingAuthTelegramUserIds.delete(telegramUserId);
    await ctx.reply(
      `Готово. Вы привязаны как ${user.manager_name ?? "-"}, салон ${user.salon_name ?? "-"}.`,
      mainKeyboard()
    );
  } catch {
    await ctx.reply("Код не найден или уже использован. Проверьте код и попробуйте ещё раз.");
  }
}

async function showWhoami(
  ctx: Context,
  telegramUserRepository: TelegramUserRepository
): Promise<void> {
  const telegramUserId = getTelegramUserId(ctx);

  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  const user = telegramUserRepository.findByTelegramUserId(telegramUserId);
  if (!isActiveAuthenticatedUser(user)) {
    await ctx.reply("Вы пока не авторизованы. Введите /start и код доступа.");
    return;
  }

  await ctx.reply(
    [
      `telegram_user_id: ${user.telegram_user_id}`,
      `username: ${user.username ? `@${user.username}` : "-"}`,
      `роль: ${user.role}`,
      `роль в салоне: ${user.manager_role ?? "-"}`,
      `салон: ${user.salon_name ?? user.salon_id}`,
      `менеджер: ${user.manager_name ?? user.manager_id}`
    ].join("\n"),
    mainKeyboardForChat(ctx)
  );
}

/**
 * Запускает новый черновик заявки и показывает выбор активного салона.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {SalonRepository} salonRepository Репозиторий справочника салонов.
 * @returns {Promise<void>}
 */
async function startNewOrder(
  ctx: Context,
  salonRepository: SalonRepository,
  salonRequiredItemRepository: SalonRequiredItemRepository,
  telegramUserRepository: TelegramUserRepository
): Promise<void> {
  const telegramUserId = getTelegramUserId(ctx);
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  const user = telegramUserRepository.findByTelegramUserId(telegramUserId);
  if (!isActiveAuthenticatedUser(user)) {
    await ctx.reply("Сначала нужно авторизоваться. Введите /start и код доступа.");
    return;
  }

  const sessionKey = getSessionKey(ctx);
  if (!sessionKey) {
    await ctx.reply("Не удалось определить чат.");
    return;
  }

  if (isSalonStaffUser(user)) {
    const salon = salonRepository.getSalonById(user.salon_id);

    if (!salon || salon.is_active !== 1) {
      await ctx.reply("Салон менеджера не найден или неактивен. Обратитесь к администратору.");
      return;
    }

    sessions.set(sessionKey, {
      step: "clientContact",
      draft: {
        salonId: salon.salon_id,
        managerId: user.manager_id,
        salonNameSnapshot: salon.salon_name,
        salonEmailSnapshot: salon.salon_email,
        managerNameSnapshot: user.manager_name,
        managerPhoneSnapshot: user.manager_phone,
        managerRoleSnapshot: user.manager_role ?? user.role,
        managerContact: formatManagerContact(user),
        basePrice: salon.base_price,
        extraPriceMin: salon.extra_price_min,
        extraPriceMax: salon.extra_price_max,
        mileagePricePerKm: salon.mileage_price_per_km,
        paymentTermsText: salon.payment_terms_text,
        priceComment: salon.price_comment,
        paymentBy: salon.is_payment_by_fixed === 1 ? salon.default_payment_by : undefined,
        isPaymentByFixed: salon.is_payment_by_fixed === 1 && Boolean(salon.default_payment_by),
        serviceItems: getRequiredServiceItems(salon.salon_id, salonRequiredItemRepository)
      }
    });

    await replyQuestion(ctx, "Контакт клиента или представителя.");
    return;
  }

  sessions.set(sessionKey, {
    step: "selectSalon",
    draft: {
      serviceItems: []
    }
  });

  const salons = salonRepository.getActiveSalons();

  if (salons.length === 0) {
    sessions.delete(sessionKey);
    await ctx.reply("В базе пока нет активных салонов. Добавь салоны в таблицу salons.");
    return;
  }

  await ctx.reply("Выбери салон:", salonsKeyboard(salons, 0));
}

/**
 * Обрабатывает текстовые ответы пользователя в текущем шаге wizard-сценария.
 * @param {TextContext} ctx Контекст Telegram-сообщения с текстом.
 * @returns {Promise<void>}
 */
async function handleText(
  ctx: TextContext,
  telegramUserRepository: TelegramUserRepository,
  managerAuthCodeRepository: ManagerAuthCodeRepository
): Promise<void> {
  const telegramUserId = getTelegramUserId(ctx);
  if (!telegramUserId) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  const text = ctx.message.text.trim();

  if (pendingAuthTelegramUserIds.has(telegramUserId)) {
    await handleAuthCodeAttempt(ctx, text, telegramUserRepository, managerAuthCodeRepository);
    return;
  }

  const session = getSession(ctx);
  if (!session) {
    if (isPrivateChat(ctx)) {
      await ctx.reply("Нажмите «➕ Новая заявка» или отправьте /new.", mainKeyboard());
    }
    return;
  }

  if (!isPrivateChat(ctx) && !isReplyToBot(ctx)) {
    return;
  }

  switch (session.step) {
    case "selectSalon":
      await ctx.reply("Выберите салон кнопкой из списка.");
      return;
    case "managerContact":
      session.draft.managerContact = text;
      session.draft.managerNameSnapshot = text;
      session.draft.managerRoleSnapshot = "manager";
      session.step = "clientContact";
      await replyQuestion(ctx, "3. Контакт клиента или представителя.");
      return;
    case "clientContact":
      session.draft.clientContact = text;
      session.step = "address";
      await replyQuestion(ctx, "4. Точный адрес клиента с населённым пунктом.");
      return;
    case "address":
      session.draft.address = text;
      session.step = "metro";
      await replyQuestion(ctx, "5. Метро / ориентир. Можно пропустить.", true);
      return;
    case "metro":
      if (text === skipText) {
        await skipOptionalStep(ctx, session);
        return;
      }

      session.draft.metro = text;
      session.step = "measureDate";
      await replyQuestion(ctx, "6. Дата замера.");
      return;
    case "measureDate":
      session.draft.measureDate = text;
      session.step = "selectServiceItem";
      await askServiceItem(ctx);
      return;
    case "selectServiceItem":
      await handleServiceItemSelection(ctx, session, text);
      return;
    case "paymentBy":
      await handlePaymentBy(ctx, session, text);
      return;
    case "extraCharges":
      if (text === skipText) {
        await skipOptionalStep(ctx, session);
        return;
      }

      session.draft.extraCharges = text;
      session.step = "comment";
      await replyQuestion(ctx, "10. Комментарий. Можно пропустить.", true);
      return;
    case "comment":
      if (text === skipText) {
        await skipOptionalStep(ctx, session);
        return;
      }

      session.draft.comment = text;
      await showPreview(ctx, session);
      return;
    case "preview":
      await ctx.reply("Используйте кнопки под предпросмотром заявки.");
      return;
  }
}

/**
 * Обрабатывает выбор или завершение ввода позиций замера.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @param {string} text Текст выбранной или введённой позиции.
 * @returns {Promise<void>}
 */
async function handleServiceItemSelection(
  ctx: Context,
  session: WizardSession,
  text: string
): Promise<void> {
  if (text === finishItemsText) {
    if (session.draft.serviceItems.length === 0) {
      await ctx.reply("Добавьте хотя бы одну позицию под замер.", serviceItemsKeyboard(false));
      return;
    }

    await askPaymentOrExtraCharges(ctx, session);
    return;
  }

  if (!isServiceItemType(text)) {
    await ctx.reply("Выберите позицию кнопкой.", serviceItemsKeyboard(session.draft.serviceItems.length > 0));
    return;
  }

  await addServiceItem(ctx, session, text);
}

/**
 * Добавляет позицию замера в черновик.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @param {ServiceItemType} serviceItemType Тип позиции замера.
 * @returns {Promise<void>}
 */
async function addServiceItem(
  ctx: Context,
  session: WizardSession,
  serviceItemType: ServiceItemType
): Promise<void> {
  session.draft.serviceItems.push({
    type: serviceItemType,
    quantity: 1
  });
  session.step = "selectServiceItem";

  await ctx.reply("Позиция добавлена. Добавить ещё позицию?", serviceItemsKeyboard(true));
}

function getRequiredServiceItems(
  salonId: number,
  salonRequiredItemRepository: SalonRequiredItemRepository
) {
  return salonRequiredItemRepository.getActiveRequiredItemsBySalonId(salonId).map((item) => ({
    type: item.item_type,
    quantity: item.quantity,
    comment: item.comment,
    itemNameSnapshot: item.item_name,
    unitPriceSnapshot: item.unit_price,
    priceTextSnapshot: item.price_text,
    cardTextSnapshot: item.card_text,
    isAutoAdded: true,
    source: "salon_required_item",
    sortOrder: item.sort_order
  }));
}

/**
 * Обрабатывает выбранный вариант оплаты замера.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @param {string} text Текст варианта оплаты.
 * @returns {Promise<void>}
 */
async function handlePaymentBy(
  ctx: Context,
  session: WizardSession,
  text: string
): Promise<void> {
  if (!isPaymentBy(text)) {
    await ctx.reply("Выберите вариант оплаты кнопкой.", paymentKeyboard());
    return;
  }

  session.draft.paymentBy = text;
  session.step = "extraCharges";
  await replyQuestion(ctx, "9. Доплаты / особенности. Можно пропустить.", true);
}

async function askPaymentOrExtraCharges(ctx: Context, session: WizardSession): Promise<void> {
  if (session.draft.paymentBy) {
    session.step = "extraCharges";
    await replyQuestion(ctx, "9. Доплаты / особенности. Можно пропустить.", true);
    return;
  }

  session.step = "paymentBy";
  await ctx.reply("8. Кто оплачивает замер?", paymentKeyboard());
}

/**
 * Показывает пользователю inline-кнопки выбора позиции замера.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {Promise<void>}
 */
async function askServiceItem(ctx: Context): Promise<void> {
  await ctx.reply("7. Позиции под замер с количеством. Выберите позицию.", serviceItemsKeyboard(false));
}

/**
 * Проверяет, является ли текст допустимым типом позиции замера.
 * @param {string} text Проверяемый текст.
 * @returns {boolean} true, если текст является ServiceItemType.
 */
function isServiceItemType(text: string): text is ServiceItemType {
  return serviceItemTypes.includes(text as ServiceItemType);
}

/**
 * Проверяет, является ли текст допустимым вариантом оплаты.
 * @param {string} text Проверяемый текст.
 * @returns {boolean} true, если текст является PaymentBy.
 */
function isPaymentBy(text: string): text is PaymentBy {
  return (
    text === "клиентом" ||
    text === "салоном" ||
    text === "депозит" ||
    text === "с ИП на самозанятого"
  );
}

/**
 * Проверяет, достаточно ли данных в черновике для сохранения заявки.
 * @param {OrderDraft} draft Черновик заявки.
 * @returns {boolean} true, если заполнены обязательные поля.
 */
function isCompleteDraft(draft: OrderDraft): draft is OrderDraft & { address: string } {
  return Boolean(draft.salonId && draft.salonNameSnapshot && draft.address && draft.serviceItems.length > 0);
}

/**
 * Создаёт основную reply-клавиатуру стартового экрана.
 * @returns {ReturnType<typeof Markup.keyboard>} Reply-клавиатура с новой заявкой и помощью.
 */
function mainKeyboard() {
  return Markup.keyboard([[newOrderText], [whoamiText, helpText]]).resize();
}

/**
 * Возвращает основную клавиатуру для личного чата или удаление клавиатуры для группы.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {ReturnType<typeof mainKeyboard> | ReturnType<typeof Markup.removeKeyboard>} Разметка клавиатуры.
 */
function mainKeyboardForChat(ctx: Context) {
  return isPrivateChat(ctx) ? mainKeyboard() : Markup.removeKeyboard();
}

/**
 * Создаёт reply-клавиатуру отмены для текстовых шагов.
 * @returns {ReturnType<typeof Markup.keyboard>} Reply-клавиатура с отменой.
 */
function cancelKeyboard() {
  return Markup.keyboard([[cancelText]]).resize();
}

/**
 * Создаёт reply-клавиатуру пропуска необязательного шага.
 * @returns {ReturnType<typeof Markup.keyboard>} Reply-клавиатура с пропуском и отменой.
 */
function skipKeyboard() {
  return Markup.keyboard([[skipText], [cancelText]]).resize();
}

/**
 * Создаёт inline-клавиатуру для необязательного текстового шага.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура пропуска и отмены.
 */
function optionalStepKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback(skipText, "skip_optional")]]);
}

/**
 * Создаёт inline-клавиатуру выбора салона с пагинацией.
 * @param {{salon_id: number, salon_name: string}[]} salons Активные салоны.
 * @param {number} page Номер страницы, начиная с 0.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура салонов.
 */
function salonsKeyboard(salons: { salon_id: number; salon_name: string }[], page: number) {
  const totalPages = Math.max(1, Math.ceil(salons.length / salonsPerPage));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const startIndex = safePage * salonsPerPage;
  const pageSalons = salons.slice(startIndex, startIndex + salonsPerPage);
  const rows = pageSalons.map((salon) => [
    Markup.button.callback(salon.salon_name, `salon:select:${salon.salon_id}`)
  ]);
  const navigationRow = [];

  if (safePage > 0) {
    navigationRow.push(Markup.button.callback("◀️ Назад", `salon:page:${safePage - 1}`));
  }

  if (safePage < totalPages - 1) {
    navigationRow.push(Markup.button.callback("▶️ Далее", `salon:page:${safePage + 1}`));
  }

  if (navigationRow.length > 0) {
    rows.push(navigationRow);
  }

  rows.push([Markup.button.callback(cancelText, "cancel_order")]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Создаёт inline-клавиатуру выбора позиций замера.
 * @param {boolean} canFinish Можно ли завершить выбор позиций.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура позиций.
 */
function serviceItemsKeyboard(canFinish: boolean) {
  const rows = [
    [
      Markup.button.callback("кухня", "service_item:0"),
      Markup.button.callback("ниша под шкаф", "service_item:1")
    ],
    [Markup.button.callback("тумба под раковину", "service_item:2")],
    [
      Markup.button.callback("гардеробная", "service_item:3"),
      Markup.button.callback("инсталляция", "service_item:4")
    ],
    [
      Markup.button.callback("ТВ-зона", "service_item:5"),
      Markup.button.callback("рабочая зона", "service_item:6")
    ],
    [
      Markup.button.callback("стеновые панели", "service_item:7"),
      Markup.button.callback("другое", "service_item:8")
    ]
  ];

  if (canFinish) {
    rows.push([Markup.button.callback(finishItemsText, "finish_items")]);
  }

  rows.push([Markup.button.callback(cancelText, "cancel_order")]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Создаёт inline-клавиатуру выбора плательщика.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура вариантов оплаты.
 */
function paymentKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("клиентом", "payment:client")],
    [Markup.button.callback("салоном", "payment:salon")],
    [Markup.button.callback("депозит", "payment:deposit")],
    [
      Markup.button.callback("с ИП на самозанятого", "payment:ipToSelfEmployed")
    ],
    [Markup.button.callback(cancelText, "cancel_order")]
  ]);
}

/**
 * Создаёт inline-клавиатуру действий на предпросмотре заявки.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура принятия, перезаполнения и отмены.
 */
function previewKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Принять", "accept_order")],
    [Markup.button.callback("✏️ Заполнить заново", "restart_order")],
    [Markup.button.callback(cancelText, "cancel_order")]
  ]);
}

/**
 * Проверяет, открыт ли бот в личном чате.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {boolean} true для private-чата.
 */
function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
}

function getTelegramUserId(ctx: Context): string | undefined {
  return ctx.from?.id ? String(ctx.from.id) : undefined;
}

function isActiveAuthenticatedUser(user: unknown): user is AuthenticatedUser {
  const candidate = user as Partial<AuthenticatedUser> | undefined;

  return Boolean(
    candidate &&
      candidate.is_active === 1 &&
      candidate.salon_id &&
      candidate.manager_id
  );
}

function isSalonStaffUser(user: AuthenticatedUser): boolean {
  return user.role === "manager" || user.role === "director" || user.manager_role === "manager" || user.manager_role === "director";
}

function formatManagerContact(user: AuthenticatedUser): string | undefined {
  if (user.manager_name && user.manager_phone) {
    return `${user.manager_name}, ${user.manager_phone}`;
  }

  return user.manager_name ?? user.manager_phone;
}

/**
 * Формирует ключ wizard-сессии по паре chat id и user id.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {string | undefined} Ключ сессии или undefined, если нет chat/from.
 */
function getSessionKey(ctx: Context): string | undefined {
  if (!ctx.chat?.id || !ctx.from?.id) {
    return undefined;
  }

  return `${ctx.chat.id}:${ctx.from.id}`;
}

/**
 * Возвращает текущую wizard-сессию для пользователя в чате.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {WizardSession | undefined} Найденная сессия или undefined.
 */
function getSession(ctx: Context): WizardSession | undefined {
  const sessionKey = getSessionKey(ctx);
  return sessionKey ? sessions.get(sessionKey) : undefined;
}

/**
 * Проверяет, является ли сообщение reply на сообщение бота.
 * @param {TextContext} ctx Контекст текстового сообщения.
 * @returns {boolean} true, если пользователь ответил на сообщение бота.
 */
function isReplyToBot(ctx: TextContext): boolean {
  const message = ctx.message as {
    reply_to_message?: {
      from?: {
        id?: number;
      };
    };
  };

  return message.reply_to_message?.from?.id === ctx.botInfo?.id;
}

/**
 * Отправляет текстовый вопрос с подходящей разметкой для личного чата или группы.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {string} text Текст вопроса.
 * @param {boolean} canSkip Можно ли пропустить шаг.
 * @returns {Promise<void>}
 */
async function replyQuestion(ctx: Context, text: string, canSkip = false): Promise<void> {
  if (isPrivateChat(ctx)) {
    await ctx.reply(text, canSkip ? skipKeyboard() : cancelKeyboard());
    return;
  }

  const hint = canSkip
    ? `Ответьте на это сообщение или нажмите «${skipText}». Для отмены создания всей заявки наберите команду /cancel.`
    : "Ответьте на это сообщение. Для отмены создания всей заявки наберите команду /cancel.";

  await ctx.reply(`${text}\n\n${hint}`, Markup.forceReply().selective());

  if (canSkip) {
    await ctx.reply("Можно пропустить этот шаг:", optionalStepKeyboard());
  }
}

/**
 * Показывает предпросмотр карточки заявки и inline-действия.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @returns {Promise<void>}
 */
async function showPreview(ctx: Context, session: WizardSession): Promise<void> {
  session.step = "preview";

  if (isPrivateChat(ctx)) {
    await ctx.reply("Предпросмотр заявки:", Markup.removeKeyboard());
  } else {
    await ctx.reply("Предпросмотр заявки:");
  }

  await ctx.reply(formatOrderCard(session.draft), previewKeyboard());
}

/**
 * Пропускает текущий необязательный шаг и переводит сценарий дальше.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @returns {Promise<void>}
 */
async function skipOptionalStep(ctx: Context, session: WizardSession): Promise<void> {
  switch (session.step) {
    case "metro":
      session.draft.metro = undefined;
      session.step = "measureDate";
      await replyQuestion(ctx, "6. Дата замера.");
      return;
    case "extraCharges":
      session.draft.extraCharges = undefined;
      session.step = "comment";
      await replyQuestion(ctx, "10. Комментарий. Можно пропустить.", true);
      return;
    case "comment":
      session.draft.comment = undefined;
      await showPreview(ctx, session);
      return;
    default:
      await ctx.reply("Сейчас этот шаг нельзя пропустить.");
  }
}

/**
 * Отменяет текущий черновик заявки для пользователя в чате.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {Promise<void>}
 */
async function cancelOrder(ctx: Context): Promise<void> {
  const sessionKey = getSessionKey(ctx);
  if (sessionKey) {
    sessions.delete(sessionKey);
  }

  await ctx.reply("Заявка отменена.", mainKeyboardForChat(ctx));
}
