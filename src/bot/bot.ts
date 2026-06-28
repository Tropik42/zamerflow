import { Telegraf, type Context } from "telegraf";
import type { ManagerAuthCodeRepository } from "../db/managerAuthCodeRepository.js";
import type { OrderRepository } from "../db/orderRepository.js";
import type { SalonRequiredItemRepository } from "../db/salonRequiredItemRepository.js";
import type { SalonRepository } from "../db/salonRepository.js";
import type { TelegramUserRepository } from "../db/telegramUserRepository.js";
import { registerOrderWizard } from "./orderWizard.js";

/**
 * Создаёт и настраивает экземпляр Telegram-бота.
 * @param {string} botToken Токен Telegram-бота.
 * @param {OrderRepository} orderRepository Репозиторий заявок.
 * @param {SalonRepository} salonRepository Репозиторий справочника салонов.
 * @returns {Telegraf<Context>} Настроенный экземпляр Telegraf.
 */
export function createBot(
  botToken: string,
  orderRepository: OrderRepository,
  salonRepository: SalonRepository,
  salonRequiredItemRepository: SalonRequiredItemRepository,
  telegramUserRepository: TelegramUserRepository,
  managerAuthCodeRepository: ManagerAuthCodeRepository
): Telegraf<Context> {
  const bot = new Telegraf<Context>(botToken);

  registerOrderWizard(
    bot,
    orderRepository,
    salonRepository,
    salonRequiredItemRepository,
    telegramUserRepository,
    managerAuthCodeRepository
  );

  return bot;
}
