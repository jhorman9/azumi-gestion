import Link from "next/link";
import { connection } from "next/server";
import {
  ChartNoAxesCombined,
  CircleAlert,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { FinanceTrendChart } from "@/app/components/finance-trend-chart";
import { MetricCard } from "@/app/components/metric-card";
import { ManagerNav } from "@/app/components/manager-nav";
import { PayablesDonutChart } from "@/app/components/payables-donut-chart";
import { getDbPool } from "@/lib/db";
import {
  businessYearRange,
  businessMonthRange,
  currentMonthInPanama,
  isValidBusinessMonth,
  isValidBusinessYear,
} from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import {
  getFinanceSummary,
  getFinanceTrend,
} from "@/lib/finance/report";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface DashboardPageProps {
  searchParams: Promise<{
    month?: string | string[];
    period?: string | string[];
    year?: string | string[];
  }>;
}

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await connection();
  const user = await requirePermission("dashboard:read");
  const params = await searchParams;
  const currentRange = currentMonthInPanama();
  const currentMonth = currentRange.start.slice(0, 7);
  const currentYear = currentRange.start.slice(0, 4);
  const requestedPeriod = firstValue(params.period);
  const period = requestedPeriod === "year" ? "year" : "month";
  const requestedMonth = firstValue(params.month);
  const month =
    requestedMonth && isValidBusinessMonth(requestedMonth)
      ? requestedMonth
      : currentMonth;
  const requestedYear = firstValue(params.year);
  const year =
    requestedYear && isValidBusinessYear(requestedYear)
      ? requestedYear
      : currentYear;
  const range =
    period === "year"
      ? businessYearRange(year)
      : month === currentMonth
        ? currentRange
        : businessMonthRange(month);
  const pool = getDbPool();
  const [summary, trend] = await Promise.all([
    getFinanceSummary(pool, range),
    getFinanceTrend(pool, range, period === "year" ? "month" : "day"),
  ]);

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Resumen gerencial</p>
            <h1>Buenos días</h1>
            <p className="page-heading-subtitle">
              Saldos, gastos y pagos pendientes del{" "}
              {period === "year" ? "año" : "mes"} seleccionado.
            </p>
          </div>
          <span className="date-range-pill">
            {range.start} <span aria-hidden="true">—</span> {range.end}
          </span>
        </div>
        <form
          action="/dashboard"
          className="dashboard-period-filter"
          method="get"
        >
          <label>
            Consultar por mes
            <input defaultValue={month} name="month" type="month" />
          </label>
          <button
            className={period === "month" ? undefined : "button-secondary"}
            formNoValidate
            name="period"
            type="submit"
            value="month"
          >
            Ver mes
          </button>
          <label>
            Consultar por año
            <input
              defaultValue={year}
              inputMode="numeric"
              max="9998"
              min="1000"
              name="year"
              step="1"
              type="number"
            />
          </label>
          <button
            className={period === "year" ? undefined : "button-secondary"}
            formNoValidate
            name="period"
            type="submit"
            value="year"
          >
            Ver año
          </button>
          {period === "year" ? (
            year !== currentYear ? (
              <Link
                className="button-secondary text-link"
                href="/dashboard?period=year"
              >
                Año actual
              </Link>
            ) : null
          ) : month !== currentMonth ? (
            <Link className="button-secondary text-link" href="/dashboard">
              Mes actual
            </Link>
          ) : null}
          <p>
            El resumen incluye el período calendario completo: del{" "}
            {range.start} al {range.end}.
          </p>
        </form>
        <section aria-label="Indicadores del período" className="metric-grid">
          <MetricCard
            hint="Reporte Z neto del período antes de restar los gastos"
            icon={CircleDollarSign}
            label="Saldo total sin gastos"
            tone="blue"
            value={formatMoney(summary.salesTotal)}
          />
          <MetricCard
            hint="Gastos pagados por fecha del gasto; se restan del saldo"
            icon={ReceiptText}
            label="Gastos del período"
            tone="amber"
            value={formatMoney(summary.expenseIncurred)}
          />
          <MetricCard
            hint="Saldo sin gastos menos los gastos del período; puede ser negativo"
            icon={CircleDollarSign}
            label="Saldo total con gastos"
            tone={summary.salesAfterExpenses.startsWith("-") ? "red" : "green"}
            value={formatMoney(summary.salesAfterExpenses)}
          />
          <MetricCard
            hint="Saldo actual de facturas con deuda; no depende del período"
            icon={WalletCards}
            label="Pagos pendientes"
            tone="violet"
            value={formatMoney(summary.outstandingPayables)}
          />
          <MetricCard
            hint="Parte de los pagos pendientes que ya venció"
            icon={CircleAlert}
            label="Pagos pendientes vencidos"
            tone="amber"
            value={formatMoney(summary.overduePayables)}
          />
        </section>
        <div className="dashboard-bottom-grid">
          <section className="dashboard-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Vista financiera</p>
                <h2>Evolución del período</h2>
              </div>
              <ChartNoAxesCombined aria-hidden="true" className="section-heading-icon" />
            </div>
            <FinanceTrendChart
              granularity={period === "year" ? "month" : "day"}
              points={trend}
            />
            <p className="chart-caption">
              El gráfico compara el Reporte Z de cada cierre con los gastos
              registrados por fecha del gasto. El indicador del resumen resta
              todos los gastos del período; no representa utilidad neta.
            </p>
          </section>
          <section className="dashboard-card payables-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Seguimiento</p>
                <h2>Cuentas por pagar</h2>
              </div>
              <WalletCards aria-hidden="true" className="section-heading-icon" />
            </div>
            <PayablesDonutChart
              outstanding={summary.outstandingPayables}
              overdue={summary.overduePayables}
            />
            <p className="chart-caption payables-caption">
              Saldo actual; no cambia con el período seleccionado.
            </p>
            <Link className="text-link payables-link" href="/dashboard/bills">
              Revisar facturas <span aria-hidden="true">→</span>
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
