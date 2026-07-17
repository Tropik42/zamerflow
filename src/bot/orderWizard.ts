import { Markup, type Context, type Telegraf } from "telegraf";
import type { ManagerAuthCodeRepository } from "../db/managerAuthCodeRepository.js";
import type { SalonRequiredItemRepository } from "../db/salonRequiredItemRepository.js";
import type { SalonRepository } from "../db/salonRepository.js";
import type { TelegramUserRepository } from "../db/telegramUserRepository.js";
import { logInfo } from "../logger.js";
import type { AddressGeoService } from "../services/addressGeoService.js";
import type { OrderSubmissionService } from "../services/orderSubmissionService.js";
import { formatOrderCard } from "./formatOrderCard.js";
import {
  getMeasurePaymentOptionByKey,
  isMeasurePaymentValue,
  measurePaymentOptions
} from "./measurePaymentOptions.js";
import {
  getMeasureServiceItemByKey,
  isMeasureServiceItemType,
  measureServiceItems
} from "./measureServiceItems.js";
import { safeAnswerCbQuery } from "./safeAnswerCbQuery.js";
import { formatWhoamiProfile } from "./whoamiProfile.js";
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

type PhotoContext = Context & {
  message: {
    photo: Array<{
      file_id: string;
      file_unique_id?: string;
    }>;
  };
};

const cancelText = "❌ Отменить создание заявки";
const newOrderText = "➕ Новая заявка";
const whoamiText = "👤 Кто я";
const helpText = "ℹ️ Помощь";
const skipText = "Пропустить";
const finishItemsText = "Готово";
const salonsPerPage = 10;
const maxOrderPhotos = 5;
const photosQuestionText = [
  "Есть фото / проект / план помещения?",
  "",
  "Отправьте до 5 фотографий.",
  "Когда закончите, нажмите «Готово»."
].join("\n");

const sessions = new Map<string, WizardSession>();
const pendingAuthTelegramUserIds = new Set<string>();

/**
 * Регистрирует команды, текстовые обработчики и inline-действия сценария заявки.
 * @param {Telegraf<Context>} bot Экземпляр Telegram-бота.
 * @param {SalonRepository} salonRepository Репозиторий для чтения справочника салонов.
 * @returns {void}
 */
