import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import {
  CalendarDays,
  CircleDollarSign,
  Filter,
  HandCoins,
  TrendingUp,
} from "lucide-react";
import { MetricCard } from "@/app/components/metric-card";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { requireBusinessDate, todayInPanama } from "@/lib/finance/dates";
import { formatMoney, moneyToCents } from "@/lib/finance/money";

export const instant = false;

type TipsPeriod = "day" | "week" | "month";

interface DailyTipRow extends RowDataPacket {
  operation_date: string;
  tips_total: string;
}

interface TipsSummaryRow extends RowDataPacket {
  total_closings: number | string;
  total_tips: string;
  days_with_tips: number | string;
}

interface TipsPageProps {
  searchParams: Promise<{
    date?: string | string[];
    month?: string | string[];
    page?: string | string[];
    period?: string | string[];
  }>;
}

const pageSize = 10;

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function dateRange(date: string, period: TipsPeriod) {
  if (period === "day") {
    return { start: date, end: date };
  }

  const [year, month, day] = date.split("-").map(Number);
  if (period === "month") {
    return {
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  }

  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const start = addDays(date, -mondayOffset);
  return { start, end: addDays(start, 6) };
}

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function periodLabel(period: TipsPeriod, date: string): string {
  if (period === "day") {
    return formatDate(date);
  }
  if (period === "month") {
    const [year, month] = date.split("-").map(Number);
    const label = new Intl.DateTimeFormat("es-PA", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }

  const { start, end } = dateRange(date, "week");
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function averageMoney(total: string, count: number): string {
  if (count === 0) {
    return "0.00";
  }

  const divisor = BigInt(count);
  const cents = (moneyToCents(total) + divisor / BigInt(2)) / divisor;
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export default async function TipsPage({ searchParams }: TipsPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const params = await searchParams;
  const selectedDateValue = firstValue(params.date);
  const selectedMonthValue = firstValue(params.month);
  const selectedPeriodValue = firstValue(params.period);
  const isPeriod = (value: string | undefined): value is TipsPeriod =>
    value === "day" || value === "week" || value === "month";
  const period = isPeriod(selectedPeriodValue) ? selectedPeriodValue : "day";
  let date = todayInPanama();
  let invalidDate = false;

  if (selectedMonthValue) {
    if (validMonth(selectedMonthValue)) {
      date = `${selectedMonthValue}-01`;
    } else {
      invalidDate = true;
    }
  }

  if (selectedDateValue && (period !== "month" || !selectedMonthValue)) {
    try {
      date = requireBusinessDate(selectedDateValue);
    } catch {
      invalidDate = true;
    }
  }

  const invalidPeriod = Boolean(selectedPeriodValue && !isPeriod(selectedPeriodValue));
  const range = dateRange(date, period);
  const pool = getDbPool();
  const [[summaryRows], [highestTipRows]] = await Promise.all([
    pool.execute<TipsSummaryRow[]>(
      `SELECT COUNT(*) AS total_closings,
              COALESCE(SUM(tips_total), 0.00) AS total_tips,
              COALESCE(SUM(CASE WHEN tips_total > 0 THEN 1 ELSE 0 END), 0) AS days_with_tips
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    pool.execute<DailyTipRow[]>(
      `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
              tips_total
       FROM daily_closings
       WHERE status IN ('confirmed', 'corrected')
         AND operation_date BETWEEN ? AND ?
       ORDER BY tips_total DESC, operation_date DESC
       LIMIT 1`,
      [range.start, range.end],
    ),
  ]);
  const totalRows = Number(summaryRows[0]?.total_closings ?? 0);
  const totalTips = summaryRows[0]?.total_tips ?? "0.00";
  const daysWithTips = Number(summaryRows[0]?.days_with_tips ?? 0);
  const highestTip = highestTipRows[0] ?? null;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const requestedPage = Number(firstValue(params.page) ?? "1");
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.execute<DailyTipRow[]>(
    `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
            tips_total
     FROM daily_closings
     WHERE status IN ('confirmed', 'corrected')
       AND operation_date BETWEEN ? AND ?
     ORDER BY operation_date DESC
     LIMIT ? OFFSET ?`,
    [range.start, range.end, pageSize, offset],
  );
  const selectedPeriodLabel = periodLabel(period, date);
  const referenceValue = period === "month" ? date.slice(0, 7) : date;
  const paginationQuery = new URLSearchParams({ period });
  paginationQuery.set(
    period === "month" ? "month" : "date",
    referenceValue,
  );
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams(paginationQuery);
    query.set("page", String(nextPage));
    return `/dashboard/tips?${query.toString()}`;
  };
  const quickFilters = [
    {
      label: "Hoy",
      href: `/dashboard/tips?period=day&date=${todayInPanama()}`,
      active: period === "day" && date === todayInPanama(),
    },
    {
      label: "Esta semana",
      href: `/dashboard/tips?period=week&date=${todayInPanama()}`,
      active: period === "week" && date === todayInPanama(),
    },
    {
      label: "Este mes",
      href: `/dashboard/tips?period=month&month=${todayInPanama().slice(0, 7)}`,
      active: period === "month" && date.slice(0, 7) === todayInPanama().slice(0, 7),
    },
  ];

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Seguimiento de propinas</h1>
            <p className="page-heading-subtitle">
              Consulta y compara las propinas registradas en cada cierre. Se
              mantienen separadas del Reporte Z.
            </p>
          </div>
        </div>

        {invalidDate || invalidPeriod ? (
          <p className="form-hint">
            El filtro no era válido; se muestran los valores predeterminados.
          </p>
        ) : null}

        <section className="dashboard-card tips-filter-card">
          <div className="tips-section-heading">
            <div>
              <p className="eyebrow">Filtros</p>
              <h2>Selecciona un período</h2>
            </div>
            <span className="tips-period-chip">{selectedPeriodLabel}</span>
          </div>
          <form action="/dashboard/tips" className="inline-form tips-filter-form" method="get">
            <label>
              Agrupar por
              <select defaultValue={period} name="period">
                <option value="day">Día</option>
                <option value="week">Semana</option>
                <option value="month">Mes</option>
              </select>
            </label>
            <label>
              {period === "month" ? "Mes" : "Fecha de referencia"}
              <input
                defaultValue={referenceValue}
                name={period === "month" ? "month" : "date"}
                required
                type={period === "month" ? "month" : "date"}
              />
            </label>
            <button className="tips-filter-submit" type="submit">
              <Filter aria-hidden="true" size={16} />
              Aplicar filtros
            </button>
          </form>
          <div className="tips-quick-filters">
            <span>Acceso rápido</span>
            <nav aria-label="Períodos frecuentes">
              {quickFilters.map((filter) => (
                <Link
                  aria-current={filter.active ? "page" : undefined}
                  className="tips-quick-filter"
                  href={filter.href}
                  key={filter.label}
                >
                  {filter.label}
                </Link>
              ))}
            </nav>
          </div>
          <p className="form-hint">
            La semana va de lunes a domingo. El período incluye cierres
            confirmados o corregidos.
          </p>
        </section>

        <section aria-label="Resumen de propinas" className="metric-grid">
          <MetricCard
            hint={selectedPeriodLabel}
            icon={HandCoins}
            label="Propinas del período"
            tone="red"
            value={formatMoney(totalTips)}
          />
          <MetricCard
            hint="Con cierre confirmado o corregido"
            icon={CalendarDays}
            label="Días con propinas"
            tone="blue"
            value={String(daysWithTips)}
          />
          <MetricCard
            hint="Promedio por cierre del período"
            icon={CircleDollarSign}
            label="Promedio diario"
            tone="green"
            value={formatMoney(averageMoney(totalTips, totalRows))}
          />
          <MetricCard
            hint={highestTip ? `Registrado el ${formatDate(highestTip.operation_date)}` : "Sin cierres en este período"}
            icon={TrendingUp}
            label="Día con mayor propina"
            tone="amber"
            value={formatMoney(highestTip?.tips_total ?? "0.00")}
          />
        </section>

        <section className="dashboard-card tips-details-card">
          <div className="tips-section-heading">
            <div>
              <p className="eyebrow">Detalle</p>
              <h2>Propinas por día</h2>
            </div>
            <span className="tips-period-chip">
              {totalRows} {totalRows === 1 ? "cierre" : "cierres"}
            </span>
          </div>
          {totalRows === 0 ? (
            <p className="empty-state">
              No hay cierres confirmados para este período. Prueba otro filtro.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Propina total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.operation_date}>
                      <td>{formatDate(row.operation_date)}</td>
                      <td>{formatMoney(row.tips_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalRows > 0 ? (
            <nav aria-label="Paginación de propinas" className="tips-pagination">
              <span>
                {offset + 1}–{Math.min(offset + pageSize, totalRows)} de{" "}
                {totalRows} días
              </span>
              <div>
                {page > 1 ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(page - 1)}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="tips-pagination-disabled"
                  >
                    Anterior
                  </span>
                )}
                <span>
                  Página {page} de {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(page + 1)}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="tips-pagination-disabled"
                  >
                    Siguiente
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
