import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { AuditLabel } from "@/app/components/audit-label";
import { ClosingForm } from "@/app/components/closing-form";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import {
  calculateClosingTotals,
  closingPaymentChannelLabels,
  closingPaymentChannels,
  closingPaymentTypeLabels,
  closingPaymentTypes,
  cashOutflowSlots,
  type ClosingFormDefaults,
} from "@/lib/finance/closing";
import {
  expensePaymentMethodLabels,
  formatMoney,
  moneyToCents,
  sumMoney,
} from "@/lib/finance/money";
import {
  adjustmentLabels,
  closingAdjustmentTypes,
  paymentMethodLabels,
  paymentMethods,
} from "@/lib/finance/money";

export const instant = false;

interface ClosingRow extends RowDataPacket {
  id: string | number;
  operation_date: string;
  reported_sales_total: string;
  gross_reported_sales_total: string;
  pedidos_ya_total: string;
  cash_total: string;
  gross_cash_total: string;
  tips_total: string;
  status: "draft" | "confirmed" | "corrected";
  notes: string | null;
  created_by_name: string;
}

interface ChannelPaymentRow extends RowDataPacket {
  payment_type: (typeof closingPaymentTypes)[number];
  payment_channel: (typeof closingPaymentChannels)[number];
  amount: string;
}

interface CashOutflowRow extends RowDataPacket {
  line_number: number;
  description: string;
  amount: string;
}

interface LegacyPaymentRow extends RowDataPacket {
  payment_method: (typeof paymentMethods)[number];
  amount: string;
}

interface LegacyAdjustmentRow extends RowDataPacket {
  adjustment_type: (typeof closingAdjustmentTypes)[number];
  amount: string;
  treatment: "included" | "excluded";
}

interface ExpenseDeductionRow extends RowDataPacket {
  id: string | number;
  incurred_on: string;
  amount: string;
  payment_method: "cash" | "card" | "yappy";
  supplier_name: string;
  last_action: string | null;
  last_actor_name: string | null;
  last_action_at: string | null;
}

interface AuditRow extends RowDataPacket {
  id: string | number;
  action: string;
  actor_name: string | null;
  created_at: string;
}

interface ClosingDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    updated?: string | string[];
    error?: string | string[];
  }>;
}

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos y completa el motivo de la corrección.",
  duplicate: "Ya existe otro cierre para esa fecha.",
  locked: "El estado del cierre cambió. Recarga la página para continuar.",
  "deduction-exceeds-cash":
    "Las salidas de caja y los gastos descontados superan el efectivo contado.",
  "outflow-exceeds-cash":
    "Las salidas de caja no pueden superar el efectivo contado.",
  "outflow-invalid":
    "Completa cada salida y verifica que su suma no supere el efectivo contado.",
  "expenses-assigned":
    "Este cierre tiene gastos asignados. Reasigna esos gastos antes de cambiar la fecha.",
  "not-found": "No se encontró el cierre.",
  failed: "No fue posible guardar los cambios.",
};

const statusLabels: Record<ClosingRow["status"], string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  corrected: "Corregido",
};

function firstValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClosingDetailPage({
  params,
  searchParams,
}: ClosingDetailPageProps) {
  await connection();
  const user = await requirePermission("closings:read");
  const { id } = await params;

  if (!/^[1-9]\d{0,19}$/.test(id)) {
    notFound();
  }

  const pool = getDbPool();
  const [closingRows] = await pool.execute<ClosingRow[]>(
    `SELECT c.id, DATE_FORMAT(c.operation_date, '%Y-%m-%d') AS operation_date,
            c.reported_sales_total, c.gross_reported_sales_total,
            c.pedidos_ya_total, c.cash_total, c.gross_cash_total,
            c.tips_total,
            c.status, c.notes,
            u.name AS created_by_name
     FROM daily_closings c
     INNER JOIN users u ON u.id = c.created_by
     WHERE c.id = ?
     LIMIT 1`,
    [id],
  );
  const closing = closingRows[0];

  if (!closing) {
    notFound();
  }

  const [
    [channelPayments],
    [cashOutflows],
    [legacyPayments],
    [legacyAdjustments],
    [expenseDeductions],
    [auditEvents],
  ] = await Promise.all([
    pool.execute<ChannelPaymentRow[]>(
      `SELECT payment_type, payment_channel, amount
       FROM daily_closing_channel_payments
       WHERE daily_closing_id = ?`,
      [id],
    ),
    pool.execute<CashOutflowRow[]>(
      `SELECT line_number, description, amount
       FROM daily_closing_cash_outflows
       WHERE daily_closing_id = ?
       ORDER BY line_number`,
      [id],
    ),
    pool.execute<LegacyPaymentRow[]>(
      `SELECT payment_method, amount
       FROM daily_closing_payments
       WHERE daily_closing_id = ?`,
      [id],
    ),
    pool.execute<LegacyAdjustmentRow[]>(
      `SELECT adjustment_type, amount, treatment
       FROM daily_closing_adjustments
       WHERE daily_closing_id = ?`,
      [id],
    ),
    pool.execute<ExpenseDeductionRow[]>(
      `SELECT e.id,
              DATE_FORMAT(e.incurred_on, '%Y-%m-%d') AS incurred_on,
              e.amount, e.payment_method, s.legal_name AS supplier_name,
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
       WHERE e.closing_operation_date = ?
         AND e.deduct_from_closing = 1
         AND e.status = 'paid'
       ORDER BY e.id`,
      [closing.operation_date],
    ),
    pool.execute<AuditRow[]>(
      `SELECT a.id, a.action, u.name AS actor_name,
              DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.entity_type = 'daily_closing' AND a.entity_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 50`,
      [id],
    ),
  ]);
  const paymentAmounts = new Map(
    channelPayments.map((payment) => [
      `${payment.payment_type}_${payment.payment_channel}`,
      payment.amount,
    ]),
  );
  const outflowsByLine = new Map(
    cashOutflows.map((outflow) => [outflow.line_number, outflow]),
  );
  const initial: ClosingFormDefaults = {
    operation_date: closing.operation_date,
    reported_sales_total: closing.gross_reported_sales_total,
    pedidos_ya_total: closing.pedidos_ya_total,
    cash_total: closing.gross_cash_total,
    tips_total: closing.tips_total,
    channelPayments: closingPaymentTypes.flatMap((paymentType) =>
      closingPaymentChannels.map((paymentChannel) => ({
        payment_type: paymentType,
        payment_channel: paymentChannel,
        amount:
          paymentAmounts.get(`${paymentType}_${paymentChannel}`) ?? "0.00",
      })),
    ),
    cashOutflows: Array.from({ length: cashOutflowSlots }, (_, index) => {
      const outflow = outflowsByLine.get(index + 1);
      return {
        description: outflow?.description ?? "",
        amount: outflow?.amount ?? "0.00",
      };
    }),
    notes: closing.notes ?? "",
  };
  const totals = calculateClosingTotals({
    pedidosYaTotal: initial.pedidos_ya_total,
    cashTotal: initial.cash_total,
    channelPayments: initial.channelPayments,
    cashOutflows: initial.cashOutflows,
    tipsTotal: initial.tips_total,
  });
  const cashOutflowTotal = sumMoney(
    cashOutflows.map((outflow) => outflow.amount),
  );
  const bankTotal = sumMoney(
    channelPayments.map((payment) => payment.amount),
  );
  const expenseDeductionTotal = sumMoney(
    expenseDeductions.map((expense) => expense.amount),
  );
  const totalCashDeductions = sumMoney([
    cashOutflowTotal,
    expenseDeductionTotal,
  ]);
  const invalidExistingDeductions =
    totals === null ||
    moneyToCents(totalCashDeductions) > moneyToCents(closing.gross_cash_total);
  const paramsValue = await searchParams;
  const error = firstValue(paramsValue.error);
  const updated = firstValue(paramsValue.updated);
  const isDraft = closing.status === "draft";
  const hasLegacyData =
    legacyPayments.length > 0 || legacyAdjustments.length > 0;

  return (
    <main className="dashboard-page">
      <ManagerNav user={user} />
      <div className="page-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Cierre diario</p>
            <h1>{closing.operation_date}</h1>
            <p>Estado: {statusLabels[closing.status]}</p>
            <p>Realizado por: {closing.created_by_name}</p>
          </div>
          <Link className="text-link" href="/dashboard/closings">
            Volver a cierres
          </Link>
        </div>
        {updated ? (
          <p className="success-message" role="status">
            {updated === "corrected"
              ? "La corrección quedó auditada."
              : updated === "confirmed"
                ? "El cierre quedó confirmado."
                : "Cambios guardados."}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {errorMessages[error] ?? "Ocurrió un error al guardar el cierre."}
          </p>
        ) : null}
        {invalidExistingDeductions ? (
          <p className="form-error" role="alert">
            Las salidas y gastos de este cierre superan el efectivo contado.
            Ajusta los importes antes de guardar una corrección.
          </p>
        ) : null}

        {hasLegacyData ? (
          <section className="dashboard-card">
            <h2>Datos conservados del formato anterior</h2>
            <p className="form-hint">
              Estos importes históricos se conservan sin convertirlos al nuevo
              desglose.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tipo de dato</th>
                    <th scope="col">Concepto</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Tratamiento POS</th>
                  </tr>
                </thead>
                <tbody>
                  {legacyPayments.map((payment) => (
                    <tr key={`payment-${payment.payment_method}`}>
                      <td>Pago anterior</td>
                      <td>{paymentMethodLabels[payment.payment_method]}</td>
                      <td>{formatMoney(payment.amount)}</td>
                      <td>—</td>
                    </tr>
                  ))}
                  {legacyAdjustments.map((adjustment) => (
                    <tr key={`adjustment-${adjustment.adjustment_type}`}>
                      <td>Ajuste anterior</td>
                      <td>{adjustmentLabels[adjustment.adjustment_type]}</td>
                      <td>{formatMoney(adjustment.amount)}</td>
                      <td>
                        {adjustment.treatment === "included"
                          ? "Ya incluido"
                          : "No incluido"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="dashboard-card">
          <h2>Detalle del cierre</h2>
          <div className="closing-totals">
            <article>
              <h3>Reporte Z original</h3>
              <p>{formatMoney(closing.gross_reported_sales_total)}</p>
            </article>
            <article>
              <h3>Efectivo contado</h3>
              <p>{formatMoney(closing.gross_cash_total)}</p>
            </article>
            <article>
              <h3>Total banco</h3>
              <p>{formatMoney(bankTotal)}</p>
            </article>
            <article>
              <h3>Pedidos Ya</h3>
              <p>{formatMoney(closing.pedidos_ya_total)}</p>
            </article>
          </div>
          <h3>Desglose de pagos bancarios</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tipo de pago</th>
                  <th scope="col">Canal</th>
                  <th scope="col">Importe</th>
                </tr>
              </thead>
              <tbody>
                {closingPaymentTypes.flatMap((paymentType) =>
                  closingPaymentChannels.map((paymentChannel) => (
                    <tr key={`${paymentType}-${paymentChannel}`}>
                      <td>{closingPaymentTypeLabels[paymentType]}</td>
                      <td>
                        {closingPaymentChannelLabels[paymentChannel]}
                      </td>
                      <td>
                        {formatMoney(
                          paymentAmounts.get(
                            `${paymentType}_${paymentChannel}`,
                          ) ?? "0.00",
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <h3>Notas del cierre</h3>
          <p className="closing-detail-notes">
            {closing.notes?.trim() || "Sin notas registradas."}
          </p>
        </section>

        <section className="dashboard-card">
          <h2>Salidas y gastos descontados</h2>
          <p className="form-hint">
            Las salidas de caja y los gastos asignados se restan del efectivo y
            del Reporte Z. Los valores originales quedan conservados para
            auditoría y recálculo.
          </p>
          <div className="closing-totals">
            <article>
              <h3>Salidas de caja</h3>
              <p>{formatMoney(cashOutflowTotal)}</p>
              <span>{cashOutflows.length} salida(s) registrada(s)</span>
            </article>
            <article>
              <h3>Gastos descontados</h3>
              <p>{formatMoney(expenseDeductionTotal)}</p>
              <span>{expenseDeductions.length} gasto(s) asignado(s)</span>
            </article>
            <article>
              <h3>Efectivo neto</h3>
              <p>{formatMoney(closing.cash_total)}</p>
              <span>
                {formatMoney(closing.gross_cash_total)} menos salidas y gastos
              </span>
            </article>
            <article>
              <h3>Total neto del cierre</h3>
              <p>{formatMoney(closing.reported_sales_total)}</p>
              <span>
                {formatMoney(closing.gross_reported_sales_total)} menos salidas
                y gastos
              </span>
            </article>
            <article>
              <h3>Propina del día</h3>
              <p>{formatMoney(closing.tips_total)}</p>
              <span>Seguimiento separado del Reporte Z</span>
            </article>
          </div>
          <h3>Detalle de salidas de caja</h3>
          {cashOutflows.length === 0 ? (
            <p className="empty-state">No hay salidas de caja registradas.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">N.º</th>
                    <th scope="col">Descripción</th>
                    <th scope="col">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {cashOutflows.map((outflow) => (
                    <tr key={outflow.line_number}>
                      <td>{outflow.line_number}</td>
                      <td>{outflow.description}</td>
                      <td>{formatMoney(outflow.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {expenseDeductions.length === 0 ? (
            <p className="empty-state">
              No hay gastos asignados a la fecha de este cierre.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Método de pago</th>
                    <th scope="col">Último cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseDeductions.map((expense) => (
                    <tr key={String(expense.id)}>
                      <td>{expense.incurred_on}</td>
                      <td>{expense.supplier_name}</td>
                      <td>{formatMoney(expense.amount)}</td>
                      <td>
                        {expensePaymentMethodLabels[expense.payment_method]}
                      </td>
                      <td>
                        <AuditLabel
                          action={expense.last_action}
                          actorName={expense.last_actor_name}
                          occurredAt={expense.last_action_at}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-card">
          <h2>{isDraft ? "Editar borrador" : "Corregir cierre confirmado"}</h2>
          {!isDraft ? (
            <p className="form-hint">
              Los cambios a un cierre confirmado se guardan como corrección y
              quedan registrados en la auditoría.
            </p>
          ) : null}
          <ClosingForm
            actionUrl={`/api/finance/closings/${encodeURIComponent(id)}`}
            initial={initial}
            isDraft={isDraft}
            showCorrectionReason={!isDraft}
          />
          {totals ? (
            <p className="account-info">
              Total actual — Ventas / Reporte Z:{" "}
              {formatMoney(totals.reportedSalesTotal)} · Banco:{" "}
              {formatMoney(totals.bankTotal)} · Dinero:{" "}
              {formatMoney(totals.cashTotal)} · Propinas:{" "}
              {formatMoney(totals.tipsTotal)}
            </p>
          ) : null}
        </section>

        <section className="dashboard-card">
          <h2>Historial de cambios del cierre</h2>
          {auditEvents.length === 0 ? (
            <p className="empty-state">No hay cambios auditados.</p>
          ) : (
            <ul className="audit-timeline">
              {auditEvents.map((event) => (
                <li key={String(event.id)}>
                  <AuditLabel
                    action={event.action}
                    actorName={event.actor_name}
                    occurredAt={event.created_at}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
