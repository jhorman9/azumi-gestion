import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { AuditLabel } from "@/app/components/audit-label";
import { ClosingForm } from "@/app/components/closing-form";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { emptyClosingFormDefaults } from "@/lib/finance/closing";
import { todayInPanama } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface ClosingRow extends RowDataPacket {
  id: string | number;
  operation_date: string;
  reported_sales_total: string;
  pedidos_ya_total: string;
  cash_total: string;
  cash_outflow_total: string;
  bank_total: string;
  expense_deduction_total: string;
  last_action: string | null;
  last_actor_name: string | null;
  last_action_at: string | null;
  status: "draft" | "confirmed" | "corrected";
}

interface ClosingsPageProps {
  searchParams: Promise<{
    created?: string | string[];
    error?: string | string[];
  }>;
}

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos del cierre.",
  duplicate: "Ya existe un cierre para esa fecha.",
  "deduction-exceeds-cash":
    "Las salidas de caja y los gastos descontados superan el efectivo contado.",
  "outflow-invalid":
    "Completa cada salida y verifica que su suma no supere el efectivo contado.",
  failed: "No fue posible guardar el cierre.",
};

const statusLabels: Record<ClosingRow["status"], string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  corrected: "Corregido",
};

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClosingsPage({
  searchParams,
}: ClosingsPageProps) {
  await connection();
  const user = await requirePermission("closings:read");
  const [closings] = await getDbPool().execute<ClosingRow[]>(
    `SELECT c.id, DATE_FORMAT(c.operation_date, '%Y-%m-%d') AS operation_date,
            c.reported_sales_total, c.pedidos_ya_total, c.cash_total,
          COALESCE((
            SELECT SUM(o.amount)
            FROM daily_closing_cash_outflows o
            WHERE o.daily_closing_id = c.id
          ), 0.00) AS cash_outflow_total,
          COALESCE((
            SELECT SUM(e.amount)
            FROM expenses e
            WHERE e.closing_operation_date = c.operation_date
              AND e.deduct_from_closing = 1
              AND e.status = 'paid'
          ), 0.00) AS expense_deduction_total,
            COALESCE((
              SELECT SUM(p.amount)
              FROM daily_closing_channel_payments p
              WHERE p.daily_closing_id = c.id
            ), 0.00) AS bank_total,
          a.action AS last_action,
          au.name AS last_actor_name,
          DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS last_action_at,
            c.status
     FROM daily_closings c
     LEFT JOIN (
       SELECT entity_id, MAX(id) AS audit_id
       FROM audit_logs
       WHERE entity_type = 'daily_closing'
       GROUP BY entity_id
     ) latest ON latest.entity_id = CAST(c.id AS CHAR)
     LEFT JOIN audit_logs a ON a.id = latest.audit_id
     LEFT JOIN users au ON au.id = a.actor_user_id
     ORDER BY c.operation_date DESC
     LIMIT 90`,
  );
  const params = await searchParams;
  const error = firstValue(params.error);
  const created = firstValue(params.created);

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Operación</p>
            <h1>Cierres diarios</h1>
            <p>Realizado por: {user.name}</p>
          </div>
          <p>
            Registra el Reporte Z, Pedidos Ya, el desglose bancario, las salidas
            de caja y la propina total del día. Las salidas se restan del
            efectivo y del Reporte Z; la propina se informa por separado.
          </p>
        </div>

        {created ? (
          <p className="success-message" role="status">
            {created === "confirmed"
              ? "Cierre guardado y confirmado."
              : "Borrador guardado."}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessages[error] ?? "Ocurrió un error al guardar el cierre."}
          </p>
        ) : null}

        <section className="dashboard-card">
          <h2>Registrar cierre</h2>
          <ClosingForm
            actionUrl="/api/finance/closings"
            initial={emptyClosingFormDefaults(todayInPanama())}
            isDraft
          />
        </section>

        <section className="dashboard-card">
          <h2>Historial reciente</h2>
          {closings.length === 0 ? (
            <p className="empty-state">Todavía no hay cierres registrados.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Reporte Z neto</th>
                    <th scope="col">Pedidos Ya</th>
                    <th scope="col">Total banco</th>
                    <th scope="col">Efectivo neto</th>
                    <th scope="col">Salidas de caja</th>
                    <th scope="col">Gastos restados</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Último cambio</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {closings.map((closing) => (
                    <tr key={String(closing.id)}>
                      <td>{closing.operation_date}</td>
                      <td>{formatMoney(closing.reported_sales_total)}</td>
                      <td>{formatMoney(closing.pedidos_ya_total)}</td>
                      <td>{formatMoney(closing.bank_total)}</td>
                      <td>{formatMoney(closing.cash_total)}</td>
                      <td>{formatMoney(closing.cash_outflow_total)}</td>
                      <td>{formatMoney(closing.expense_deduction_total)}</td>
                      <td>{statusLabels[closing.status]}</td>
                      <td>
                        <AuditLabel
                          action={closing.last_action}
                          actorName={closing.last_actor_name}
                          occurredAt={closing.last_action_at}
                        />
                      </td>
                      <td>
                        <Link href={`/dashboard/closings/${closing.id}`}>
                          Abrir cierre
                        </Link>
                      </td>
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
