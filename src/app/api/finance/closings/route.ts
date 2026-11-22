import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import {
  ClosingDeductionExceedsCashError,
  refreshClosingExpenseDeduction,
} from "@/lib/finance/closing-expenses";
import {
  calculateClosingTotals,
  collectClosingFormFields,
} from "@/lib/finance/closing";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";
import { closingFormSchema } from "@/lib/validation/finance";

function redirectToClosings(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/dashboard/closings?${result}`),
    303,
  );
}

export async function POST(request: Request) {
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

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToClosings(request, "error=invalid");
  }

  const parsed = closingFormSchema.safeParse(
    collectClosingFormFields(formFields(formData)),
  );

  if (!parsed.success) {
    const invalidOutflows = parsed.error.issues.some(
      (issue) => issue.path[0] === "cash_outflows",
    );
    return redirectToClosings(
      request,
      invalidOutflows ? "error=outflow-invalid" : "error=invalid",
    );
  }

  if (parsed.data.action === "correct") {
    return redirectToClosings(request, "error=invalid");
  }

  const totals = calculateClosingTotals({
    pedidosYaTotal: parsed.data.pedidos_ya_total,
    cashTotal: parsed.data.cash_total,
    channelPayments: parsed.data.channel_payments,
    cashOutflows: parsed.data.cash_outflows,
    tipsTotal: parsed.data.tips_total,
  });

  if (!totals) {
    return redirectToClosings(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const confirmed = parsed.data.action === "confirm";
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO daily_closings
        (operation_date, reported_sales_total, gross_reported_sales_total,
         pedidos_ya_total, cash_total, gross_cash_total, tips_total, status, notes,
         created_by, confirmed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 1, UTC_TIMESTAMP(3), NULL),
         UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.operation_date,
        totals.reportedSalesTotal,
        totals.grossReportedSalesTotal,
        parsed.data.pedidos_ya_total,
        totals.cashTotal,
        totals.grossCashTotal,
        totals.tipsTotal,
        confirmed ? "confirmed" : "draft",
        parsed.data.notes,
        actor.id,
        confirmed ? actor.id : null,
        confirmed ? 1 : 0,
      ],
    );
    const closingId = String(result.insertId);

    for (const payment of parsed.data.channel_payments) {
      await connection.execute(
        `INSERT INTO daily_closing_channel_payments
          (daily_closing_id, payment_type, payment_channel, amount)
         VALUES (?, ?, ?, ?)`,
        [
          closingId,
          payment.payment_type,
          payment.payment_channel,
          payment.amount,
        ],
      );
    }

    for (const [index, outflow] of parsed.data.cash_outflows.entries()) {
      if (outflow.description === null) {
        continue;
      }

      await connection.execute(
        `INSERT INTO daily_closing_cash_outflows
          (daily_closing_id, line_number, description, amount)
         VALUES (?, ?, ?, ?)`,
        [closingId, index + 1, outflow.description, outflow.amount],
      );
    }

    const adjustedClosing = await refreshClosingExpenseDeduction(
      connection,
      parsed.data.operation_date,
      actor.id,
      false,
    );

    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "daily_closing",
      entityId: closingId,
      action: confirmed ? "confirmed" : "created",
      afterData: {
        operation_date: parsed.data.operation_date,
        reported_sales_total:
          adjustedClosing?.reportedSalesTotal ?? totals.reportedSalesTotal,
        gross_reported_sales_total: totals.grossReportedSalesTotal,
        pedidos_ya_total: parsed.data.pedidos_ya_total,
        cash_total: adjustedClosing?.cashTotal ?? parsed.data.cash_total,
        gross_cash_total: totals.grossCashTotal,
        cash_outflow_total: totals.cashOutflowTotal,
        expense_deduction_total: adjustedClosing?.deductionTotal ?? "0.00",
        tips_total: totals.tipsTotal,
        channel_payments: parsed.data.channel_payments,
        cash_outflows: parsed.data.cash_outflows,
        status: confirmed ? "confirmed" : "draft",
      },
    });

    await connection.commit();
    transactionStarted = false;
    return redirectToClosings(
      request,
      confirmed ? "created=confirmed" : "created=draft",
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
      return redirectToClosings(request, "error=duplicate");
    }

    if (error instanceof ClosingDeductionExceedsCashError) {
      return redirectToClosings(request, "error=deduction-exceeds-cash");
    }

    console.error(`Daily closing creation failed (${code}).`);
    return redirectToClosings(request, "error=failed");
  } finally {
    connection?.release();
  }
}
