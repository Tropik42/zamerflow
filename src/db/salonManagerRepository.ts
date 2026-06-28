import type { AppDatabase } from "./db.js";

export interface SalonManager {
  manager_id: number;
  salon_id: number;
  create_datetime: string;
  modify_datetime: string;
  manager_name: string;
  manager_phone?: string;
  manager_email?: string;
  position_title?: string;
  manager_role: string;
  sort_order: number;
  is_active: number;
  salon_name?: string;
}

export interface SalonManagerFormParams {
  salon_id: number;
  manager_name: string;
  manager_phone?: string;
  manager_email?: string;
  position_title?: string;
  manager_role: string;
  sort_order: number;
  is_active: number;
}

export interface SalonManagerRepository {
  getAllManagers(): SalonManager[];
  getActiveManagers(): SalonManager[];
  getManagerById(managerId: number): SalonManager | undefined;
  countManagers(): number;
  createManager(params: SalonManagerFormParams): number;
  updateManager(managerId: number, params: SalonManagerFormParams): void;
}

export function createSalonManagerRepository(db: AppDatabase): SalonManagerRepository {
  const selectManagerFields = `
    SELECT
      sm.manager_id,
      sm.salon_id,
      sm.create_datetime,
      sm.modify_datetime,
      sm.manager_name,
      sm.manager_phone,
      sm.manager_email,
      sm.position_title,
      sm.manager_role,
      sm.sort_order,
      sm.is_active,
      s.salon_name
    FROM salon_managers sm
    LEFT JOIN salons s ON s.salon_id = sm.salon_id
  `;

  const selectAllManagers = db.prepare(`
    ${selectManagerFields}
    ORDER BY s.salon_name ASC, sm.sort_order ASC, sm.manager_name ASC
  `);

  const selectActiveManagers = db.prepare(`
    ${selectManagerFields}
    WHERE sm.is_active = 1
    ORDER BY s.salon_name ASC, sm.sort_order ASC, sm.manager_name ASC
  `);

  const selectManagerById = db.prepare(`
    ${selectManagerFields}
    WHERE sm.manager_id = ?
    LIMIT 1
  `);

  const countManagers = db.prepare("SELECT COUNT(*) AS count FROM salon_managers");

  const insertManager = db.prepare(`
    INSERT INTO salon_managers (
      salon_id,
      create_datetime,
      modify_datetime,
      manager_name,
      manager_phone,
      manager_email,
      position_title,
      manager_role,
      sort_order,
      is_active
    ) VALUES (
      @salonId,
      datetime('now'),
      datetime('now'),
      @managerName,
      @managerPhone,
      @managerEmail,
      @positionTitle,
      @managerRole,
      @sortOrder,
      @isActive
    )
  `);

  const updateManager = db.prepare(`
    UPDATE salon_managers
    SET
      salon_id = @salonId,
      modify_datetime = datetime('now'),
      manager_name = @managerName,
      manager_phone = @managerPhone,
      manager_email = @managerEmail,
      position_title = @positionTitle,
      manager_role = @managerRole,
      sort_order = @sortOrder,
      is_active = @isActive
    WHERE manager_id = @managerId
  `);

  return {
    getAllManagers() {
      return selectAllManagers.all().map(mapSalonManagerRow);
    },
    getActiveManagers() {
      return selectActiveManagers.all().map(mapSalonManagerRow);
    },
    getManagerById(managerId) {
      const row = selectManagerById.get(managerId);
      return row ? mapSalonManagerRow(row) : undefined;
    },
    countManagers() {
      const row = countManagers.get() as { count: number };
      return Number(row.count);
    },
    createManager(params) {
      const result = insertManager.run(toManagerSqlParams(params));
      return Number(result.lastInsertRowid);
    },
    updateManager(managerId, params) {
      updateManager.run({
        ...toManagerSqlParams(params),
        managerId
      });
    }
  };
}

function mapSalonManagerRow(row: unknown): SalonManager {
  const manager = row as Record<string, unknown>;

  return {
    manager_id: Number(manager.manager_id),
    salon_id: Number(manager.salon_id),
    create_datetime: String(manager.create_datetime),
    modify_datetime: String(manager.modify_datetime),
    manager_name: String(manager.manager_name),
    manager_phone: optionalString(manager.manager_phone),
    manager_email: optionalString(manager.manager_email),
    position_title: optionalString(manager.position_title),
    manager_role: String(manager.manager_role),
    sort_order: Number(manager.sort_order),
    is_active: Number(manager.is_active),
    salon_name: optionalString(manager.salon_name)
  };
}

function toManagerSqlParams(params: SalonManagerFormParams) {
  return {
    salonId: params.salon_id,
    managerName: params.manager_name,
    managerPhone: params.manager_phone ?? null,
    managerEmail: params.manager_email ?? null,
    positionTitle: params.position_title ?? null,
    managerRole: params.manager_role,
    sortOrder: params.sort_order,
    isActive: params.is_active
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
