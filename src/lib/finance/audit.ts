import type { PoolConnection } from "mysql2/promise";

interface AuditEntry {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: unknown;
  afterData?: unknown;
}

export async function writeAuditLog(
  connection: PoolConnection,
  entry: AuditEntry,
): Promise<void> {
  await connection.execute(
    `INSERT INTO audit_logs
      (actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [
      entry.actorUserId,
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.beforeData === undefined ? null : JSON.stringify(entry.beforeData),
      entry.afterData === undefined ? null : JSON.stringify(entry.afterData),
    ],
  );
}
