import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { requireBusinessDate, todayInPanama } from "@/lib/finance/dates";
import { formatMoney, sumMoney } from "@/lib/finance/money";

export const instant = false;

type TipsPeriod = "day" | "week" | "month";

interface DailyTipRow extends RowDataPacket {
  operation_date: string;
  tips_total: string;
}

interface TipsPageProps {
  searchParams: Promise<{
    date?: string | string[];
    period?: string | string[];
  }>;
}

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

function periodLabel(period: TipsPeriod, date: string): string {
  if (period === "day") {
    return `Día ${date}`;
  }
  if (period === "month") {
    return `Mes ${date.slice(0, 7)}`;
  }

  const { start, end } = dateRange(date, "week");
  return `Semana ${start} al ${end}`;
}

export default async function TipsPage({ searchParams }: TipsPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const params = await searchParams;
  const selectedDateValue = firstValue(params.date);
  const selectedPeriodValue = firstValue(params.period);
  let date = todayInPanama();
  let invalidDate = false;

  try {
    if (selectedDateValue) {
      date = requireBusinessDate(selectedDateValue);
    }
  } catch {
    invalidDate = true;
  }

  const isPeriod = (value: string | undefined): value is TipsPeriod =>
    value === "day" || value === "week" || value === "month";
  const period = isPeriod(selectedPeriodValue) ? selectedPeriodValue : "day";
  const invalidPeriod = Boolean(selectedPeriodValue && !isPeriod(selectedPeriodValue));
  const range = dateRange(date, period);
  const [rows] = await getDbPool().execute<DailyTipRow[]>(
    `SELECT DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
            tips_total
     FROM daily_closings
     WHERE status IN ('confirmed', 'corrected')
       AND operation_date BETWEEN ? AND ?
     ORDER BY operation_date`,
    [range.start, range.end],
  );
  const total = sumMoney(rows.map((row) => row.tips_total));

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Seguimiento de propinas</h1>
            <p className="page-heading-subtitle">
              Totales diarios de cierres confirmados, separados del Reporte Z.
            </p>
          </div>
        </div>

        {invalidDate || invalidPeriod ? (
          <p className="form-error" role="alert">
            El período o la fecha no son válidos; se muestran los valores
            predeterminados.
          </p>
        ) : null}

        <section className="dashboard-card">
          <h2>Consultar período</h2>
          <form action="/dashboard/tips" method="get" className="inline-form">
            <label>
              Período
              <select defaultValue={period} name="period">
                <option value="day">Día</option>
                <option value="week">Semana</option>
                <option value="month">Mes</option>
              </select>
            </label>
            <label>
              Fecha de referencia
              <input defaultValue={date} name="date" required type="date" />
            </label>
            <button type="submit">Ver propinas</button>
          </form>
          <p className="form-hint">
            La semana se calcula de lunes a domingo. La fecha elegida determina
            el día, la semana o el mes consultado.
          </p>
        </section>

        <section className="closing-totals" aria-label="Resumen de propinas">
          <article>
            <h2>{periodLabel(period, date)}</h2>
            <p>{formatMoney(total)}</p>
            <span>
              {rows.length} {rows.length === 1 ? "cierre incluido" : "cierres incluidos"}
            </span>
          </article>
        </section>

        <section className="dashboard-card">
          <h2>Propinas por día</h2>
          {rows.length === 0 ? (
            <p className="empty-state">
              No hay cierres confirmados para este período.
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
                      <td>{row.operation_date}</td>
                      <td>{formatMoney(row.tips_total)}</td>
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
