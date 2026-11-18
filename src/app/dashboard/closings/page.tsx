import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
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
  sales_total: string;
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
    `SELECT id, DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
            reported_sales_total, pedidos_ya_total,
            reported_sales_total + pedidos_ya_total AS sales_total, status
     FROM daily_closings
     ORDER BY operation_date DESC
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
            de caja y las propinas.
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
                    <th scope="col">Reporte Z</th>
                    <th scope="col">Pedidos Ya</th>
                    <th scope="col">Total ventas</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {closings.map((closing) => (
                    <tr key={String(closing.id)}>
                      <td>{closing.operation_date}</td>
                      <td>{formatMoney(closing.reported_sales_total)}</td>
                      <td>{formatMoney(closing.pedidos_ya_total)}</td>
                      <td>{formatMoney(closing.sales_total)}</td>
                      <td>{statusLabels[closing.status]}</td>
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
