import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { ManagerNav } from "@/app/components/manager-nav";
import { getDbPool } from "@/lib/db";
import { todayInPanama } from "@/lib/finance/dates";
import { formatMoney, paymentMethodLabels } from "@/lib/finance/money";
import { moneyToCents } from "@/lib/finance/money";
import { requirePermission } from "@/lib/auth/roles";

export const instant = false;

interface SupplierRow extends RowDataPacket {
  id: string | number;
  legal_name: string;
}

interface BillRow extends RowDataPacket {
  id: string | number;
  supplier_id: string | number;
  supplier_name: string;
  invoice_reference: string | null;
  issue_date: string;
  due_date: string | null;
  amount: string;
  paid_total: string;
  balance: string;
  status: "open" | "void";
}

interface PaymentRow extends RowDataPacket {
  paid_at_utc: string;
  supplier_name: string;
  invoice_reference: string | null;
  amount: string;
  payment_method: keyof typeof paymentMethodLabels;
  reference: string | null;
}

interface BillsPageProps {
  searchParams: Promise<{
    created?: string | string[];
    payment?: string | string[];
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
    invalid: "Revisa los datos de la factura.",
    "invalid-payment": "Revisa los datos del pago.",
    "supplier-required": "Selecciona un proveedor activo.",
    duplicate: "Ya existe esa referencia de factura para el proveedor.",
    "not-found": "No se encontró la factura.",
    locked: "La factura está anulada y no acepta pagos.",
    overpayment: "El pago supera el saldo pendiente.",
    "has-payments": "No se puede anular una factura que ya tiene pagos.",
    failed: "No fue posible guardar los cambios.",
  };
  return messages[code] ?? "Ocurrió un error.";
}

