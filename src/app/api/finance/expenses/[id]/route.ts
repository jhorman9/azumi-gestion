import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";
import { expenseSchema } from "@/lib/validation/finance";

interface ExpenseRow extends RowDataPacket {
  id: string | number;
  supplier_id: string | number;
  incurred_on: string;
  amount: string;
  payment_method: "cash" | "card" | "yappy";
  status: "paid" | "void";
}

interface SupplierRow extends RowDataPacket {
  id: string | number;
}

function redirectToExpenses(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/dashboard/expenses?${result}`),
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

    const [expenseRows] = await connection.execute<ExpenseRow[]>(
      `SELECT id, supplier_id, DATE_FORMAT(incurred_on, '%Y-%m-%d') AS incurred_on,
              amount, payment_method, status
       FROM expenses
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const expense = expenseRows[0];

    if (!expense) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=not-found");
    }

    if (expense.status !== "paid") {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=locked");
    }

    const [suppliers] = await connection.execute<SupplierRow[]>(
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

    await connection.execute(
      `UPDATE expenses
       SET supplier_id = ?, incurred_on = ?, amount = ?, payment_method = ?,
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [
        parsed.data.supplier_id,
        parsed.data.incurred_on,
        parsed.data.amount,
        parsed.data.payment_method,
        id,
      ],
    );

    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "expense",
      entityId: id,
      action: "updated",
      beforeData: {
        supplier_id: expense.supplier_id,
        incurred_on: expense.incurred_on,
        amount: expense.amount,
        payment_method: expense.payment_method,
      },
      afterData: parsed.data,
    });

    await connection.commit();
    transactionStarted = false;
    return redirectToExpenses(request, "updated=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Expense update rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Expense update failed (${code}).`);
    return redirectToExpenses(request, "error=failed");
  } finally {
    connection?.release();
  }
}
