import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { ClosingForm } from "@/app/components/closing-form";
import { ManagerNav } from "@/app/components/manager-nav";
import { requirePermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import {
  calculateClosingTotals,
  closingPaymentChannels,
  closingPaymentTypes,
  cashOutflowSlots,
  tipSlots,
  type ClosingFormDefaults,
} from "@/lib/finance/closing";
import { formatMoney } from "@/lib/finance/money";
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
  pedidos_ya_total: string;
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

interface TipRow extends RowDataPacket {
  line_number: number;
  recipient_name: string;
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
            c.reported_sales_total, c.pedidos_ya_total, c.status, c.notes,
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
    [tips],
    [legacyPayments],
    [legacyAdjustments],
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
    pool.execute<TipRow[]>(
      `SELECT line_number, recipient_name, amount
       FROM daily_closing_tips
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
  const tipsByLine = new Map(tips.map((tip) => [tip.line_number, tip]));
  const initial: ClosingFormDefaults = {
    operation_date: closing.operation_date,
    reported_sales_total: closing.reported_sales_total,
    pedidos_ya_total: closing.pedidos_ya_total,
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
    tips: Array.from({ length: tipSlots }, (_, index) => {
      const tip = tipsByLine.get(index + 1);
      return {
        recipient: tip?.recipient_name ?? "",
        amount: tip?.amount ?? "0.00",
      };
    }),
    notes: closing.notes ?? "",
  };
  const totals = calculateClosingTotals({
    reportedSalesTotal: initial.reported_sales_total,
    pedidosYaTotal: initial.pedidos_ya_total,
    channelPayments: initial.channelPayments,
    cashOutflows: initial.cashOutflows,
    tips: initial.tips,
  });
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
              Total actual — Ventas: {formatMoney(totals.salesTotal)} · Banco:{" "}
              {formatMoney(totals.bankTotal)} · Dinero:{" "}
              {formatMoney(totals.cashTotal)} · Propinas:{" "}
              {formatMoney(totals.tipsTotal)}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
