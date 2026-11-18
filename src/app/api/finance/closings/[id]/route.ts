import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { collectClosingFormFields } from "@/lib/finance/closing";
import { formFields } from "@/lib/finance/form";
import {
  closingAdjustmentTypes,
  paymentMethods,
} from "@/lib/finance/money";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { closingFormSchema } from "@/lib/validation/finance";

interface ClosingRow extends RowDataPacket {
  id: string | number;
  operation_date: string;
  reported_sales_total: string;
  pedidos_ya_total: string;
  status: "draft" | "confirmed" | "corrected";
  notes: string | null;
  confirmed_by: string | number | null;
  confirmed_at: string | null;
}

interface PaymentRow extends RowDataPacket {
  payment_method: (typeof paymentMethods)[number];
  amount: string;
}

interface AdjustmentRow extends RowDataPacket {
  adjustment_type: (typeof closingAdjustmentTypes)[number];
  amount: string;
  treatment: "included" | "excluded";
}

interface ChannelPaymentRow extends RowDataPacket {
  payment_type: "credit_card" | "clave";
  payment_channel: "pos" | "bac" | "banesco" | "yappy" | "ach";
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

function redirectToClosing(request: Request, id: string, result: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/closings/${encodeURIComponent(id)}?${result}`, request.url),
    303,
  );
}

function validId(id: string): boolean {
  return /^[1-9]\d{0,19}$/.test(id);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  }

  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!hasPermission(actor.role, "closings:write")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const { id } = await context.params;

  if (!validId(id)) {
    return NextResponse.json({ error: "Cierre no válido." }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToClosing(request, id, "error=invalid");
  }

  const parsed = closingFormSchema.safeParse(
    collectClosingFormFields(formFields(formData)),
  );

  if (!parsed.success) {
    return redirectToClosing(request, id, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [closingRows] = await connection.execute<ClosingRow[]>(
      `SELECT id, DATE_FORMAT(operation_date, '%Y-%m-%d') AS operation_date,
              reported_sales_total, pedidos_ya_total, status, notes, confirmed_by,
              DATE_FORMAT(confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmed_at
       FROM daily_closings
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const closing = closingRows[0];

    if (!closing) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToClosing(request, id, "error=not-found");
    }

    const isCorrection = parsed.data.action === "correct";

    if (
      (isCorrection && closing.status === "draft") ||
      (!isCorrection && closing.status !== "draft")
    ) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToClosing(request, id, "error=locked");
    }

    const [oldPayments] = await connection.execute<PaymentRow[]>(
      `SELECT payment_method, amount
       FROM daily_closing_payments
       WHERE daily_closing_id = ?`,
      [id],
    );
    const [oldAdjustments] = await connection.execute<AdjustmentRow[]>(
      `SELECT adjustment_type, amount, treatment
       FROM daily_closing_adjustments
       WHERE daily_closing_id = ?`,
      [id],
    );
    const [oldChannelPayments] =
      await connection.execute<ChannelPaymentRow[]>(
        `SELECT payment_type, payment_channel, amount
         FROM daily_closing_channel_payments
         WHERE daily_closing_id = ?`,
        [id],
      );
    const [oldCashOutflows] = await connection.execute<CashOutflowRow[]>(
      `SELECT line_number, description, amount
       FROM daily_closing_cash_outflows
       WHERE daily_closing_id = ?
       ORDER BY line_number`,
      [id],
    );
    const [oldTips] = await connection.execute<TipRow[]>(
      `SELECT line_number, recipient_name, amount
       FROM daily_closing_tips
       WHERE daily_closing_id = ?
       ORDER BY line_number`,
      [id],
    );
    const beforeData = {
      operation_date: closing.operation_date,
      reported_sales_total: closing.reported_sales_total,
      pedidos_ya_total: closing.pedidos_ya_total,
      status: closing.status,
      notes: closing.notes,
      confirmed_by: closing.confirmed_by,
      confirmed_at: closing.confirmed_at,
      legacy_payments: oldPayments,
      legacy_adjustments: oldAdjustments,
      channel_payments: oldChannelPayments,
      cash_outflows: oldCashOutflows,
      tips: oldTips,
    };

