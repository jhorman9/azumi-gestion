import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import {
  ClosingDeductionExceedsCashError,
  refreshClosingExpenseDeduction,
} from "@/lib/finance/closing-expenses";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";
import { expenseSchema } from "@/lib/validation/finance";

interface ActiveRow extends RowDataPacket {
  id: string | number;
}

function redirectToExpenses(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/dashboard/expenses?${result}`),
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

  if (!hasPermission(actor.role, "finance:write")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToExpenses(request, "error=invalid");
  }

  const parsed = expenseSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToExpenses(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [suppliers] = await connection.execute<ActiveRow[]>(
      `SELECT id
       FROM suppliers
       WHERE id = ? AND is_active = 1
       FOR UPDATE`,
      [parsed.data.supplier_id],
    );

    if (!suppliers[0]) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=invalid");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO expenses
        (supplier_id, incurred_on, amount, payment_method, deduct_from_closing,
         closing_operation_date, status, paid_at, voided_at, created_by,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'paid', UTC_TIMESTAMP(3), NULL, ?,
         UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.supplier_id,
        parsed.data.incurred_on,
        parsed.data.amount,
        parsed.data.payment_method,
        parsed.data.deduct_from_closing ? 1 : 0,
        parsed.data.deduct_from_closing
          ? parsed.data.closing_operation_date
          : null,
        actor.id,
      ],
    );
    const expenseId = String(result.insertId);

    if (
      parsed.data.deduct_from_closing &&
      parsed.data.closing_operation_date
    ) {
      await refreshClosingExpenseDeduction(
        connection,
        parsed.data.closing_operation_date,
        actor.id,
      );
    }

    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "expense",
      entityId: expenseId,
      action: "created",
      afterData: {
        ...parsed.data,
        closing_operation_date: parsed.data.deduct_from_closing
          ? parsed.data.closing_operation_date
          : null,
      },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToExpenses(request, "created=expense");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Expense rollback failed.");
      }
    }

    if (error instanceof ClosingDeductionExceedsCashError) {
      return redirectToExpenses(request, "error=deduction-exceeds-cash");
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Expense creation failed (${code}).`);
    return redirectToExpenses(request, "error=failed");
  } finally {
    connection?.release();
  }
}
