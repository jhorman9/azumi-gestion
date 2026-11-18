import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import {
  currentMonthInPanama,
  requireBusinessDate,
  type DateRange,
} from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { getFinanceSummary } from "@/lib/finance/report";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface ClosingRow extends RowDataPacket {
  operation_date: string;
  reported_sales_total: string;
  pedidos_ya_total: string;
  sales_total: string;
  status: "confirmed" | "corrected";
}

interface CategoryTotalRow extends RowDataPacket {
  category_name: string;
  expense_count: number;
  amount: string;
}

interface ReportsPageProps {
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function selectedRange(
  startValue?: string,
  endValue?: string,
): { range: DateRange; invalid: boolean } {
  const fallback = currentMonthInPanama();
  if (!startValue && !endValue) {
    return { range: fallback, invalid: false };
  }

  try {
    const start = requireBusinessDate(startValue ?? "");
    const end = requireBusinessDate(endValue ?? "");
    if (start > end) {
      return { range: fallback, invalid: true };
    }
    return { range: { start, end }, invalid: false };
  } catch {
    return { range: fallback, invalid: true };
  }
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const params = await searchParams;
  const { range, invalid } = selectedRange(
    firstValue(params.start),
    firstValue(params.end),
  );
  const pool = getDbPool();
  const [summary, closings, categories] = await Promise.all([
    getFinanceSummary(pool, range),
    pool.execute<ClosingRow[]>(
      `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
              reported_sales_total, pedidos_ya_total,
              reported_sales_total + pedidos_ya_total AS sales_total, status
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?
       ORDER BY operation_date DESC`,
      [range.start, range.end],
    ),
    pool.execute<CategoryTotalRow[]>(
      `SELECT c.name AS category_name, COUNT(*) AS expense_count,
              COALESCE(SUM(e.amount), 0.00) AS amount
       FROM expenses e
       INNER JOIN expense_categories c ON c.id = e.category_id
       WHERE e.status IN ('unpaid', 'paid')
         AND e.incurred_on BETWEEN ? AND ?
       GROUP BY c.id, c.name
       ORDER BY amount DESC, c.name`,
      [range.start, range.end],
    ),
  ]);
  const closingRows = closings[0];
  const categoryRows = categories[0];

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Informes</h1>
          </div>
          <p>Período de operación en la zona horaria America/Panama.</p>
        </div>
        {invalid ? (
          <p className="form-error" role="alert">
            El rango no es válido; se muestra el mes actual.
          </p>
        ) : null}
        <section className="dashboard-card">
          <h2>Seleccionar período</h2>
          <form action="/dashboard/reports" method="get" className="inline-form">
            <label>
              Desde
              <input defaultValue={range.start} name="start" required type="date" />
            </label>
            <label>
              Hasta
              <input defaultValue={range.end} name="end" required type="date" />
            </label>
            <button type="submit">Ver informe</button>
          </form>
        </section>

        <section aria-label="Resumen del período" className="metric-grid">
          <article className="metric-card">
            <h2>Ventas totales</h2>
            <p>{formatMoney(summary.salesTotal)}</p>
            <span>Cierres confirmados o corregidos</span>
          </article>
          <article className="metric-card">
            <h2>Gastos incurridos</h2>
            <p>{formatMoney(summary.expenseIncurred)}</p>
            <span>Por fecha del gasto; anulados excluidos</span>
          </article>
          <article className="metric-card">
            <h2>Gastos pagados</h2>
            <p>{formatMoney(summary.expensePaid)}</p>
            <span>Por fecha efectiva de pago</span>
          </article>
          <article className="metric-card">
            <h2>Facturas emitidas</h2>
            <p>{formatMoney(summary.supplierBillsIssued)}</p>
            <span>Obligaciones nuevas, no gastos adicionales</span>
          </article>
          <article className="metric-card">
            <h2>Pagos a proveedores</h2>
            <p>{formatMoney(summary.supplierPayments)}</p>
            <span>Pagos aplicados en el período</span>
          </article>
          <article className="metric-card">
            <h2>Saldo por pagar</h2>
            <p>{formatMoney(summary.outstandingPayables)}</p>
            <span>Saldo actual de facturas abiertas</span>
          </article>
          <article className="metric-card">
            <h2>Saldo vencido</h2>
            <p>{formatMoney(summary.overduePayables)}</p>
            <span>Vencimiento anterior a hoy, hora de Panamá</span>
          </article>
        </section>

        <section className="dashboard-card">
          <h2>Cierres incluidos</h2>
          {closingRows.length === 0 ? (
            <p className="empty-state">No hay cierres confirmados en este período.</p>
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
                  </tr>
                </thead>
                <tbody>
                  {closingRows.map((closing) => (
                    <tr key={closing.operation_date}>
                      <td>{closing.operation_date}</td>
                      <td>{formatMoney(closing.reported_sales_total)}</td>
                      <td>{formatMoney(closing.pedidos_ya_total)}</td>
                      <td>{formatMoney(closing.sales_total)}</td>
                      <td>
                        {closing.status === "corrected" ? "Corregido" : "Confirmado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Gastos incurridos por categoría</h2>
          {categoryRows.length === 0 ? (
            <p className="empty-state">No hay gastos en este período.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Categoría</th>
                    <th scope="col">Registros</th>
                    <th scope="col">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((category) => (
                    <tr key={category.category_name}>
                      <td>{category.category_name}</td>
                      <td>{category.expense_count}</td>
                      <td>{formatMoney(category.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Alcance del informe</h2>
          <p>
            Los cierres usan la fecha de operación; los gastos usan la fecha en
            que se incurrió en ellos; los pagos se agrupan por fecha efectiva.
            Facturas de proveedor y pagos se reportan separados de los gastos.
            El informe no calcula utilidad neta.
          </p>
        </section>
      </div>
    </main>
  );
}
