import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { BillVoidConfirmation } from "@/app/components/bill-void-confirmation";
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

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface BillsPageProps {
  searchParams: Promise<{
    billPage?: string | string[];
    created?: string | string[];
    payment?: string | string[];
    paymentPage?: string | string[];
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
  const params = await searchParams;
  const pool = getDbPool();
  const [suppliers, billCounts, paymentCounts] = await Promise.all([
    pool.execute<SupplierRow[]>(
      `SELECT id, legal_name
       FROM suppliers
       WHERE is_active = 1
       ORDER BY legal_name`,
    ),
    pool.execute<CountRow[]>("SELECT COUNT(*) AS total FROM purchase_bills"),
    pool.execute<CountRow[]>("SELECT COUNT(*) AS total FROM bill_payments"),
  ]);
  const billTotal = Number(billCounts[0][0]?.total ?? 0);
  const paymentTotal = Number(paymentCounts[0][0]?.total ?? 0);
  const supplierRows = suppliers[0];
  const billPageCount = Math.max(1, Math.ceil(billTotal / pageSize));
  const paymentPageCount = Math.max(1, Math.ceil(paymentTotal / pageSize));
  const requestedBillPage = Number(firstValue(params.billPage) ?? "1");
  const requestedPaymentPage = Number(firstValue(params.paymentPage) ?? "1");
  const billPage =
    Number.isSafeInteger(requestedBillPage) && requestedBillPage > 0
      ? Math.min(requestedBillPage, billPageCount)
      : 1;
  const paymentPage =
    Number.isSafeInteger(requestedPaymentPage) && requestedPaymentPage > 0
      ? Math.min(requestedPaymentPage, paymentPageCount)
      : 1;
  const billOffset = (billPage - 1) * pageSize;
  const paymentOffset = (paymentPage - 1) * pageSize;
  const [billRows, paymentRows] = await Promise.all([
    pool.execute<BillRow[]>(
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
       LIMIT ? OFFSET ?`,
      [pageSize, billOffset],
    ),
    pool.execute<PaymentRow[]>(
      `SELECT DATE_FORMAT(bp.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at_utc,
              s.legal_name AS supplier_name, b.invoice_reference,
              bp.amount, bp.payment_method, bp.reference
       FROM bill_payments bp
       INNER JOIN purchase_bills b ON b.id = bp.purchase_bill_id
       INNER JOIN suppliers s ON s.id = b.supplier_id
       ORDER BY bp.paid_at DESC, bp.id DESC
       LIMIT ? OFFSET ?`,
      [pageSize, paymentOffset],
    ),
  ]);
  const bills = billRows[0];
  const payments = paymentRows[0];
  const error = firstValue(params.error);
  const today = todayInPanama();
  const pageHref = (nextBillPage: number, nextPaymentPage: number) => {
    const query = new URLSearchParams({
      billPage: String(nextBillPage),
      paymentPage: String(nextPaymentPage),
    });
    return `/dashboard/bills?${query.toString()}`;
  };

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
            Factura anulada.
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nueva obligación</p>
              <h2>Registrar factura de proveedor</h2>
            </div>
          </div>
          <p className="form-hint">
            Ingresa los datos tal como aparecen en la factura. Después podrás
            registrar uno o varios pagos y consultar el saldo pendiente.
          </p>
          {supplierRows.length === 0 ? (
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
                    {supplierRows.map((supplier) => (
                      <option key={String(supplier.id)} value={String(supplier.id)}>
                        {supplier.legal_name}
                      </option>
                    ))}
                  </select>
                  <small className="field-hint">
                    Elige el proveedor que emitió la factura.
                  </small>
                </label>
                <label>
                  N.º o referencia de factura (opcional)
                  <input
                    maxLength={100}
                    name="invoice_reference"
                    placeholder="Ej.: FAC-00125"
                  />
                  <small className="field-hint">
                    Escribe el número impreso en el documento del proveedor.
                  </small>
                </label>
                <label>
                  Fecha de emisión
                  <input
                    defaultValue={today}
                    name="issue_date"
                    required
                    type="date"
                  />
                  <small className="field-hint">
                    Fecha en que el proveedor emitió la factura.
                  </small>
                </label>
                <label>
                  Fecha límite de pago (opcional)
                  <input name="due_date" type="date" />
                  <small className="field-hint">
                    Fecha de vencimiento indicada en la factura.
                  </small>
                </label>
                <label>
                  Importe total de la factura
                  <input
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                  <small className="field-hint">
                    Ingresa el total que debes pagar, no el saldo de un pago
                    parcial.
                  </small>
                </label>
              </div>
              <label>
                Notas adicionales (opcional)
                <textarea
                  maxLength={2000}
                  name="notes"
                  placeholder="Detalle útil para identificar esta obligación"
                  rows={2}
                />
              </label>
              <div className="form-actions">
                <button type="submit">Guardar factura por pagar</button>
              </div>
            </form>
          )}
        </section>

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Obligaciones</p>
              <h2>Facturas registradas</h2>
            </div>
            <span className="table-count">
              {billTotal} {billTotal === 1 ? "factura" : "facturas"}
            </span>
          </div>
          {bills.length === 0 ? (
            <p className="empty-state">Todavía no hay facturas.</p>
          ) : (
            <div className="bill-list">
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
                    const statusClass =
                      bill.status === "void"
                        ? "void"
                        : balanceCents === BigInt(0)
                          ? "paid"
                          : isOverdue
                            ? "overdue"
                            : moneyToCents(bill.paid_total) > BigInt(0)
                              ? "partial"
                              : "pending";

                    return (
                      <article className="bill-card" key={String(bill.id)}>
                        <div className="bill-card-header">
                          <div>
                            <p className="eyebrow">Proveedor</p>
                            <h3>{bill.supplier_name}</h3>
                            <p className="bill-reference">
                              Factura: {bill.invoice_reference ?? "Sin referencia"}
                            </p>
                          </div>
                          <span className={`bill-status bill-status-${statusClass}`}>
                            {label}
                          </span>
                        </div>
                        <div className="bill-summary-grid">
                          <div>
                            <span>Emisión</span>
                            <strong>{bill.issue_date}</strong>
                          </div>
                          <div>
                            <span>Vencimiento</span>
                            <strong>{bill.due_date ?? "No indicado"}</strong>
                          </div>
                          <div>
                            <span>Total de factura</span>
                            <strong>{formatMoney(bill.amount)}</strong>
                          </div>
                          <div>
                            <span>Pagado</span>
                            <strong>{formatMoney(bill.paid_total)}</strong>
                          </div>
                          <div className="bill-balance">
                            <span>Saldo pendiente</span>
                            <strong>{formatMoney(bill.balance)}</strong>
                          </div>
                        </div>
                        {bill.status === "open" &&
                        balanceCents > BigInt(0) ? (
                          <div className="bill-payment-panel">
                            <div>
                              <h4>Registrar un pago</h4>
                              <p>
                                Indica cuánto pagaste, cómo lo pagaste y agrega
                                una referencia si tienes comprobante.
                              </p>
                            </div>
                            <form
                              action={`/api/finance/bills/${encodeURIComponent(String(bill.id))}/payments`}
                              className="bill-payment-form"
                              method="post"
                            >
                              <label>
                                Importe de este pago
                                <input
                                  aria-describedby={`bill-payment-amount-${bill.id}`}
                                  max={bill.balance}
                                  min="0.01"
                                  name="amount"
                                  placeholder="0.00"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                                <small
                                  className="field-hint"
                                  id={`bill-payment-amount-${bill.id}`}
                                >
                                  Máximo disponible: {formatMoney(bill.balance)}.
                                </small>
                              </label>
                              <label>
                                Método de pago
                                <select name="payment_method" required>
                                  {Object.entries(paymentMethodLabels).map(
                                    ([value, text]) => (
                                      <option key={value} value={value}>
                                        {text}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <small className="field-hint">
                                  Selecciona cómo se realizó el pago.
                                </small>
                              </label>
                              <label>
                                Referencia o comprobante (opcional)
                                <input
                                  maxLength={120}
                                  name="reference"
                                  placeholder="N.º de transferencia o recibo"
                                />
                                <small className="field-hint">
                                  Déjalo vacío si no tienes un número de
                                  referencia.
                                </small>
                              </label>
                              <div className="bill-payment-actions">
                                <button type="submit">Registrar pago</button>
                              </div>
                            </form>
                          </div>
                        ) : null}
                        {bill.status === "open" ? (
                          <div className="bill-management-actions">
                            {moneyToCents(bill.paid_total) === BigInt(0) ? (
                              <BillVoidConfirmation
                                actionUrl={`/api/finance/bills/${encodeURIComponent(String(bill.id))}/status`}
                                billId={String(bill.id)}
                              />
                            ) : (
                              <span className="bill-void-note">
                                No se puede anular: la factura ya tiene pagos
                                registrados.
                              </span>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
            </div>
          )}
          {billTotal > 0 ? (
            <nav aria-label="Paginación de facturas" className="reports-pagination">
              <span>
                {billOffset + 1}–{Math.min(billOffset + pageSize, billTotal)} de{" "}
                {billTotal} facturas
              </span>
              <div>
                {billPage > 1 ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(billPage - 1, paymentPage)}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span aria-disabled="true" className="reports-pagination-disabled">
                    Anterior
                  </span>
                )}
                <span>
                  Página {billPage} de {billPageCount}
                </span>
                {billPage < billPageCount ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(billPage + 1, paymentPage)}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span aria-disabled="true" className="reports-pagination-disabled">
                    Siguiente
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </section>

        <section className="dashboard-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Movimientos</p>
              <h2>Pagos recientes</h2>
            </div>
            <span className="table-count">
              {paymentTotal} {paymentTotal === 1 ? "pago" : "pagos"}
            </span>
          </div>
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
          {paymentTotal > 0 ? (
            <nav aria-label="Paginación de pagos" className="reports-pagination">
              <span>
                {paymentOffset + 1}–
                {Math.min(paymentOffset + pageSize, paymentTotal)} de{" "}
                {paymentTotal} pagos
              </span>
              <div>
                {paymentPage > 1 ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(billPage, paymentPage - 1)}
                  >
                    Anterior
                  </Link>
                ) : (
                  <span aria-disabled="true" className="reports-pagination-disabled">
                    Anterior
                  </span>
                )}
                <span>
                  Página {paymentPage} de {paymentPageCount}
                </span>
                {paymentPage < paymentPageCount ? (
                  <Link
                    className="button-secondary text-link"
                    href={pageHref(billPage, paymentPage + 1)}
                  >
                    Siguiente
                  </Link>
                ) : (
                  <span aria-disabled="true" className="reports-pagination-disabled">
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