    const newStatus = isCorrection
      ? "corrected"
      : parsed.data.action === "confirm"
        ? "confirmed"
        : "draft";
    await connection.execute(
      `UPDATE daily_closings
       SET operation_date = ?, reported_sales_total = ?, pedidos_ya_total = ?,
           status = ?, notes = ?,
           confirmed_by = IF(? = 1, NULL, ?),
           confirmed_at = IF(? = 1, NULL, UTC_TIMESTAMP(3)),
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [
        parsed.data.operation_date,
        parsed.data.reported_sales_total,
        parsed.data.pedidos_ya_total,
        newStatus,
        parsed.data.notes,
        newStatus === "draft" ? 1 : 0,
        actor.id,
        newStatus === "draft" ? 1 : 0,
        id,
      ],
    );

    await connection.execute(
      "DELETE FROM daily_closing_channel_payments WHERE daily_closing_id = ?",
      [id],
    );
    for (const payment of parsed.data.channel_payments) {
      await connection.execute(
        `INSERT INTO daily_closing_channel_payments
          (daily_closing_id, payment_type, payment_channel, amount)
         VALUES (?, ?, ?, ?)`,
        [
          id,
          payment.payment_type,
          payment.payment_channel,
          payment.amount,
        ],
      );
    }

    await connection.execute(
      "DELETE FROM daily_closing_cash_outflows WHERE daily_closing_id = ?",
      [id],
    );
    for (const [index, outflow] of parsed.data.cash_outflows.entries()) {
      if (outflow.description === null) {
        continue;
      }

      await connection.execute(
        `INSERT INTO daily_closing_cash_outflows
          (daily_closing_id, line_number, description, amount)
         VALUES (?, ?, ?, ?)`,
        [id, index + 1, outflow.description, outflow.amount],
      );
    }

    await connection.execute(
      "DELETE FROM daily_closing_tips WHERE daily_closing_id = ?",
      [id],
    );
    for (const [index, tip] of parsed.data.tips.entries()) {
      if (tip.recipient === null) {
        continue;
      }

      await connection.execute(
        `INSERT INTO daily_closing_tips
          (daily_closing_id, line_number, recipient_name, amount)
         VALUES (?, ?, ?, ?)`,
        [id, index + 1, tip.recipient, tip.amount],
      );
    }

    const [newChannelPayments] =
      await connection.execute<ChannelPaymentRow[]>(
        `SELECT payment_type, payment_channel, amount
         FROM daily_closing_channel_payments
         WHERE daily_closing_id = ?`,
        [id],
      );
    const [newCashOutflows] = await connection.execute<CashOutflowRow[]>(
      `SELECT line_number, description, amount
       FROM daily_closing_cash_outflows
       WHERE daily_closing_id = ?
       ORDER BY line_number`,
      [id],
    );
    const [newTips] = await connection.execute<TipRow[]>(
      `SELECT line_number, recipient_name, amount
       FROM daily_closing_tips
       WHERE daily_closing_id = ?
       ORDER BY line_number`,
      [id],
    );
    const afterData = {
      operation_date: parsed.data.operation_date,
      reported_sales_total: parsed.data.reported_sales_total,
      pedidos_ya_total: parsed.data.pedidos_ya_total,
      status: newStatus,
      notes: parsed.data.notes,
      confirmed_by: newStatus === "draft" ? null : actor.id,
      channel_payments: newChannelPayments,
      cash_outflows: newCashOutflows,
      tips: newTips,
      legacy_payments: oldPayments,
      legacy_adjustments: oldAdjustments,
      ...(isCorrection
        ? { correction_reason: parsed.data.correction_reason }
        : {}),
    };

    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "daily_closing",
      entityId: id,
      action: isCorrection
        ? "corrected"
        : parsed.data.action === "confirm"
          ? "confirmed"
          : "updated",
      beforeData,
      afterData,
    });

    await connection.commit();
    transactionStarted = false;
    return redirectToClosing(
      request,
      id,
      isCorrection
        ? "updated=corrected"
        : parsed.data.action === "confirm"
          ? "updated=confirmed"
          : "updated=draft",
    );
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Daily closing rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";

    if (code === "ER_DUP_ENTRY") {
      return redirectToClosing(request, id, "error=duplicate");
    }

    console.error(`Daily closing update failed (${code}).`);
    return redirectToClosing(request, id, "error=failed");
  } finally {
    connection?.release();
  }
}
