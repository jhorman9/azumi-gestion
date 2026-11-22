import Link from "next/link";
import { connection } from "next/server";
import {
  ChartNoAxesCombined,
  CircleAlert,
  CircleDollarSign,
  CircleCheck,
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
  businessYearRange,
  businessMonthRange,
  currentMonthInPanama,
  isValidBusinessMonth,
  isValidBusinessYear,
} from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { getFinanceSummary } from "@/lib/finance/report";
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
  const summary = await getFinanceSummary(getDbPool(), range);

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Resumen gerencial</p>
            <h1>Buenos días</h1>
            <p className="page-heading-subtitle">
              Panorama del restaurante durante el{" "}
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
            hint="Cierres confirmados después de gastos descontados"
            icon={CircleDollarSign}
            label="Reporte Z neto del período"
            tone="red"
            value={formatMoney(summary.salesTotal)}
          />
          <MetricCard
            hint="Excluye gastos anulados"
            icon={ReceiptText}
            label="Gastos incurridos"
            tone="amber"
            value={formatMoney(summary.expenseIncurred)}
          />
          <MetricCard
            hint="Según fecha efectiva de pago"
            icon={CircleCheck}
            label="Gastos pagados"
            tone="green"
            value={formatMoney(summary.expensePaid)}
          />
          <MetricCard
            hint="Obligaciones nuevas del período"
            icon={FileText}
            label="Facturas emitidas"
            tone="blue"
            value={formatMoney(summary.supplierBillsIssued)}
          />
          <MetricCard
            hint={`Pagos realizados en el ${period === "year" ? "año" : "mes"}`}
            icon={HandCoins}
            label="Pagos a proveedores"
            tone="violet"
            value={formatMoney(summary.supplierPayments)}
          />
          <MetricCard
            hint="Saldo actual de las facturas abiertas"
            icon={WalletCards}
            label="Saldo por pagar"
            value={formatMoney(summary.outstandingPayables)}
          />
          <MetricCard
            hint="Saldo vencido actual; requiere seguimiento"
            icon={CircleAlert}
            label="Saldo vencido"
            tone="amber"
            value={formatMoney(summary.overduePayables)}
          />
        </section>
        <div className="dashboard-bottom-grid">
          <section className="dashboard-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Vista financiera</p>
                <h2>Ingresos y egresos</h2>
              </div>
              <ChartNoAxesCombined aria-hidden="true" className="section-heading-icon" />
            </div>
            <FinanceBarChart
              items={[
                { label: "Ventas", value: summary.salesTotal, tone: "red" },
                {
                  label: "Gastos incurridos",
                  value: summary.expenseIncurred,
                  tone: "dark",
                },
                {
                  label: "Gastos pagados",
                  value: summary.expensePaid,
                  tone: "amber",
                },
              ]}
            />
            <p className="chart-caption">
              Los importes se comparan como referencia; no representan utilidad neta.
            </p>
          </section>
          <section className="dashboard-card dashboard-note-card">
            <span aria-hidden="true" className="note-icon">
              <WalletCards size={20} />
            </span>
            <p className="eyebrow">Próximo paso</p>
            <h2>Mantén tus cuentas al día</h2>
            <p>
              Revisa las facturas abiertas y sus fechas de vencimiento para
              anticipar pagos.
            </p>
            <a className="text-link" href="/dashboard/reports">
              Ver informes <span aria-hidden="true">→</span>
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}
