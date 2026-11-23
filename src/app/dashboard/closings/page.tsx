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
  last_action: string | null;
  last_actor_name: string | null;
  last_action_at: string | null;
  status: "draft" | "confirmed" | "corrected";
}

interface ClosingCountRow extends RowDataPacket {
  total: number | string;
}

interface ClosingsPageProps {
  searchParams: Promise<{
    created?: string | string[];
    error?: string | string[];
    month?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
  }>;
}

const pageSize = 10;

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos del cierre.",
  duplicate: "Ya existe un cierre para esa fecha.",
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

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function monthEndDate(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export default async function ClosingsPage({
  searchParams,
}: ClosingsPageProps) {
  await connection();
  const user = await requirePermission("closings:read");
  const params = await searchParams;
  const today = todayInPanama();
  const requestedMonth = firstValue(params.month);
  const month =
    requestedMonth && isValidMonth(requestedMonth)
      ? requestedMonth
      : today.slice(0, 7);
  let from = firstValue(params.from) ?? "";
  let to = firstValue(params.to) ?? "";

  if (!isValidBusinessDate(from) || !from.startsWith(month)) {
    from = "";
  }
  if (!isValidBusinessDate(to) || !to.startsWith(month)) {
    to = "";
  }
  if (from && to && from > to) {
    from = "";
    to = "";
  }

  const startDate = from || monthStartDate(month);
  const endDate = to || monthEndDate(month);
  const [countRows] = await getDbPool().execute<ClosingCountRow[]>(
    `SELECT COUNT(*) AS total
     FROM daily_closings
     WHERE operation_date BETWEEN ? AND ?`,
    [startDate, endDate],
  );
  const totalRows = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const requestedPage = Number(firstValue(params.page) ?? "1");
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
  const offset = (page - 1) * pageSize;
  const [closings] = await getDbPool().execute<ClosingRow[]>(
    `SELECT c.id, DATE_FORMAT(c.operation_date, '%Y-%m-%d') AS operation_date,
            c.reported_sales_total, c.pedidos_ya_total, c.cash_total,
            COALESCE((
              SELECT SUM(o.amount)
              FROM daily_closing_cash_outflows o
              WHERE o.daily_closing_id = c.id
            ), 0.00) AS cash_outflow_total,
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
     WHERE c.operation_date BETWEEN ? AND ?
     ORDER BY c.operation_date DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [startDate, endDate, pageSize, offset],
  );
  const error = firstValue(params.error);
  const created = firstValue(params.created);
  const paginationQuery = new URLSearchParams({ month });
  if (from) {
    paginationQuery.set("from", from);
  }
  if (to) {
    paginationQuery.set("to", to);
  }
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams(paginationQuery);
    query.set("page", String(nextPage));
    return `/dashboard/closings?${query.toString()}`;
  };

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
          <h2>Historial de cierres</h2>
          <form action="/dashboard/closings" className="inline-form" method="get">
            <label>
              Mes
              <input defaultValue={month} name="month" required type="month" />
            </label>
            <label>
              Desde el día
              <input defaultValue={from} name="from" type="date" />
            </label>
            <label>
              Hasta el día
              <input defaultValue={to} name="to" type="date" />
            </label>
            <button type="submit">Filtrar historial</button>
          </form>
          <p className="form-hint">
            Selecciona un mes completo o limita los resultados a días de ese
            mes. Se muestran 10 cierres por página.
          </p>
          {closings.length === 0 ? (
            <p className="empty-state">
              No hay cierres para los filtros seleccionados.
            </p>
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
                      <td>{statusLabels[closing.status]}</td>
                      <td>
                        <AuditLabel
                          action={closing.last_action}
                          actorName={closing.last_actor_name}
                          occurredAt={closing.last_action_at}
                        />
                      </td>
                      <td>
                        <Link
                          className="button-secondary text-link"
                          href={`/dashboard/closings/${closing.id}`}
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Paginación del historial" className="history-pagination">
            <span>
              {totalRows === 0
                ? "0 cierres"
                : `${offset + 1}–${Math.min(offset + pageSize, totalRows)} de ${totalRows} cierres`}
            </span>
            <div>
              {page > 1 ? (
                <Link
                  aria-label="Página anterior"
                  className="button-secondary text-link"
                  href={pageHref(page - 1)}
                >
                  Anterior
                </Link>
              ) : (
                <span aria-disabled="true" className="history-pagination-disabled">
                  Anterior
                </span>
              )}
              <span>
                Página {page} de {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  aria-label="Página siguiente"
                  className="button-secondary text-link"
                  href={pageHref(page + 1)}
                >
                  Siguiente
                </Link>
              ) : (
                <span aria-disabled="true" className="history-pagination-disabled">
                  Siguiente
                </span>
              )}
            </div>
          </nav>
        </section>
      </div>
    </main>
  );
}
