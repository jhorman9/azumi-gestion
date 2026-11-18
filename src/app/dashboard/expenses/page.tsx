import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { todayInPanama } from "@/lib/finance/dates";
import { formatMoney, paymentMethodLabels } from "@/lib/finance/money";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface CategoryRow extends RowDataPacket {
  id: string | number;
  name: string;
  is_active: number;
}

interface SupplierOptionRow extends RowDataPacket {
  id: string | number;
  legal_name: string;
}

interface ExpenseRow extends RowDataPacket {
  id: string | number;
  incurred_on: string;
  amount: string;
  description: string;
  expense_type: "fixed" | "variable";
  status: "unpaid" | "paid" | "void";
  payment_method: keyof typeof paymentMethodLabels | null;
  category_name: string;
  supplier_name: string | null;
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
    invalid: "Revisa los datos del gasto.",
    "invalid-category": "Revisa el nombre de la categoría.",
    "duplicate-category": "Ya existe una categoría con ese nombre.",
    "category-required": "Crea una categoría activa antes de registrar gastos.",
    "not-found": "No se encontró el registro.",
    locked: "El registro ya fue pagado o anulado y no puede modificarse.",
    failed: "No fue posible guardar los cambios.",
  };
  return messages[code] ?? "Ocurrió un error.";
}

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const pool = getDbPool();
  const [categories] = await pool.execute<CategoryRow[]>(
    `SELECT id, name, is_active
     FROM expense_categories
     ORDER BY is_active DESC, name`,
  );
  const [suppliers] = await pool.execute<SupplierOptionRow[]>(
    `SELECT id, legal_name
     FROM suppliers
     WHERE is_active = 1
     ORDER BY legal_name`,
  );
  const [expenses] = await pool.execute<ExpenseRow[]>(
    `SELECT e.id, DATE_FORMAT(e.incurred_on, '%Y-%m-%d') AS incurred_on,
            e.amount, e.description, e.expense_type, e.status, e.payment_method,
            c.name AS category_name, s.legal_name AS supplier_name
     FROM expenses e
     INNER JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN suppliers s ON s.id = e.supplier_id
     ORDER BY e.incurred_on DESC, e.id DESC
     LIMIT 100`,
  );
  const params = await searchParams;
  const error = firstValue(params.error);
  const created = firstValue(params.created);
  const updated = firstValue(params.updated);
  const activeCategories = categories.filter((category) =>
    Boolean(category.is_active),
  );

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Gastos</h1>
          </div>
          <p>Registra el gasto cuando se incurre; las facturas de proveedores se gestionan aparte.</p>
        </div>
        {created ? (
          <p className="success-message" role="status">
            {created === "category"
              ? "Categoría creada."
              : "Gasto registrado."}
          </p>
        ) : null}
        {updated ? (
          <p className="success-message" role="status">
            Gasto actualizado.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}

        <section className="dashboard-card">
          <h2>Categorías de gasto</h2>
          <form
            action="/api/finance/categories"
            method="post"
            className="inline-form"
          >
            <label>
              Nueva categoría
              <input maxLength={120} name="name" required />
            </label>
            <button type="submit">Agregar categoría</button>
          </form>
          {categories.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Categoría</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const active = Boolean(category.is_active);
                    return (
                      <tr key={String(category.id)}>
                        <td>{category.name}</td>
                        <td>{active ? "Activa" : "Inactiva"}</td>
                        <td>
                          <form
                            action={`/api/finance/categories/${encodeURIComponent(String(category.id))}/status`}
                            method="post"
                          >
                            <input
                              name="is_active"
                              type="hidden"
                              value={active ? "0" : "1"}
                            />
                            <button className="button-secondary" type="submit">
                              {active ? "Desactivar" : "Reactivar"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="dashboard-card">
          <h2>Registrar gasto</h2>
          {activeCategories.length === 0 ? (
            <p className="form-hint">
              Crea una categoría activa antes de registrar un gasto.
            </p>
          ) : (
            <form action="/api/finance/expenses" method="post" className="finance-form">
              <div className="form-grid">
                <label>
                  Categoría
                  <select name="category_id" required>
                    {activeCategories.map((category) => (
                      <option key={String(category.id)} value={String(category.id)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select defaultValue="variable" name="expense_type" required>
                    <option value="fixed">Fijo</option>
                    <option value="variable">Variable</option>
                  </select>
                </label>
                <label>
                  Fecha del gasto
                  <input
                    defaultValue={todayInPanama()}
                    name="incurred_on"
                    required
                    type="date"
                  />
                </label>
                <label>
                  Vencimiento (si aplica)
                  <input name="due_on" type="date" />
                </label>
                <label>
                  Importe
                  <input
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  Proveedor (opcional)
                  <select defaultValue="" name="supplier_id">
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={String(supplier.id)} value={String(supplier.id)}>
                        {supplier.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estado inicial
                  <select defaultValue="unpaid" name="status" required>
                    <option value="unpaid">Pendiente de pago</option>
                    <option value="paid">Ya pagado</option>
                  </select>
                </label>
                <label>
                  Método de pago (si ya está pagado)
                  <select defaultValue="" name="payment_method">
                    <option value="">No aplica</option>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Descripción
                <input maxLength={500} name="description" required />
              </label>
              <button type="submit">Registrar gasto</button>
            </form>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Gastos recientes</h2>
          {expenses.length === 0 ? (
            <p className="empty-state">Todavía no hay gastos.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Descripción</th>
                    <th scope="col">Categoría</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={String(expense.id)}>
                      <td>{expense.incurred_on}</td>
                      <td>{expense.description}</td>
                      <td>{expense.category_name}</td>
                      <td>{expense.supplier_name ?? "—"}</td>
                      <td>{expense.expense_type === "fixed" ? "Fijo" : "Variable"}</td>
                      <td>{formatMoney(expense.amount)}</td>
                      <td>
                        {expense.status === "paid"
                          ? `Pagado (${paymentMethodLabels[expense.payment_method ?? "other"]})`
                          : expense.status === "void"
                            ? "Anulado"
                            : "Pendiente"}
                      </td>
                      <td>
                        {expense.status === "unpaid" ? (
                          <div className="row-actions">
                            <form
                              action={`/api/finance/expenses/${encodeURIComponent(String(expense.id))}/status`}
                              method="post"
                              className="inline-form"
                            >
                              <input name="action" type="hidden" value="pay" />
                              <select aria-label="Método de pago" name="payment_method" required>
                                {Object.entries(paymentMethodLabels).map(
                                  ([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                              <button type="submit">Marcar pagado</button>
                            </form>
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
                          "—"
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
