import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { AuditLabel } from "@/app/components/audit-label";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { todayInPanama } from "@/lib/finance/dates";
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
  closing_exists: number;
  supplier_name: string;
  last_action: string | null;
  last_actor_name: string | null;
  last_action_at: string | null;
}

interface ExpensesPageProps {
  searchParams: Promise<{
    created?: string | string[];
    updated?: string | string[];
    error?: string | string[];
  }>;
}

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
        </label>
      </div>
      <label className="checkbox-label">
        <input
          name="deduct_from_closing"
          type="hidden"
          value="0"
        />
        <input
          defaultChecked={deductFromClosing}
          name="deduct_from_closing"
          type="checkbox"
          value="1"
        />
        <span>Descontar del total del cierre</span>
      </label>
      <label>
        Día del cierre al que se descontará
        <input
          defaultValue={closingDate ?? today}
          max={today}
          name="closing_operation_date"
          type="date"
        />
      </label>
      <p className="form-hint">
        Al marcar la opción, el importe se resta del efectivo y del total del
        cierre elegido, también si se pagó con tarjeta o Yappy.
      </p>
    </>
  );
}

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const today = todayInPanama();
  const pool = getDbPool();
  const [suppliers, expenses] = await Promise.all([
    pool.execute<SupplierOptionRow[]>(
      `SELECT id, legal_name
       FROM suppliers
       WHERE is_active = 1
       ORDER BY legal_name`,
    ),
    pool.execute<ExpenseRow[]>(
      `SELECT e.id,
              DATE_FORMAT(e.incurred_on, '%Y-%m-%d') AS incurred_on,
              e.supplier_id, e.amount, e.payment_method, e.status,
              e.deduct_from_closing,
              DATE_FORMAT(e.closing_operation_date, '%Y-%m-%d') AS closing_operation_date,
              (c.id IS NOT NULL) AS closing_exists,
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
       LIMIT 100`,
    ),
  ]);
  const supplierRows = suppliers[0];
  const expenseRows = expenses[0];
  const params = await searchParams;
  const error = firstValue(params.error);
  const created = firstValue(params.created);
  const updated = firstValue(params.updated);

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Gastos</h1>
          </div>
          <p>Registra el proveedor, el importe y cómo se pagó.</p>
        </div>
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

        <section className="dashboard-card">
          <h2>Registrar gasto</h2>
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

        <section className="dashboard-card">
          <h2>Gastos recientes</h2>
          {expenseRows.length === 0 ? (
            <p className="empty-state">Todavía no hay gastos.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Pago</th>
                    <th scope="col">Descuento del cierre</th>
                    <th scope="col">Auditoría</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((expense) => (
                    <tr key={String(expense.id)}>
                      <td>{expense.incurred_on}</td>
                      <td>{expense.supplier_name}</td>
                      <td>{formatMoney(expense.amount)}</td>
                      <td>
                        {expensePaymentMethodLabels[expense.payment_method]}
                      </td>
                      <td>
                        {expense.status === "void"
                          ? "Anulado; no se descuenta"
                          : expense.deduct_from_closing
                            ? `${formatMoney(expense.amount)} · ${expense.closing_operation_date}${expense.closing_exists ? "" : " (pendiente de cierre)"}`
                            : "No"}
                      </td>
                      <td>
                        <AuditLabel
                          action={expense.last_action}
                          actorName={expense.last_actor_name}
                          occurredAt={expense.last_action_at}
                        />
                      </td>
                      <td>
                        {expense.status === "paid" ? (
                          <div className="row-actions">
                            <details>
                              <summary>Editar</summary>
                              <form
                                action={`/api/finance/expenses/${encodeURIComponent(String(expense.id))}`}
                                method="post"
                                className="finance-form expense-edit-form"
                              >
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
                            <form
                              action={`/api/finance/expenses/${encodeURIComponent(String(expense.id))}/status`}
                              method="post"
                            >
                              <input name="action" type="hidden" value="void" />
                              <button className="button-secondary" type="submit">
                                Anular
                              </button>
                            </form>
                          </div>
                        ) : (
                          "Anulado"
                        )}
                      </td>
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
