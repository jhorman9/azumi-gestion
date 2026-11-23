import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { AuditLabel } from "@/app/components/audit-label";
import { ExpenseVoidConfirmation } from "@/app/components/expense-void-confirmation";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import {
  businessMonthRange,
  currentMonthInPanama,
  isValidBusinessMonth,
  todayInPanama,
} from "@/lib/finance/dates";
import {
  expensePaymentMethodLabels,
  formatMoney,
  subtractMoneyAllowNegative,
} from "@/lib/finance/money";
import { getPayablesSummary } from "@/lib/finance/report";

export const instant = false;

interface SupplierOptionRow extends RowDataPacket {
  id: string | number;
  legal_name: string;
}

interface ExpenseRow extends RowDataPacket {
  id: string | number;
  supplier_id: string | number;
  incurred_on: string;
  amount: string;
  payment_method: keyof typeof expensePaymentMethodLabels;
  status: "paid" | "void";
  archived_at: Date | string | null;
  supplier_name: string;
  last_action: string | null;
  last_actor_name: string | null;
  last_action_at: string | null;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface ExpenseMonthlySummaryRow extends RowDataPacket {
  total_count: number | string;
  total_amount: string;
}

interface MonthlySalesRow extends RowDataPacket {
  total_amount: string;
}

interface ExpensesPageProps {
  searchParams: Promise<{
    page?: string | string[];
    month?: string | string[];
    archived?: string | string[];
    created?: string | string[];
    updated?: string | string[];
    error?: string | string[];
  }>;
}

const pageSize = 10;

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function errorMessage(code?: string): string | undefined {
  if (!code) return undefined;
  const messages: Record<string, string> = {
    invalid: "Revisa los datos del gasto y selecciona un proveedor activo.",
    "not-found": "No se encontró el gasto.",
    locked: "La acción no está permitida para el estado actual del gasto.",
    failed: "No fue posible guardar los cambios.",
  };
  return messages[code] ?? "Ocurrió un error.";
}

function ExpenseFields({
  suppliers,
  today,
  supplierId = "",
  incurredOn,
  amount = "",
  paymentMethod = "cash",
}: {
  suppliers: SupplierOptionRow[];
  today: string;
  supplierId?: string;
  incurredOn: string;
  amount?: string;
  paymentMethod?: keyof typeof expensePaymentMethodLabels;
}) {
  return (
    <>
      <div className="form-grid">
        <label>
          Proveedor
          <select defaultValue={supplierId} name="supplier_id" required>
            <option value="" disabled>
              Selecciona un proveedor
            </option>
            {suppliers.map((supplier) => (
              <option key={String(supplier.id)} value={String(supplier.id)}>
                {supplier.legal_name}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Selecciona el proveedor relacionado con este gasto.
          </small>
        </label>
        <label>
          Fecha del gasto
          <input
            defaultValue={incurredOn}
            max={today}
            name="incurred_on"
            required
            type="date"
          />
          <small className="field-hint">
            Indica el día en que se realizó el gasto.
          </small>
        </label>
        <label>
          Cantidad gastada
          <input
            defaultValue={amount}
            min="0.01"
            name="amount"
            required
            step="0.01"
            type="number"
          />
          <small className="field-hint">
            Ingresa el importe total pagado, en dólares.
          </small>
        </label>
        <label>
          Cómo se pagó
          <select defaultValue={paymentMethod} name="payment_method" required>
            {Object.entries(expensePaymentMethodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small className="field-hint">
            Elige el medio utilizado para pagar.
          </small>
        </label>
      </div>
    </>
  );
}

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const today = todayInPanama();
  const currentMonthRange = currentMonthInPanama();
  const currentMonth = currentMonthRange.start.slice(0, 7);
  const params = await searchParams;
  const requestedMonth = firstValue(params.month);
  const month =
    requestedMonth && isValidBusinessMonth(requestedMonth)
      ? requestedMonth
      : currentMonth;
  const monthRange =
    month === currentMonth ? currentMonthRange : businessMonthRange(month);
  const showArchived = firstValue(params.archived) === "1";
  const archiveFilter = showArchived ? "IS NOT NULL" : "IS NULL";
  const pool = getDbPool();
  const [
    suppliers,
    expenseCounts,
    monthlyExpenseRows,
    monthlySalesRows,
    payablesSummary,
  ] = await Promise.all([
      pool.execute<SupplierOptionRow[]>(
        `SELECT id, legal_name
         FROM suppliers
         WHERE is_active = 1
         ORDER BY legal_name`,
      ),
      pool.execute<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM expenses
         WHERE archived_at ${archiveFilter}`,
      ),
      pool.execute<ExpenseMonthlySummaryRow[]>(
        `SELECT COUNT(*) AS total_count,
                COALESCE(SUM(amount), 0.00) AS total_amount
        FROM expenses
        WHERE status = 'paid'
          AND incurred_on BETWEEN ? AND ?`,
        [monthRange.start, monthRange.end],
      ),
      pool.execute<MonthlySalesRow[]>(
        `SELECT COALESCE(SUM(reported_sales_total), 0.00) AS total_amount
        FROM daily_closings
        WHERE status IN ('confirmed', 'corrected')
          AND operation_date BETWEEN ? AND ?`,
        [monthRange.start, monthRange.end],
      ),
      getPayablesSummary(pool),
  ]);
  const expenseTotal = Number(expenseCounts[0][0]?.total ?? 0);
  const monthlySummary = monthlyExpenseRows[0][0];
  const monthlySales = monthlySalesRows[0][0]?.total_amount ?? "0.00";
  const monthlyExpenses = monthlySummary?.total_amount ?? "0.00";
  const monthlyBalance = subtractMoneyAllowNegative(
    monthlySales,
    monthlyExpenses,
  );
  const monthlyBalanceIsLoss = monthlyBalance.startsWith("-");
  const pageCount = Math.max(1, Math.ceil(expenseTotal / pageSize));
  const requestedPage = Number(firstValue(params.page) ?? "1");
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, pageCount)
      : 1;
  const offset = (page - 1) * pageSize;
  const [expenseRows] = await pool.execute<ExpenseRow[]>(
    `SELECT e.id,
            DATE_FORMAT(e.incurred_on, '%Y-%m-%d') AS incurred_on,
            e.supplier_id, e.amount, e.payment_method, e.status, e.archived_at,
            s.legal_name AS supplier_name,
            a.action AS last_action,
            au.name AS last_actor_name,
            DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS last_action_at
     FROM expenses e
     INNER JOIN suppliers s ON s.id = e.supplier_id
     LEFT JOIN (
       SELECT entity_id, MAX(id) AS audit_id
       FROM audit_logs
       WHERE entity_type = 'expense'
       GROUP BY entity_id
     ) latest ON latest.entity_id = CAST(e.id AS CHAR)
     LEFT JOIN audit_logs a ON a.id = latest.audit_id
     LEFT JOIN users au ON au.id = a.actor_user_id
     WHERE e.archived_at ${archiveFilter}
     ORDER BY e.incurred_on DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );
  const supplierRows = suppliers[0];
  const error = firstValue(params.error);
  const created = firstValue(params.created);
  const updated = firstValue(params.updated);
  const queryForView = (archived: boolean) => {
    const query = new URLSearchParams({ month });
    if (archived) {
      query.set("archived", "1");
    }
    return query;
  };
  const viewHref = (archived: boolean) =>
    `/dashboard/expenses?${queryForView(archived).toString()}`;
  const pageHref = (nextPage: number) => {
    const query = queryForView(showArchived);
    if (nextPage > 1) {
      query.set("page", String(nextPage));
    }
    return `/dashboard/expenses?${query.toString()}`;
  };

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Gastos</h1>
            <p className="page-heading-subtitle">
              Los gastos no se descuentan de cierres diarios; se restan del
              saldo del período según la fecha del gasto.
            </p>
          </div>
          <p>Registra el proveedor, el importe y cómo se pagó.</p>
        </div>
        <section
          aria-label={`Estadística mensual de gastos para ${month}`}
          className="dashboard-card expense-monthly-summary"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Control mensual</p>
              <h2>Impacto de gastos en el período</h2>
            </div>
            <form
              action="/dashboard/expenses"
              className="inline-form expense-month-filter"
              method="get"
            >
              <label htmlFor="expense-summary-month">Mes del resumen</label>
              <input
                defaultValue={month}
                id="expense-summary-month"
                name="month"
                required
                type="month"
              />
              <button type="submit">Consultar</button>
            </form>
          </div>
          <p className="expense-monthly-context">
            Compara el Reporte Z de los cierres confirmados o corregidos con
            los gastos pagados por fecha del gasto. Los gastos no modifican
            cierres.
          </p>
          <div className="expense-monthly-stat-grid">
            <article className="expense-monthly-stat">
              <h3>Saldo total del período sin gastos</h3>
              <strong>{formatMoney(monthlySales)}</strong>
              <p>Reporte Z neto de los cierres del mes seleccionado.</p>
            </article>
            <article className="expense-monthly-stat">
              <h3>Gastos pagados</h3>
              <strong>{formatMoney(monthlyExpenses)}</strong>
              <p>
                {monthlySummary?.total_count ?? 0} gastos, agrupados por fecha
                del gasto; anulados excluidos.
              </p>
            </article>
            <article
              className={`expense-monthly-stat expense-monthly-stat-balance${
                monthlyBalanceIsLoss ? " is-loss" : ""
              }`}
            >
              <h3>Saldo total del período con gastos</h3>
              <strong>{formatMoney(monthlyBalance)}</strong>
              <p>
                {monthlyBalanceIsLoss
                  ? "El período registra una pérdida."
                  : "Reporte Z neto menos todos los gastos pagados del mes."}
              </p>
            </article>
            <article className="expense-monthly-stat expense-monthly-stat-payables">
              <h3>Pagos pendientes actuales</h3>
              <strong>{formatMoney(payablesSummary.totalAmount)}</strong>
              <p>
                {payablesSummary.totalCount}{" "}
                {payablesSummary.totalCount === 1
                  ? "factura con saldo pendiente"
                  : "facturas con saldo pendiente"}
                . Vencido: {formatMoney(payablesSummary.overdueAmount)}
              </p>
              <Link className="text-link" href="/dashboard/bills">
                Ver cuentas por pagar
              </Link>
            </article>
          </div>
          <p className="expense-monthly-note">
            Anulados no se incluyen. El selector solo cambia este resumen; el
            historial de abajo sigue mostrando todos los gastos. Los pagos
            pendientes son saldos actuales de facturas y se muestran por
            separado: no se agregan a los gastos ni se descuentan del saldo del
            período.
          </p>
        </section>
        {created ? (
          <p className="success-message" role="status">
            Gasto registrado.
          </p>
        ) : null}
        {updated ? (
          <p className="success-message" role="status">
            {updated === "archived"
              ? "Gasto anulado archivado."
              : updated === "restored"
                ? "Gasto restaurado al historial."
                : updated === "voided"
                  ? "Gasto anulado."
                  : "Gasto actualizado y saldo del período recalculado."}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}

        <section className="dashboard-card expenses-create-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nuevo movimiento</p>
              <h2>Registrar gasto</h2>
            </div>
          </div>
          <p className="form-hint">
            El gasto se restará del saldo del período por su fecha; no afecta
            el efectivo ni el Reporte Z de un cierre diario.
          </p>
          {supplierRows.length === 0 ? (
            <p className="form-hint">
              Primero registra o activa un proveedor en la sección Proveedores.
            </p>
          ) : (
            <form
              action="/api/finance/expenses"
              method="post"
              className="finance-form"
            >
              <ExpenseFields suppliers={supplierRows} today={today} incurredOn={today} />
              <button type="submit">Registrar gasto</button>
            </form>
          )}
        </section>

        <section className="dashboard-card expenses-history-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Movimientos</p>
              <h2>{showArchived ? "Gastos archivados" : "Historial de gastos"}</h2>
            </div>
            {expenseRows.length > 0 ? (
              <span className="table-count">
                {expenseTotal} {expenseTotal === 1 ? "gasto" : "gastos"}
              </span>
            ) : null}
          </div>
          <nav aria-label="Filtro del historial de gastos" className="expense-history-filters">
            <Link
              aria-current={showArchived ? undefined : "page"}
              className={`button-secondary text-link${showArchived ? "" : " is-active"}`}
              href={viewHref(false)}
            >
              Todos los gastos
            </Link>
            <Link
              aria-current={showArchived ? "page" : undefined}
              className={`button-secondary text-link${showArchived ? " is-active" : ""}`}
              href={viewHref(true)}
            >
              Archivados
            </Link>
          </nav>
          <p className="form-hint expenses-history-hint">
            {showArchived
              ? "Solo se archivan gastos anulados. Puedes restaurarlos al historial."
              : "Selecciona un gasto para ver sus detalles y acciones. Del más reciente al más antiguo."}
          </p>
          {expenseRows.length === 0 ? (
            <p className="empty-state">
              {showArchived
                ? "No hay gastos archivados."
                : "Todavía no hay gastos."}
            </p>
          ) : (
            <div className="expense-list">
              {expenseRows.map((expense) => {
                const periodEffect =
                  expense.status === "void"
                    ? "Anulado; no cuenta en el saldo del período"
                    : "Se resta del saldo del período por fecha del gasto";

                const statusUrl = `/api/finance/expenses/${encodeURIComponent(String(expense.id))}/status`;

                return (
                  <details
                    className={`expense-card${expense.status === "void" ? " expense-card-void" : ""}${expense.archived_at ? " expense-card-archived" : ""}`}
                    key={String(expense.id)}
                  >
                    <summary className="expense-card-summary">
                      <span className="expense-card-title">
                        <span className="eyebrow">Proveedor</span>
                        <strong className="expense-card-supplier">
                          {expense.supplier_name}
                        </strong>
                        <span className="expense-card-date">
                          {expense.incurred_on}
                        </span>
                      </span>
                      <span className="expense-card-amount">
                        <span>Importe</span>
                        <strong>{formatMoney(expense.amount)}</strong>
                        <span
                          className={`expense-status expense-status-${expense.status}`}
                        >
                          {expense.status === "paid" ? "Registrado" : "Anulado"}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="expense-card-expand-icon"
                      />
                    </summary>

                    <div className="expense-card-content">
                      <div
                        className={`expense-period-indicator ${
                          expense.status === "void"
                            ? "expense-period-indicator-void"
                            : "expense-period-indicator-paid"
                        }`}
                      >
                        <strong>
                          {expense.archived_at
                            ? "Gasto anulado y archivado"
                            : expense.status === "void"
                              ? "Gasto anulado"
                              : "Gasto incluido en el saldo del período"}
                        </strong>
                        <span>Fecha usada: {expense.incurred_on}</span>
                      </div>

                      <dl className="expense-details">
                        <div>
                          <dt>Medio de pago</dt>
                          <dd>
                            {expensePaymentMethodLabels[expense.payment_method]}
                          </dd>
                        </div>
                        <div>
                          <dt>Efecto en el período</dt>
                          <dd>{periodEffect}</dd>
                        </div>
                        <div className="expense-audit">
                          <dt>Último cambio</dt>
                          <dd>
                            <AuditLabel
                              action={expense.last_action}
                              actorName={expense.last_actor_name}
                              occurredAt={expense.last_action_at}
                            />
                          </dd>
                        </div>
                      </dl>

                      {expense.status === "paid" ? (
                        <div className="expense-actions">
                          <details className="expense-edit">
                            <summary className="button-secondary">
                              Editar gasto
                            </summary>
                            <form
                              action={`/api/finance/expenses/${encodeURIComponent(String(expense.id))}`}
                              className="finance-form expense-edit-form"
                              method="post"
                            >
                              <p className="form-hint">
                                Actualiza los datos del gasto. El resumen del
                                período se recalculará por fecha del gasto.
                              </p>
                              <ExpenseFields
                                suppliers={supplierRows}
                                today={today}
                                supplierId={String(expense.supplier_id)}
                                incurredOn={expense.incurred_on}
                                amount={expense.amount}
                                paymentMethod={expense.payment_method}
                              />
                              <button type="submit">Guardar cambios</button>
                            </form>
                          </details>
                          <ExpenseVoidConfirmation actionUrl={statusUrl} />
                        </div>
                      ) : (
                        <div className="expense-actions">
                          <form action={statusUrl} method="post">
                            <input
                              name="action"
                              type="hidden"
                              value={showArchived ? "restore" : "archive"}
                            />
                            <button
                              className="button-secondary"
                              type="submit"
                            >
                              {showArchived
                                ? "Restaurar al historial"
                                : "Archivar gasto"}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {expenseTotal > 0 ? (
            <nav
              aria-label="Paginación de gastos"
              className="reports-pagination"
            >
              <span>
                {offset + 1}–{Math.min(offset + pageSize, expenseTotal)} de{" "}
                {expenseTotal} gastos
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
                    className="reports-pagination-disabled"
                  >
                    Anterior
                  </span>
                )}
                <span>
                  Página {page} de {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(page + 1)}
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
      </div>
    </main>
  );
}
