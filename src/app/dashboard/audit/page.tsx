import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { auditActionLabel } from "@/app/components/audit-label";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { formatDateTimeInPanama } from "@/lib/finance/dates";

export const instant = false;

interface AuditRow extends RowDataPacket {
  id: string | number;
  actor_name: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
}

const entityLabels: Record<string, string> = {
  daily_closing: "Cierre diario",
  expense: "Gasto",
  supplier: "Proveedor",
  purchase_bill: "Factura de proveedor",
  bill_payment: "Pago a proveedor",
  user: "Usuario",
  expense_category: "Categoría anterior",
};

export default async function AuditPage() {
  await connection();
  const user = await requirePermission("finance:read");
  const [events] = await getDbPool().execute<AuditRow[]>(
    `SELECT a.id, u.name AS actor_name, a.entity_type, a.entity_id,
            a.action,
            DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 200`,
  );

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Control</p>
            <h1>Auditoría</h1>
          </div>
          <p>Registro de operaciones con fecha, hora y usuario responsable.</p>
        </div>
        <section className="dashboard-card">
          <h2>Actividad reciente</h2>
          {events.length === 0 ? (
            <p className="empty-state">Todavía no hay cambios registrados.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha y hora (Panamá)</th>
                    <th scope="col">Usuario</th>
                    <th scope="col">Acción</th>
                    <th scope="col">Registro</th>
                    <th scope="col">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={String(event.id)}>
                      <td>
                        <time dateTime={event.created_at}>
                          {formatDateTimeInPanama(event.created_at)}
                        </time>
                      </td>
                      <td>{event.actor_name ?? "Usuario no disponible"}</td>
                      <td>{auditActionLabel(event.action)}</td>
                      <td>{entityLabels[event.entity_type] ?? event.entity_type}</td>
                      <td>{event.entity_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
