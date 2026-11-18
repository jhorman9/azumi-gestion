import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { expenseSchema } from "@/lib/validation/finance";

interface ActiveRow extends RowDataPacket {
  id: string | number;
}

function redirectToExpenses(request: Request, result: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/expenses?${result}`, request.url),
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
    const [categories] = await connection.execute<ActiveRow[]>(
      `SELECT id
       FROM expense_categories
       WHERE id = ? AND is_active = 1
       FOR UPDATE`,
      [parsed.data.category_id],
    );

    if (!categories[0]) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=category-required");
    }

    if (parsed.data.supplier_id) {
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
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO expenses
        (category_id, supplier_id, expense_type, incurred_on, due_on, amount,
         description, status, payment_method, paid_at, voided_at, created_by,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
         CASE WHEN ? = 1 THEN UTC_TIMESTAMP(3) ELSE NULL END,
         NULL, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.category_id,
        parsed.data.supplier_id,
        parsed.data.expense_type,
        parsed.data.incurred_on,
        parsed.data.due_on,
        parsed.data.amount,
        parsed.data.description,
        parsed.data.status,
        parsed.data.payment_method,
        parsed.data.status === "paid" ? 1 : 0,
        actor.id,
      ],
    );
    const expenseId = String(result.insertId);
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "expense",
      entityId: expenseId,
      action: "created",
      afterData: {
        ...parsed.data,
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
