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
} from "@/lib/finance/money";

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
  deduct_from_closing: number;
  closing_operation_date: string | null;
  closing_status: "draft" | "confirmed" | "corrected" | null;
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
  unassigned_count: number | string;
  unassigned_amount: string;
  assigned_count: number | string;
  assigned_amount: string;
}

interface ExpensesPageProps {
  searchParams: Promise<{
    page?: string | string[];
    month?: string | string[];
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
    locked: "El gasto anulado no puede modificarse.",
    "deduction-exceeds-cash":
      "El gasto supera el efectivo disponible del cierre seleccionado.",
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
  deductFromClosing = false,
  closingDate,
}: {
  suppliers: SupplierOptionRow[];
  today: string;
  supplierId?: string;
  incurredOn: string;
  amount?: string;
  paymentMethod?: keyof typeof expensePaymentMethodLabels;
  deductFromClosing?: boolean;
  closingDate?: string | null;
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
      <label>
        Tratamiento en el cierre
        <select
          defaultValue={deductFromClosing ? "1" : "0"}
          name="deduct_from_closing"
          required
        >
          <option value="0">No descontar de un cierre</option>
          <option value="1">
            Sí, descontar del efectivo y del Reporte Z
          </option>
        </select>
        <small className="field-hint">
          Elige explícitamente si este gasto debe reducir un cierre diario.
        </small>
      </label>
      <label>
        Día del cierre al que se descontará
        <input
          defaultValue={closingDate ?? today}
          max={today}
          name="closing_operation_date"
          type="date"
        />
        <small className="field-hint">
          Elige la fecha del cierre relacionado. Solo se usa si seleccionas
          descontar el gasto.
        </small>
      </label>
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
  const pool = getDbPool();
  const [suppliers, expenseCounts, monthlyExpenseRows] = await Promise.all([
    pool.execute<SupplierOptionRow[]>(
      `SELECT id, legal_name
       FROM suppliers
       WHERE is_active = 1
       ORDER BY legal_name`,
    ),
    pool.execute<CountRow[]>("SELECT COUNT(*) AS total FROM expenses"),
    pool.execute<ExpenseMonthlySummaryRow[]>(
       `SELECT COUNT(*) AS total_count,
               COALESCE(SUM(amount), 0.00) AS total_amount,
               COUNT(CASE WHEN deduct_from_closing = 0 THEN 1 END) AS unassigned_count,
               COALESCE(SUM(CASE WHEN deduct_from_closing = 0 THEN amount ELSE 0.00 END), 0.00) AS unassigned_amount,
               COUNT(CASE WHEN deduct_from_closing = 1 THEN 1 END) AS assigned_count,
               COALESCE(SUM(CASE WHEN deduct_from_closing = 1 THEN amount ELSE 0.00 END), 0.00) AS assigned_amount
        FROM expenses
        WHERE status = 'paid'
          AND incurred_on BETWEEN ? AND ?`,
       [monthRange.start, monthRange.end],
    ),
  ]);
  const expenseTotal = Number(expenseCounts[0][0]?.total ?? 0);
  const monthlySummary = monthlyExpenseRows[0][0];
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
            e.supplier_id, e.amount, e.payment_method, e.status,
            e.deduct_from_closing,
            DATE_FORMAT(e.closing_operation_date, '%Y-%m-%d') AS closing_operation_date,
            c.status AS closing_status,
            s.legal_name AS supplier_name,
            a.action AS last_action,
            au.name AS last_actor_name,
            DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS last_action_at
     FROM expenses e
     INNER JOIN suppliers s ON s.id = e.supplier_id
     LEFT JOIN daily_closings c
       ON c.operation_date = e.closing_operation_date
     LEFT JOIN (
       SELECT entity_id, MAX(id) AS audit_id
       FROM audit_logs
       WHERE entity_type = 'expense'
       GROUP BY entity_id
     ) latest ON latest.entity_id = CAST(e.id AS CHAR)
     LEFT JOIN audit_logs a ON a.id = latest.audit_id
     LEFT JOIN users au ON au.id = a.actor_user_id
     ORDER BY e.incurred_on DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );
  const supplierRows = suppliers[0];
  const error = firstValue(params.error);
  const created = firstValue(params.created);
  const updated = firstValue(params.updated);
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams({ month });
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
              Distingue los gastos asignados a un cierre de los que no afectan
              ningún cierre.
            </p>
          </div>
          <p>Registra el proveedor, el importe y cómo se pagó.</p>
        </div>
        <section
          aria-label="Cómo afectan los gastos a los cierres"
          className="expense-treatment-guide"
        >
          <article className="expense-treatment-guide-item expense-guide-deducted">
            <strong>Descontado del cierre</strong>
            <p>
              Reduce el efectivo y el Reporte Z neto del cierre elegido. Ya
              aparece descontado en ese Reporte Z; no lo restes otra vez.
            </p>
          </article>
          <article className="expense-treatment-guide-item expense-guide-not-deducted">
            <strong>No descontado del cierre</strong>
            <p>
              Se registra como gasto, pero no modifica el efectivo ni el
              Reporte Z de ningún cierre.
            </p>
          </article>
        </section>
        <section
          aria-label={`Estadística mensual de gastos para ${month}`}
          className="dashboard-card expense-monthly-summary"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Control mensual</p>
              <h2>Gastos que se restan del período</h2>
            </div>
            <form
              action="/dashboard/expenses"
              className="inline-form expense-month-filter"
              method="get"
            >
              <label htmlFor="expense-summary-month">Mes del gasto</label>
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
          <div className="expense-monthly-stat-grid">
            <article className="expense-monthly-stat expense-monthly-stat-deduct">
              <h3>Monto que se resta del Reporte Z del mes</h3>
              <strong>{formatMoney(monthlySummary?.unassigned_amount)}</strong>
              <p>
                {monthlySummary?.unassigned_count ?? 0} gastos sin asignación a
                cierre, por fecha del gasto.
              </p>
            </article>
            <article className="expense-monthly-stat">
              <h3>Gastos asignados a cierres</h3>
              <strong>{formatMoney(monthlySummary?.assigned_amount)}</strong>
              <p>
                {monthlySummary?.assigned_count ?? 0} gastos. Se descuentan en
                la fecha del cierre asignado.
              </p>
            </article>
            <article className="expense-monthly-stat">
              <h3>Total de gastos pagados del mes</h3>
              <strong>{formatMoney(monthlySummary?.total_amount)}</strong>
              <p>
                {monthlySummary?.total_count ?? 0} gastos por fecha del gasto;
                anulados excluidos.
              </p>
            </article>
          </div>
          <p className="expense-treatment-note">
            El primer importe se resta del Reporte Z neto del resumen cuando
            ambos consultan el mismo mes. Los gastos asignados a cierres se
            descuentan en la fecha asignada y no se restan otra vez.
          </p>
        </section>
        {created ? (
          <p className="success-message" role="status">
            Gasto registrado.
          </p>
        ) : null}
        {updated ? (
          <p className="success-message" role="status">
            Gasto actualizado y cierre recalculado.
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
            Elige si el gasto reduce el cierre. Los importes asignados a un
            cierre ya están incluidos en su Reporte Z neto.
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
              <h2>Gastos recientes</h2>
            </div>
            {expenseRows.length > 0 ? (
              <span className="table-count">
                {expenseTotal} {expenseTotal === 1 ? "gasto" : "gastos"}
              </span>
            ) : null}
          </div>
          {expenseRows.length === 0 ? (
            <p className="empty-state">Todavía no hay gastos.</p>
          ) : (
            <div className="expense-list">
              {expenseRows.map((expense) => {
                const hasClosingDeduction =
                  expense.status === "paid" &&
                  Boolean(expense.deduct_from_closing);
                const closingApplied =
                  hasClosingDeduction &&
                  (expense.closing_status === "confirmed" ||
                    expense.closing_status === "corrected");
                const closingPending =
                  hasClosingDeduction && !closingApplied;
                let deductionLabel = "No descuenta del cierre";
                if (expense.status === "void") {
                  deductionLabel = "Anulado · no afecta el cierre";
                } else if (closingApplied) {
                  deductionLabel = "Descontado en cierre finalizado";
                } else if (
                  closingPending &&
                  expense.closing_status === "draft"
                ) {
                  deductionLabel = "Asignado a borrador · pendiente de confirmar";
                } else if (hasClosingDeduction) {
                  deductionLabel = "Asignado · cierre pendiente";
                }
                const closingDescription =
                  expense.status === "void"
                    ? "Gasto anulado"
                    : hasClosingDeduction
                      ? `${expense.closing_operation_date} · ${
                          closingApplied
                            ? "ya reflejado en el Reporte Z neto"
                            : expense.closing_status === "draft"
                              ? "reflejado en el borrador, aún no en el Reporte Z del período"
                              : "se aplicará al cerrar ese día"
                        }`
                      : "No reduce el efectivo ni el Reporte Z";

                return (
                  <article
                    className={`expense-card${expense.status === "void" ? " expense-card-void" : ""}`}
                    key={String(expense.id)}
                  >
                    <header className="expense-card-header">
                      <div className="expense-card-title">
                        <p className="eyebrow">Proveedor</p>
                        <h3>{expense.supplier_name}</h3>
                        <p>{expense.incurred_on}</p>
                      </div>
                      <div className="expense-card-amount">
                        <span>Importe</span>
                        <strong>{formatMoney(expense.amount)}</strong>
                        <span
                          className={`expense-status expense-status-${expense.status}`}
                        >
                          {expense.status === "paid" ? "Registrado" : "Anulado"}
                        </span>
                      </div>
                    </header>

                    <div
                      className={`expense-closing-indicator ${
                        expense.status === "void"
                          ? "expense-closing-void"
                          : closingApplied
                            ? "expense-closing-applied"
                            : closingPending
                              ? "expense-closing-pending"
                              : "expense-closing-none"
                      }`}
                    >
                      <strong>{deductionLabel}</strong>
                      {hasClosingDeduction ? (
                        <span>
                          Fecha del cierre asignado:{" "}
                          {expense.closing_operation_date}
                        </span>
                      ) : null}
                    </div>

                    <dl className="expense-details">
                      <div>
                        <dt>Medio de pago</dt>
                        <dd>
                          {expensePaymentMethodLabels[expense.payment_method]}
                        </dd>
                      </div>
                      <div>
                        <dt>Efecto en el cierre</dt>
                        <dd>{closingDescription}</dd>
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
                              Actualiza los datos del gasto. Si cambias el
                              descuento, se recalcularán los cierres afectados.
                            </p>
                            <ExpenseFields
                              suppliers={supplierRows}
                              today={today}
                              supplierId={String(expense.supplier_id)}
                              incurredOn={expense.incurred_on}
                              amount={expense.amount}
                              paymentMethod={expense.payment_method}
                              deductFromClosing={Boolean(
                                expense.deduct_from_closing,
                              )}
                              closingDate={expense.closing_operation_date}
                            />
                            <button type="submit">Guardar cambios</button>
                          </form>
                        </details>
                        <ExpenseVoidConfirmation
                          actionUrl={`/api/finance/expenses/${encodeURIComponent(String(expense.id))}/status`}
                        />
                      </div>
                    ) : null}
                  </article>
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
