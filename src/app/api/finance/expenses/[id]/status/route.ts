import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { expenseStatusSchema } from "@/lib/validation/finance";

interface ExpenseRow extends RowDataPacket {
  id: string | number;
  status: "unpaid" | "paid" | "void";
  amount: string;
  payment_method: string | null;
}

function redirectToExpenses(request: Request, result: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/expenses?${result}`, request.url),
    303,
  );
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

  if (!hasPermission(actor.role, "finance:write")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const { id } = await context.params;

  if (!/^[1-9]\d{0,19}$/.test(id)) {
    return NextResponse.json({ error: "Gasto no válido." }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToExpenses(request, "error=invalid");
  }

  const parsed = expenseStatusSchema.safeParse(formFields(formData));

  if (
    !parsed.success ||
    (parsed.data.action === "pay" && !parsed.data.payment_method) ||
    (parsed.data.action === "void" && parsed.data.payment_method)
  ) {
    return redirectToExpenses(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute<ExpenseRow[]>(
      `SELECT id, status, amount, payment_method
       FROM expenses
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const expense = rows[0];

    if (!expense) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=not-found");
    }

    if (expense.status !== "unpaid") {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=locked");
    }

    const newStatus = parsed.data.action === "pay" ? "paid" : "void";
    const paymentMethod =
      parsed.data.action === "pay" ? parsed.data.payment_method : null;
    await connection.execute(
      `UPDATE expenses
       SET status = ?, payment_method = ?,
           paid_at = IF(? = 1, UTC_TIMESTAMP(3), NULL),
           voided_at = IF(? = 1, UTC_TIMESTAMP(3), NULL),
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [
        newStatus,
        paymentMethod,
        newStatus === "paid" ? 1 : 0,
        newStatus === "void" ? 1 : 0,
        id,
      ],
    );
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "expense",
      entityId: id,
      action: newStatus === "paid" ? "paid" : "voided",
      beforeData: {
        status: expense.status,
        amount: expense.amount,
        payment_method: expense.payment_method,
      },
      afterData: {
        status: newStatus,
        amount: expense.amount,
        payment_method: paymentMethod,
      },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToExpenses(request, "updated=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Expense status rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Expense status update failed (${code}).`);
    return redirectToExpenses(request, "error=failed");
  } finally {
    connection?.release();
  }
}
