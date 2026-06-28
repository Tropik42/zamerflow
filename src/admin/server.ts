import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerAuthCodeRoutes } from "./routes/authCodes.js";
import { registerManagerRoutes } from "./routes/managers.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerSalonRoutes } from "./routes/salons.js";
import { layout } from "./html.js";
import type { ManagerAuthCodeRepository } from "../db/managerAuthCodeRepository.js";
import type { OrderRepository } from "../db/orderRepository.js";
import type { SalonManagerRepository } from "../db/salonManagerRepository.js";
import type { SalonRequiredItemRepository } from "../db/salonRequiredItemRepository.js";
import type { SalonRepository } from "../db/salonRepository.js";

export interface AdminServerRepositories {
  salonRepository: SalonRepository;
  salonRequiredItemRepository: SalonRequiredItemRepository;
  managerRepository: SalonManagerRepository;
  authCodeRepository: ManagerAuthCodeRepository;
  orderRepository: OrderRepository;
}

export interface AdminServerOptions extends AdminServerRepositories {
  port: number;
}

export async function startAdminServer(options: AdminServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const params = new URLSearchParams(String(body));
      done(null, Object.fromEntries(params.entries()));
    }
  );

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/admin")) {
      reply.type("text/html; charset=utf-8");
    }
  });

  app.get("/admin", async () => {
    return layout(
      "Админка",
      `<h1>ZamerFlow Admin</h1>
      <div class="grid">
        <div class="stat">Салонов<strong>${options.salonRepository.countSalons()}</strong></div>
        <div class="stat">Менеджеров<strong>${options.managerRepository.countManagers()}</strong></div>
        <div class="stat">Заявок<strong>${options.orderRepository.countOrders()}</strong></div>
        <div class="stat">Неиспользованных кодов<strong>${options.authCodeRepository.countUnusedCodes()}</strong></div>
      </div>
      <h2>Разделы</h2>
      <ul>
        <li><a href="/admin/salons">Салоны</a></li>
        <li><a href="/admin/managers">Менеджеры</a></li>
        <li><a href="/admin/auth-codes">Коды доступа</a></li>
        <li><a href="/admin/orders">Заявки</a></li>
      </ul>`
    );
  });

  registerSalonRoutes(app, options.salonRepository, options.salonRequiredItemRepository);
  registerManagerRoutes(app, options.managerRepository, options.salonRepository);
  registerAuthCodeRoutes(app, options.authCodeRepository, options.managerRepository);
  registerOrderRoutes(app, options.orderRepository);

  await app.listen({ port: options.port, host: "0.0.0.0" });
  return app;
}
