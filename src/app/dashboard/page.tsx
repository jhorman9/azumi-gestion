import { connection } from "next/server";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { currentMonthInPanama } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { getFinanceSummary } from "@/lib/finance/report";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const user = await requirePermission("dashboard:read");
  const range = currentMonthInPanama();
  const summary = await getFinanceSummary(getDbPool(), range);

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Resumen gerencial</p>
            <h1>Este mes</h1>
          </div>
          <p>
            {range.start} al {range.end} · {user.email}
          </p>
        </div>
        <section aria-label="Indicadores del mes" className="metric-grid">
          <article className="metric-card">
            <h2>Ventas totales</h2>
            <p>{formatMoney(summary.salesTotal)}</p>
            <span>Solo cierres confirmados o corregidos</span>
          </article>
          <article className="metric-card">
            <h2>Gastos incurridos</h2>
            <p>{formatMoney(summary.expenseIncurred)}</p>
            <span>Excluye gastos anulados</span>
          </article>
          <article className="metric-card">
            <h2>Gastos pagados</h2>
            <p>{formatMoney(summary.expensePaid)}</p>
            <span>Según fecha efectiva de pago</span>
          </article>
          <article className="metric-card">
            <h2>Facturas emitidas</h2>
            <p>{formatMoney(summary.supplierBillsIssued)}</p>
            <span>No se vuelven a contar como gastos</span>
          </article>
          <article className="metric-card">
            <h2>Pagos a proveedores</h2>
            <p>{formatMoney(summary.supplierPayments)}</p>
            <span>Pagos registrados durante el mes</span>
          </article>
          <article className="metric-card">
            <h2>Saldo por pagar</h2>
            <p>{formatMoney(summary.outstandingPayables)}</p>
            <span>Facturas abiertas con saldo pendiente</span>
          </article>
          <article className="metric-card">
            <h2>Saldo vencido</h2>
            <p>{formatMoney(summary.overduePayables)}</p>
            <span>Facturas vencidas a la fecha local</span>
          </article>
        </section>
        <section className="dashboard-card">
          <h2>Lectura financiera</h2>
          <p>
            Las ventas reportadas, los gastos incurridos, los pagos y las
            obligaciones se muestran por separado. Estas cifras no representan
            utilidad neta.
          </p>
          <a className="text-link" href="/dashboard/reports">
            Ver informe por período
          </a>
        </section>
      </div>
    </main>
  );
}