export function registerOrderWizard(
  bot: Telegraf<Context>,
  orderSubmissionService: OrderSubmissionService,
  salonRepository: SalonRepository,
  salonRequiredItemRepository: SalonRequiredItemRepository,
  telegramUserRepository: TelegramUserRepository,
  managerAuthCodeRepository: ManagerAuthCodeRepository,
  addressGeoService: AddressGeoService
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

  bot.command("chatid", async (ctx) => {
    await showChatId(ctx);
  });

  bot.command("chatId", async (ctx) => {
    await showChatId(ctx);
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
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session || session.step !== "selectSalon") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    const page = Number.parseInt(ctx.match[1] ?? "0", 10);
    await ctx.editMessageReplyMarkup(salonsKeyboard(salonRepository.getActiveSalons(), page).reply_markup);
  });

  bot.action(/^salon:select:(\d+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);

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

    logInfo("order_draft_salon_selected", {
      telegram_user_id: getTelegramUserId(ctx),
      chat_id: ctx.chat?.id,
      salon_id: salon.salon_id,
      salon_name: salon.salon_name,
      step: session.step
    });

    await replyQuestion(ctx, "2. Контакт менеджера?");
  });

  bot.action(/^service_item:([a-z0-9_]+)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    const serviceItem = getMeasureServiceItemByKey(ctx.match[1] ?? "");

    if (!session || session.step !== "selectServiceItem" || !serviceItem) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    await addServiceItem(ctx, session, serviceItem.itemType);
  });

  bot.action("finish_items", async (ctx) => {
    await safeAnswerCbQuery(ctx);

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

  bot.action("manual_service_item", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session || session.step !== "selectServiceItem") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    session.step = "manualServiceItem";
    await replyQuestion(ctx, "Введите позицию под замер вручную.");
  });

  bot.action(/^payment:(client|salon|deposit|ipToSelfEmployed)$/, async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    const paymentOption = getMeasurePaymentOptionByKey(ctx.match[1] ?? "");

    if (!session || session.step !== "paymentBy" || !paymentOption) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    session.draft.paymentBy = paymentOption.value;
    session.step = "extraCharges";
    await replyQuestion(ctx, "10. Доплаты / особенности. Можно пропустить.", true);
  });

  bot.action("accept_order", async (ctx) => {
    const sessionKey = getSessionKey(ctx);
    const userId = ctx.from?.id;
    const session = sessionKey ? sessions.get(sessionKey) : undefined;

    await safeAnswerCbQuery(ctx);

    if (!userId || !sessionKey || !session || session.step !== "preview") {
      await ctx.reply("Черновик не найден. Начните новую заявку.", mainKeyboardForChat(ctx));
      return;
    }

    if (session.acceptedOrderId) {
      await ctx.reply(`Заявка уже принята. Номер заявки: #${session.acceptedOrderId}`);
      return;
    }

    if (session.isSubmitting) {
      await ctx.reply("Заявка уже обрабатывается.");
      return;
    }

    if (!isCompleteDraft(session.draft)) {
      await ctx.reply("Черновик заполнен не полностью. Начните заявку заново.", mainKeyboardForChat(ctx));
      sessions.delete(sessionKey);
      return;
    }

    const photosForSubmission = [...session.photos];

    session.isSubmitting = true;

    const formattedCardText = formatOrderCard(session.draft);
    const order: AcceptedOrder = {
      ...session.draft,
      status: "accepted",
      address: session.draft.address,
      formattedCardText,
      hasPhotos: photosForSubmission.length > 0,
      telegramUserId: String(userId)
    };

    if (photosForSubmission.length > 0) {
      logInfo("order_confirmed_with_photos", {
        ...photoLifecycleLogFields(ctx, session),
        photo_count: photosForSubmission.length
      });
    }

    try {
      const result = await orderSubmissionService.submitAcceptedOrder({
        order,
        photos: photosForSubmission,
        sourceChatId: ctx.chat?.id
      });

      session.acceptedOrderId = result.orderId;
      session.isSubmitting = false;
      session.photos = [];

      if (result.dispatchNotificationStatus === "sent") {
        await ctx.reply(
          `✅ Заявка #${result.orderId} принята и отправлена в рабочий чат.`,
          mainKeyboardForChat(ctx)
        );
        return;
      }

      await ctx.reply(
        `⚠️ Заявка #${result.orderId} сохранена, но не удалось полностью отправить её в рабочий чат.\nФотографии временно не сохраняются, поэтому для их повторной отправки может потребоваться создать заявку заново или отправить фото вручную.`,
        mainKeyboardForChat(ctx)
      );
    } catch {
      session.isSubmitting = false;
      await ctx.reply(
        "Не удалось сохранить заявку. Попробуйте принять её ещё раз или обратитесь к администратору.",
        mainKeyboardForChat(ctx)
      );
    }
  });

  bot.action("restart_order", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (session?.acceptedOrderId) {
      await ctx.reply(`Заявка уже принята. Номер заявки: #${session.acceptedOrderId}`);
      return;
    }

    if (session?.isSubmitting) {
      await ctx.reply("Заявка уже обрабатывается.");
      return;
    }

    await startNewOrder(ctx, salonRepository, salonRequiredItemRepository, telegramUserRepository);
  });

  bot.action("cancel_order", async (ctx) => {
    await safeAnswerCbQuery(ctx);
    await cancelOrder(ctx);
  });

  bot.action("skip_optional", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    await skipOptionalStep(ctx, session, addressGeoService);
  });

  bot.action("photos_skip", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session || session.step !== "photos") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    if (session.isSubmitting) {
      await ctx.reply("Заявка уже обрабатывается.");
      return;
    }

    if (session.photos.length > 0) {
      await ctx.reply("Фотографии уже прикреплены. Нажмите «Готово» или «Очистить фото».", photosStepKeyboard(true));
      return;
    }

    logInfo("order_photo_step_skipped", {
      ...photoLifecycleLogFields(ctx, session),
      photo_count: 0
    });

    await showPreview(ctx, session, addressGeoService);
  });

  bot.action("photos_done", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session || session.step !== "photos") {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    if (session.isSubmitting) {
      await ctx.reply("Заявка уже обрабатывается.");
      return;
    }

    if (session.photos.length === 0) {
      await ctx.reply("Фотографии не прикреплены. Можно отправить фото или нажать «Пропустить».", photosStepKeyboard(false));
      return;
    }

    logInfo("order_photo_step_completed", {
      ...photoLifecycleLogFields(ctx, session),
      photo_count: session.photos.length
    });

    await showPreview(ctx, session, addressGeoService);
  });

  bot.action("photos_clear", async (ctx) => {
    await safeAnswerCbQuery(ctx);

    const session = getSession(ctx);
    if (!session || (session.step !== "photos" && session.step !== "preview")) {
      await ctx.reply("Черновик не найден. Начните новую заявку через /new.", mainKeyboardForChat(ctx));
      return;
    }

    if (session.acceptedOrderId) {
      await ctx.reply(`Заявка уже принята. Номер заявки: #${session.acceptedOrderId}`);
      return;
    }

    if (session.isSubmitting) {
      await ctx.reply("Заявка уже обрабатывается.");
      return;
    }

    const previousPhotoCount = session.photos.length;
    session.photos = [];

    logInfo("order_photos_cleared", {
      ...photoLifecycleLogFields(ctx, session),
      photo_count: previousPhotoCount
    });

    if (session.step === "photos") {
      await ctx.reply(
        "Все фотографии удалены.\nМожно отправить новые фотографии или нажать «Пропустить».",
        photosStepKeyboard(false)
      );
      return;
    }

    await updatePreviewMessage(ctx, session);
  });

  bot.on("photo", async (ctx) => {
    await handlePhoto(ctx as PhotoContext);
  });

  bot.on("document", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("video", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("animation", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("audio", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("voice", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("video_note", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("sticker", async (ctx) => {
    await handleUnsupportedPhotoStepAttachment(ctx);
  });

  bot.on("text", async (ctx) => {
    await handleText(
      ctx as TextContext,
      telegramUserRepository,
      managerAuthCodeRepository,
      addressGeoService
    );
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
    "Вы пока не привязаны к менеджеру. Введите код доступа, который вам выдал администратор.",
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

  await ctx.reply(formatWhoamiProfile(user), mainKeyboardForChat(ctx));
}

async function showChatId(ctx: Context): Promise<void> {
  const chat = ctx.chat;

  if (!chat) {
    await ctx.reply("Не удалось определить чат.");
    return;
  }

  const lines = [
    "Приветствую, господин! Вот данные чата:",
    "",
    `DISPATCH_CHAT_ID=${chat.id}`,
    `chat_type=${chat.type}`
  ];

  if ("title" in chat && typeof chat.title === "string") {
    lines.push(`chat_title=${chat.title}`);
  }

  lines.push("");

  if (chat.type === "private") {
    lines.push(
      "Это личный чат. Для dispatch-flow нужен chat_id рабочего группового чата, куда добавлен бот."
    );
  } else if (chat.type !== "group" && chat.type !== "supergroup") {
    lines.push("Для dispatch-flow обычно нужен chat_id группы или супергруппы.");
  }

  await ctx.reply(lines.join("\n"));
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
      photos: [],
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

    logInfo("order_draft_started", {
      telegram_user_id: telegramUserId,
      chat_id: ctx.chat?.id,
      salon_id: salon.salon_id,
      salon_name: salon.salon_name,
      manager_id: user.manager_id,
      manager_name: user.manager_name,
      initial_step: "clientContact"
    });

    await replyQuestion(ctx, "Контакт клиента или представителя.");
    return;
  }

  sessions.set(sessionKey, {
    step: "selectSalon",
    photos: [],
    draft: {
      serviceItems: []
    }
  });

  logInfo("order_draft_started", {
    telegram_user_id: telegramUserId,
    chat_id: ctx.chat?.id,
    initial_step: "selectSalon"
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
  managerAuthCodeRepository: ManagerAuthCodeRepository,
  addressGeoService: AddressGeoService
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
        await skipOptionalStep(ctx, session, addressGeoService);
        return;
      }

      session.draft.metro = text;
      session.step = "measureDate";
      await replyQuestion(ctx, "6. Дата замера.");
      return;
    case "measureDate":
      session.draft.measureDate = text;
      session.step = "measureTime";
      await askMeasureTime(ctx);
      return;
    case "measureTime":
      if (text === skipText) {
        await skipOptionalStep(ctx, session, addressGeoService);
        return;
      }

      session.draft.measureTime = text;
      session.step = "selectServiceItem";
      await askServiceItem(ctx);
      return;
    case "selectServiceItem":
      await handleServiceItemSelection(ctx, session, text);
      return;
    case "manualServiceItem":
      await addServiceItem(ctx, session, text);
      return;
    case "paymentBy":
      await handlePaymentBy(ctx, session, text);
      return;
    case "extraCharges":
      if (text === skipText) {
        await skipOptionalStep(ctx, session, addressGeoService);
        return;
      }

      session.draft.extraCharges = text;
      session.step = "comment";
      await replyQuestion(ctx, "11. Комментарий. Можно пропустить.", true);
      return;
    case "comment":
      if (text === skipText) {
        await skipOptionalStep(ctx, session, addressGeoService);
        return;
      }

      session.draft.comment = text;
      await askPhotos(ctx, session);
      return;
    case "photos":
      await ctx.reply("Отправьте фотографии или используйте кнопки под сообщением.");
      return;
    case "preview":
      await ctx.reply("Используйте кнопки под предпросмотром заявки.");
      return;
  }
}

async function handlePhoto(ctx: PhotoContext): Promise<void> {
  const session = getSession(ctx);

  if (!session || session.step !== "photos") {
    return;
  }

  if (session.isSubmitting) {
    await ctx.reply("Заявка уже обрабатывается.");
    return;
  }

  if (!isPrivateChat(ctx) && !isReplyToBot(ctx)) {
    return;
  }

  if (session.photos.length >= maxOrderPhotos) {
    logInfo("order_photo_limit_exceeded", {
      ...photoLifecycleLogFields(ctx, session),
      photo_count: session.photos.length
    });

    await ctx.reply(
      [
        "Достигнут лимит: к заявке можно прикрепить не более 5 фото.",
        "",
        `Сейчас прикреплено: ${session.photos.length}.`,
        "Нажмите «Готово» или «Очистить фото»."
      ].join("\n"),
      photosStepKeyboard(true)
    );
    return;
  }

  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  session.photos.push({
    fileId: photo.file_id,
    fileUniqueId: photo.file_unique_id
  });

  logInfo("order_photo_added", {
    ...photoLifecycleLogFields(ctx, session),
    photo_count: session.photos.length
  });

  await ctx.reply(
    `Фото добавлено: ${session.photos.length} из ${maxOrderPhotos}.\nМожно отправить ещё или нажать «Готово».`,
    photosStepKeyboard(true)
  );
}

async function handleUnsupportedPhotoStepAttachment(ctx: Context): Promise<void> {
  const session = getSession(ctx);

  if (!session || session.step !== "photos") {
    return;
  }

  if (session.isSubmitting) {
    await ctx.reply("Заявка уже обрабатывается.");
    return;
  }

  if (!isPrivateChat(ctx) && !isReplyToBot(ctx)) {
    return;
  }

  await ctx.reply(
    session.photos.length === 0
      ? "Пока можно прикрепить только фотографии.\nОтправьте изображение как фото или нажмите «Пропустить»."
      : "Пока можно прикрепить только фотографии.\nОтправьте изображение как фото или нажмите «Готово».",
    photosStepKeyboard(session.photos.length > 0)
  );
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
 * @param {string} serviceItemType Тип позиции замера.
 * @returns {Promise<void>}
 */
async function addServiceItem(
  ctx: Context,
  session: WizardSession,
  serviceItemType: string
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
  await replyQuestion(ctx, "10. Доплаты / особенности. Можно пропустить.", true);
}

async function askPaymentOrExtraCharges(ctx: Context, session: WizardSession): Promise<void> {
  if (session.draft.paymentBy) {
    session.step = "extraCharges";
    await replyQuestion(ctx, "10. Доплаты / особенности. Можно пропустить.", true);
    return;
  }

  session.step = "paymentBy";
  await ctx.reply("9. Кто оплачивает замер?", paymentKeyboard());
}

async function askMeasureTime(ctx: Context): Promise<void> {
  await replyQuestion(
    ctx,
    "7. Желаемое время прибытия замерщика? Можно пропустить.",
    true
  );
}

async function askPhotos(ctx: Context, session: WizardSession): Promise<void> {
  session.step = "photos";

  if (isPrivateChat(ctx)) {
    await ctx.reply(photosQuestionText, Markup.removeKeyboard());
    await ctx.reply("Можно пропустить этот шаг:", photosStepKeyboard(false));
    return;
  }

  await ctx.reply(
    `${photosQuestionText}\n\nОтправьте фотографии ответом на это сообщение. Для отмены создания всей заявки наберите команду /cancel.`,
    Markup.forceReply().selective()
  );
  await ctx.reply("Можно пропустить этот шаг:", photosStepKeyboard(false));
}

/**
 * Показывает пользователю inline-кнопки выбора позиции замера.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @returns {Promise<void>}
 */
async function askServiceItem(ctx: Context): Promise<void> {
  await ctx.reply("8. Позиции под замер с количеством. Выберите позицию.", serviceItemsKeyboard(false));
}

/**
 * Проверяет, является ли текст допустимым типом позиции замера.
 * @param {string} text Проверяемый текст.
 * @returns {boolean} true, если текст является ServiceItemType.
 */
function isServiceItemType(text: string): text is ServiceItemType {
  return isMeasureServiceItemType(text);
}

/**
 * Проверяет, является ли текст допустимым вариантом оплаты.
 * @param {string} text Проверяемый текст.
 * @returns {boolean} true, если текст является PaymentBy.
 */
function isPaymentBy(text: string): text is PaymentBy {
  return isMeasurePaymentValue(text);
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
      serviceItemButton("kitchen"),
      serviceItemButton("wardrobe")
    ],
    [serviceItemButton("closet_niche")],
    [serviceItemButton("sink_cabinet")],
    [
      serviceItemButton("dressing_room"),
      serviceItemButton("installation")
    ],
    [
      serviceItemButton("tv_zone"),
      serviceItemButton("work_zone")
    ],
    [
      serviceItemButton("wall_panels"),
      serviceItemButton("by_plan")
    ],
    [Markup.button.callback("вписать вручную", "manual_service_item")]
  ];

  if (canFinish) {
    rows.push([Markup.button.callback(finishItemsText, "finish_items")]);
  }

  rows.push([Markup.button.callback(cancelText, "cancel_order")]);
  return Markup.inlineKeyboard(rows);
}

function serviceItemButton(key: string) {
  const item = measureServiceItems.find((candidate) => candidate.key === key);

  if (!item) {
    throw new Error(`Unknown measure service item: ${key}`);
  }

  return Markup.button.callback(item.buttonLabel, `service_item:${item.key}`);
}

/**
 * Создаёт inline-клавиатуру выбора плательщика.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура вариантов оплаты.
 */
function paymentKeyboard() {
  return Markup.inlineKeyboard([
    ...measurePaymentOptions.map((option) => [
      Markup.button.callback(option.buttonLabel, `payment:${option.key}`)
    ]),
    [Markup.button.callback(cancelText, "cancel_order")]
  ]);
}

function photosStepKeyboard(hasPhotos: boolean) {
  if (hasPhotos) {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Готово", "photos_done")],
      [Markup.button.callback("Очистить фото", "photos_clear")],
      [Markup.button.callback(cancelText, "cancel_order")]
    ]);
  }

  return Markup.inlineKeyboard([
    [Markup.button.callback("Пропустить", "photos_skip")],
    [Markup.button.callback(cancelText, "cancel_order")]
  ]);
}

/**
 * Создаёт inline-клавиатуру действий на предпросмотре заявки.
 * @returns {ReturnType<typeof Markup.inlineKeyboard>} Inline-клавиатура принятия, перезаполнения и отмены.
 */
function previewKeyboard(photoCount: number) {
  const rows = [[Markup.button.callback("✅ Принять", "accept_order")]];

  if (photoCount > 0) {
    rows.push([Markup.button.callback("🗑 Очистить фото", "photos_clear")]);
  }

  rows.push(
    [Markup.button.callback("✏️ Заполнить заново", "restart_order")],
    [Markup.button.callback(cancelText, "cancel_order")]
  );

  return Markup.inlineKeyboard(rows);
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

function photoLifecycleLogFields(ctx: Context, session: WizardSession) {
  return {
    telegram_user_id: getTelegramUserId(ctx),
    source_chat_id: ctx.chat?.id,
    salon_id: session.draft.salonId,
    manager_id: session.draft.managerId
  };
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
function isReplyToBot(ctx: Context): boolean {
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
async function showPreview(
  ctx: Context,
  session: WizardSession,
  addressGeoService: AddressGeoService
): Promise<void> {
  session.step = "preview";
  await enrichDraftAddress(session.draft, addressGeoService);

  await ctx.reply(previewText(session), previewKeyboard(session.photos.length));
}

async function updatePreviewMessage(ctx: Context, session: WizardSession): Promise<void> {
  try {
    await ctx.editMessageText(previewText(session), previewKeyboard(session.photos.length));
  } catch {
    await ctx.reply(previewText(session), previewKeyboard(session.photos.length));
  }
}

function previewText(session: WizardSession): string {
  return [
    "Предпросмотр заявки",
    `Прикреплено фото: ${session.photos.length}`,
    "",
    formatOrderCard(session.draft)
  ].join("\n");
}

async function enrichDraftAddress(
  draft: OrderDraft,
  addressGeoService: AddressGeoService
): Promise<void> {
  const geo = await addressGeoService.enrichAddress(draft.address);

  draft.addressNormalizedSnapshot = geo?.normalizedAddress;
  draft.addressGeoSource = geo?.source;
  draft.addressBeltwayHit = geo?.beltwayHit;
  draft.addressBeltwayDistanceKm = geo?.beltwayDistanceKm;
  draft.addressGeoQcGeo = geo?.qcGeo;
  draft.addressGeoQc = geo?.qc;
  draft.addressGeoQcHouse = geo?.qcHouse;
}

/**
 * Пропускает текущий необязательный шаг и переводит сценарий дальше.
 * @param {Context} ctx Контекст Telegram-обновления.
 * @param {WizardSession} session Текущая wizard-сессия.
 * @returns {Promise<void>}
 */
async function skipOptionalStep(
  ctx: Context,
  session: WizardSession,
  addressGeoService: AddressGeoService
): Promise<void> {
  switch (session.step) {
    case "metro":
      session.draft.metro = undefined;
      session.step = "measureDate";
      await replyQuestion(ctx, "6. Дата замера.");
      return;
    case "measureTime":
      session.draft.measureTime = undefined;
      session.step = "selectServiceItem";
      await askServiceItem(ctx);
      return;
    case "extraCharges":
      session.draft.extraCharges = undefined;
      session.step = "comment";
      await replyQuestion(ctx, "11. Комментарий. Можно пропустить.", true);
      return;
    case "comment":
      session.draft.comment = undefined;
      await askPhotos(ctx, session);
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
  const session = sessionKey ? sessions.get(sessionKey) : undefined;

  if (session?.acceptedOrderId) {
    await ctx.reply(`Заявка уже принята. Номер заявки: #${session.acceptedOrderId}`);
    return;
  }

  if (session?.isSubmitting) {
    await ctx.reply("Заявка уже обрабатывается.");
    return;
  }

  logInfo("order_draft_cancelled", {
    telegram_user_id: getTelegramUserId(ctx),
    chat_id: ctx.chat?.id,
    step: session?.step,
    salon_id: session?.draft.salonId,
    salon_name: session?.draft.salonNameSnapshot,
    manager_id: session?.draft.managerId,
    manager_name: session?.draft.managerNameSnapshot,
    has_session: Boolean(session)
  });

  if (sessionKey) {
    sessions.delete(sessionKey);
  }

  await ctx.reply("Заявка отменена.", mainKeyboardForChat(ctx));
}