export default async function BillsPage({ searchParams }: BillsPageProps) {
  await connection();
  const user = await requirePermission("finance:read");
  const pool = getDbPool();
  const [suppliers] = await pool.execute<SupplierRow[]>(
    `SELECT id, legal_name
     FROM suppliers
     WHERE is_active = 1
     ORDER BY legal_name`,
  );
  const [bills] = await pool.execute<BillRow[]>(
    `SELECT b.id, b.supplier_id, s.legal_name AS supplier_name,
            b.invoice_reference,
            DATE_FORMAT(b.issue_date, '%Y-%m-%d') AS issue_date,
            DATE_FORMAT(b.due_date, '%Y-%m-%d') AS due_date,
            b.amount, COALESCE(p.paid_total, 0.00) AS paid_total,
            b.amount - COALESCE(p.paid_total, 0.00) AS balance, b.status
     FROM purchase_bills b
     INNER JOIN suppliers s ON s.id = b.supplier_id
     LEFT JOIN (
       SELECT purchase_bill_id, SUM(amount) AS paid_total
       FROM bill_payments
       GROUP BY purchase_bill_id
     ) p ON p.purchase_bill_id = b.id
     ORDER BY b.issue_date DESC, b.id DESC
     LIMIT 150`,
  );
  const [payments] = await pool.execute<PaymentRow[]>(
    `SELECT DATE_FORMAT(bp.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at_utc,
            s.legal_name AS supplier_name, b.invoice_reference,
            bp.amount, bp.payment_method, bp.reference
     FROM bill_payments bp
     INNER JOIN purchase_bills b ON b.id = bp.purchase_bill_id
     INNER JOIN suppliers s ON s.id = b.supplier_id
     ORDER BY bp.paid_at DESC, bp.id DESC
     LIMIT 50`,
  );
  const params = await searchParams;
  const error = firstValue(params.error);
  const today = todayInPanama();

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Finanzas</p>
            <h1>Cuentas por pagar</h1>
          </div>
          <p>La factura registra una obligación; sus pagos reducen el saldo y no duplican gastos.</p>
        </div>
        {params.created ? (
          <p className="success-message" role="status">
            Factura registrada.
          </p>
        ) : null}
        {params.payment ? (
          <p className="success-message" role="status">
            Pago aplicado a la factura.
          </p>
        ) : null}
        {params.updated ? (
          <p className="success-message" role="status">
            Factura actualizada.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}

        <section className="dashboard-card">
          <h2>Registrar factura de proveedor</h2>
          {suppliers.length === 0 ? (
            <p className="form-hint">
              Primero agrega un proveedor activo en{" "}
              <a href="/dashboard/suppliers">Proveedores</a>.
            </p>
          ) : (
            <form action="/api/finance/bills" method="post" className="finance-form">
              <div className="form-grid">
                <label>
                  Proveedor
                  <select name="supplier_id" required>
                    {suppliers.map((supplier) => (
                      <option key={String(supplier.id)} value={String(supplier.id)}>
                        {supplier.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Referencia de factura (opcional)
                  <input maxLength={100} name="invoice_reference" />
                </label>
                <label>
                  Fecha de emisión
                  <input
                    defaultValue={today}
                    name="issue_date"
                    required
                    type="date"
                  />
                </label>
                <label>
                  Fecha de vencimiento
                  <input name="due_date" type="date" />
                </label>
                <label>
                  Importe total
                  <input
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>
              <label>
                Notas
                <textarea maxLength={2000} name="notes" rows={2} />
              </label>
              <button type="submit">Registrar factura</button>
            </form>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Facturas</h2>
          {bills.length === 0 ? (
            <p className="empty-state">Todavía no hay facturas.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Referencia</th>
                    <th scope="col">Emisión</th>
                    <th scope="col">Vencimiento</th>
                    <th scope="col">Total</th>
                    <th scope="col">Pagado</th>
                    <th scope="col">Saldo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Registrar pago</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => {
                    const balanceCents = moneyToCents(bill.balance);
                    const isOverdue =
                      bill.status === "open" &&
                      balanceCents > BigInt(0) &&
                      Boolean(bill.due_date && bill.due_date < today);
                    const label =
                      bill.status === "void"
                        ? "Anulada"
                        : balanceCents === BigInt(0)
                          ? "Pagada"
                          : isOverdue
                            ? "Vencida"
                            : moneyToCents(bill.paid_total) > BigInt(0)
                              ? "Pago parcial"
                              : "Pendiente";

                    return (
                      <tr key={String(bill.id)}>
                        <td>{bill.supplier_name}</td>
                        <td>{bill.invoice_reference ?? "—"}</td>
                        <td>{bill.issue_date}</td>
                        <td>{bill.due_date ?? "—"}</td>
                        <td>{formatMoney(bill.amount)}</td>
                        <td>{formatMoney(bill.paid_total)}</td>
                        <td>{formatMoney(bill.balance)}</td>
                        <td>{label}</td>
                        <td>
                          {bill.status === "open" && balanceCents > BigInt(0) ? (
                            <div className="row-actions">
                              <form
                                action={`/api/finance/bills/${encodeURIComponent(String(bill.id))}/payments`}
                                method="post"
                                className="inline-form"
                              >
                                <input
                                  aria-label="Importe del pago"
                                  max={bill.balance}
                                  min="0.01"
                                  name="amount"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                                <select
                                  aria-label="Método de pago"
                                  name="payment_method"
                                  required
                                >
                                  {Object.entries(paymentMethodLabels).map(
                                    ([value, text]) => (
                                      <option key={value} value={value}>
                                        {text}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <input
                                  aria-label="Referencia del pago (opcional)"
                                  maxLength={120}
                                  name="reference"
                                  placeholder="Referencia"
                                />
                                <button type="submit">Registrar pago</button>
                              </form>
                              {moneyToCents(bill.paid_total) === BigInt(0) ? (
                                <form
                                  action={`/api/finance/bills/${encodeURIComponent(String(bill.id))}/status`}
                                  method="post"
                                >
                                  <input name="action" type="hidden" value="void" />
                                  <button className="button-secondary" type="submit">
                                    Anular factura
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h2>Pagos recientes</h2>
          {payments.length === 0 ? (
            <p className="empty-state">Todavía no hay pagos registrados.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha y hora (UTC)</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Factura</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Método</th>
                    <th scope="col">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => (
                    <tr key={`${payment.paid_at_utc}-${index}`}>
                      <td>{payment.paid_at_utc}</td>
                      <td>{payment.supplier_name}</td>
                      <td>{payment.invoice_reference ?? "—"}</td>
                      <td>{formatMoney(payment.amount)}</td>
                      <td>{paymentMethodLabels[payment.payment_method]}</td>
                      <td>{payment.reference ?? "—"}</td>
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
