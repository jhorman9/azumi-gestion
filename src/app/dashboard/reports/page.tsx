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
import { FinanceBarChart } from "@/app/components/finance-bar-chart";
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
  expense_deduction_total: string;
  bank_total: string;
  status: "confirmed" | "corrected";
}

interface SupplierTotalRow extends RowDataPacket {
  supplier_name: string;
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
  const [summary, closings, suppliers] = await Promise.all([
    getFinanceSummary(pool, range),
    pool.execute<ClosingRow[]>(
      `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
              reported_sales_total, pedidos_ya_total, cash_total,
              COALESCE((
                SELECT SUM(e.amount)
                FROM expenses e
                WHERE e.closing_operation_date = daily_closings.operation_date
                  AND e.deduct_from_closing = 1
                  AND e.status = 'paid'
              ), 0.00) AS expense_deduction_total,
              COALESCE((
                SELECT SUM(p.amount)
                FROM daily_closing_channel_payments p
                WHERE p.daily_closing_id = daily_closings.id
              ), 0.00) AS bank_total,
              status
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?
       ORDER BY operation_date DESC`,
      [range.start, range.end],
    ),
    pool.execute<SupplierTotalRow[]>(
      `SELECT s.legal_name AS supplier_name, COUNT(*) AS expense_count,
              COALESCE(SUM(e.amount), 0.00) AS amount
       FROM expenses e
       INNER JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.status = 'paid'
         AND e.incurred_on BETWEEN ? AND ?
       GROUP BY s.id, s.legal_name
       ORDER BY amount DESC, s.legal_name`,
      [range.start, range.end],
    ),
  ]);
  const closingRows = closings[0];
  const supplierRows = suppliers[0];

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
            hint="Cierres confirmados después de gastos descontados"
            icon={CircleDollarSign}
            label="Reporte Z neto del período"
            tone="red"
            value={formatMoney(summary.salesTotal)}
          />
          <MetricCard
            hint="Por fecha del gasto; anulados excluidos"
            icon={ReceiptText}
            label="Gastos incurridos"
            tone="amber"
            value={formatMoney(summary.expenseIncurred)}
          />
          <MetricCard
            hint="Por fecha efectiva de pago"
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
                    <th scope="col">Reporte Z neto</th>
                    <th scope="col">Pedidos Ya</th>
                    <th scope="col">Total banco</th>
                    <th scope="col">Efectivo neto</th>
                    <th scope="col">Gastos descontados</th>
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
                      <td>{formatMoney(closing.expense_deduction_total)}</td>
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
          <div className="section-heading">
            <div>
              <p className="eyebrow">Desglose</p>
              <h2>Gastos por proveedor</h2>
            </div>
            <span className="table-count">
              {supplierRows.length}{" "}
              {supplierRows.length === 1 ? "proveedor" : "proveedores"}
            </span>
          </div>
          <FinanceBarChart
            emptyMessage="No hay gastos por proveedor en este período."
            items={supplierRows.map((supplier, index) => ({
              label: supplier.supplier_name,
              value: supplier.amount,
              tone: index === 0 ? "red" : index % 2 === 0 ? "dark" : "amber",
            }))}
          />
        </section>

        <section className="dashboard-card">
          <h2>Detalle de gastos por proveedor</h2>
          {supplierRows.length === 0 ? (
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
