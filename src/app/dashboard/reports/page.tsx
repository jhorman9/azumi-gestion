import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import {
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  FileText,
  HandCoins,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { FinanceComparisonChart } from "@/app/components/finance-comparison-chart";
import { ExpensePeriodSummary } from "@/app/components/expense-period-summary";
import { MetricCard } from "@/app/components/metric-card";
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
  cash_total: string;
  cash_outflow_total: string;
  bank_total: string;
  status: "confirmed" | "corrected";
}

interface SupplierTotalRow extends RowDataPacket {
  supplier_name: string;
  expense_count: number;
  amount: string;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface ReportsPageProps {
  searchParams: Promise<{
    closingPage?: string | string[];
    start?: string | string[];
    end?: string | string[];
    supplierPage?: string | string[];
  }>;
}

const pageSize = 10;

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
  const [summary, closingCountRows, supplierCountRows] = await Promise.all([
    getFinanceSummary(pool, range),
    pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<CountRow[]>(
      `SELECT COUNT(DISTINCT supplier_id) AS total
       FROM expenses
       WHERE status = 'paid'
         AND incurred_on BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
  ]);
  const closingTotal = Number(closingCountRows[0][0]?.total ?? 0);
  const supplierTotal = Number(supplierCountRows[0][0]?.total ?? 0);
  const closingPageCount = Math.max(1, Math.ceil(closingTotal / pageSize));
  const supplierPageCount = Math.max(1, Math.ceil(supplierTotal / pageSize));
  const requestedClosingPage = Number(
    firstValue(params.closingPage) ?? "1",
  );
  const requestedSupplierPage = Number(
    firstValue(params.supplierPage) ?? "1",
  );
  const closingPage =
    Number.isSafeInteger(requestedClosingPage) && requestedClosingPage > 0
      ? Math.min(requestedClosingPage, closingPageCount)
      : 1;
  const supplierPage =
    Number.isSafeInteger(requestedSupplierPage) && requestedSupplierPage > 0
      ? Math.min(requestedSupplierPage, supplierPageCount)
      : 1;
  const closingOffset = (closingPage - 1) * pageSize;
  const supplierOffset = (supplierPage - 1) * pageSize;
  const [closings, suppliers, topSuppliers] = await Promise.all([
    pool.execute<ClosingRow[]>(
      `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
              reported_sales_total, pedidos_ya_total, cash_total,
              COALESCE((
                SELECT SUM(o.amount)
                FROM daily_closing_cash_outflows o
                WHERE o.daily_closing_id = daily_closings.id
              ), 0.00) AS cash_outflow_total,
              COALESCE((
                SELECT SUM(p.amount)
                FROM daily_closing_channel_payments p
                WHERE p.daily_closing_id = daily_closings.id
              ), 0.00) AS bank_total,
              status
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?
       ORDER BY operation_date DESC
       LIMIT ? OFFSET ?`,
      [range.start, range.end, pageSize, closingOffset],
    ),
    pool.execute<SupplierTotalRow[]>(
      `SELECT s.legal_name AS supplier_name, COUNT(*) AS expense_count,
              COALESCE(SUM(e.amount), 0.00) AS amount
       FROM expenses e
       INNER JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.status = 'paid'
         AND e.incurred_on BETWEEN ? AND ?
       GROUP BY s.id, s.legal_name
       ORDER BY amount DESC, s.legal_name
       LIMIT ? OFFSET ?`,
      [range.start, range.end, pageSize, supplierOffset],
    ),
    pool.execute<SupplierTotalRow[]>(
      `SELECT s.legal_name AS supplier_name, COUNT(*) AS expense_count,
              COALESCE(SUM(e.amount), 0.00) AS amount
       FROM expenses e
       INNER JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.status = 'paid'
         AND e.incurred_on BETWEEN ? AND ?
       GROUP BY s.id, s.legal_name
       ORDER BY amount DESC, s.legal_name
       LIMIT 5`,
      [range.start, range.end],
    ),
  ]);
  const closingRows = closings[0];
  const supplierRows = suppliers[0];
  const topSupplierRows = topSuppliers[0];
  const pageHref = (
    closingPageValue: number,
    supplierPageValue: number,
  ) => {
    const query = new URLSearchParams({
      start: range.start,
      end: range.end,
      closingPage: String(closingPageValue),
      supplierPage: String(supplierPageValue),
    });
    return `/dashboard/reports?${query.toString()}`;
  };

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
          <MetricCard
            hint="Reporte Z neto del cierre menos todos los gastos; puede ser negativo"
            icon={CircleDollarSign}
            label="Reporte Z − gastos del período"
            tone="red"
            value={formatMoney(summary.salesAfterExpenses)}
          />
          <MetricCard
            hint="Todos los gastos pagados, por fecha del gasto"
            icon={ReceiptText}
            label="Gastos incurridos"
            tone="amber"
            value={formatMoney(summary.expenseIncurred)}
          />
          <MetricCard
            hint="Total de gastos registrados por fecha efectiva de pago"
            icon={CircleCheck}
            label="Gastos pagados"
            tone="green"
            value={formatMoney(summary.expensePaid)}
          />
          <MetricCard
            hint="Obligaciones nuevas, sin duplicar gastos"
            icon={FileText}
            label="Facturas emitidas"
            tone="blue"
            value={formatMoney(summary.supplierBillsIssued)}
          />
          <MetricCard
            hint="Pagos aplicados en el período"
            icon={HandCoins}
            label="Pagos a proveedores"
            tone="violet"
            value={formatMoney(summary.supplierPayments)}
          />
          <MetricCard
            hint="Saldo actual de facturas abiertas"
            icon={WalletCards}
            label="Saldo por pagar"
            value={formatMoney(summary.outstandingPayables)}
          />
          <MetricCard
            hint="Requiere seguimiento"
            icon={CircleAlert}
            label="Saldo vencido"
            tone="amber"
            value={formatMoney(summary.overduePayables)}
          />
        </section>
        <ExpensePeriodSummary
          expenseIncurred={summary.expenseIncurred}
          salesTotal={summary.salesTotal}
          salesAfterExpenses={summary.salesAfterExpenses}
        />

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Detalle diario</p>
              <h2>Cierres incluidos</h2>
            </div>
            <span className="table-count">
              {closingTotal} {closingTotal === 1 ? "cierre" : "cierres"}
            </span>
          </div>
          {closingTotal === 0 ? (
            <p className="empty-state">No hay cierres confirmados en este período.</p>
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
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {closingRows.map((closing) => (
                    <tr key={closing.operation_date}>
                      <td>{closing.operation_date}</td>
                      <td>{formatMoney(closing.reported_sales_total)}</td>
                      <td>{formatMoney(closing.pedidos_ya_total)}</td>
                      <td>{formatMoney(closing.bank_total)}</td>
                      <td>{formatMoney(closing.cash_total)}</td>
                      <td>{formatMoney(closing.cash_outflow_total)}</td>
                      <td>
                        {closing.status === "corrected" ? "Corregido" : "Confirmado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {closingTotal > 0 ? (
            <nav aria-label="Paginación de cierres del informe" className="reports-pagination">
              <span>
                {closingOffset + 1}–
                {Math.min(closingOffset + pageSize, closingTotal)} de{" "}
                {closingTotal} cierres
              </span>
              <div>
                {closingPage > 1 ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(closingPage - 1, supplierPage)}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="reports-pagination-disabled"
                  >
                    Anterior
                  </span>
                )}
                <span>
                  Página {closingPage} de {closingPageCount}
                </span>
                {closingPage < closingPageCount ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(closingPage + 1, supplierPage)}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="reports-pagination-disabled"
                  >
                    Siguiente
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </section>

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Desglose</p>
              <h2>Gastos por proveedor</h2>
            </div>
            <span className="table-count">
              {supplierTotal}{" "}
              {supplierTotal === 1 ? "proveedor" : "proveedores"}
            </span>
          </div>
          <FinanceComparisonChart
            emptyMessage="No hay gastos por proveedor en este período."
            items={topSupplierRows.map((supplier, index) => ({
              label: supplier.supplier_name,
              value: supplier.amount,
              tone: index === 0 ? "red" : index % 2 === 0 ? "dark" : "amber",
            }))}
          />
          {supplierTotal > 5 ? (
            <p className="form-hint">
              Gráfico de los 5 proveedores con mayor gasto. La tabla incluye
              todos los proveedores y se pagina de 10 en 10.
            </p>
          ) : null}
        </section>

        <section className="dashboard-card">
          <h2>Detalle de gastos por proveedor</h2>
          {supplierTotal === 0 ? (
            <p className="empty-state">No hay gastos en este período.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Registros</th>
                    <th scope="col">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierRows.map((supplier) => (
                    <tr key={supplier.supplier_name}>
                      <td>{supplier.supplier_name}</td>
                      <td>{supplier.expense_count}</td>
                      <td>{formatMoney(supplier.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {supplierTotal > 0 ? (
            <nav aria-label="Paginación de gastos por proveedor" className="reports-pagination">
              <span>
                {supplierOffset + 1}–
                {Math.min(supplierOffset + pageSize, supplierTotal)} de{" "}
                {supplierTotal} proveedores
              </span>
              <div>
                {supplierPage > 1 ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(closingPage, supplierPage - 1)}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="reports-pagination-disabled"
                  >
                    Anterior
                  </span>
                )}
                <span>
                  Página {supplierPage} de {supplierPageCount}
                </span>
                {supplierPage < supplierPageCount ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(closingPage, supplierPage + 1)}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="reports-pagination-disabled"
                  >
                    Siguiente
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </section>

        <section className="dashboard-card">
          <h2>Alcance del informe</h2>
          <p>
            Los cierres usan la fecha de operación; los gastos usan la fecha
            en que se incurrió en ellos y se restan del Reporte Z neto del
            período. Los pagos se agrupan por fecha efectiva. Facturas de
            proveedor y pagos se reportan separados de los gastos. El
            informe no calcula utilidad neta.
          </p>
        </section>
      </div>
    </main>
  );
}
