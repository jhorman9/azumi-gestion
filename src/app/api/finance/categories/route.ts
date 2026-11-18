import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { expenseCategorySchema } from "@/lib/validation/finance";

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
    return redirectToExpenses(request, "error=invalid-category");
  }

  const parsed = expenseCategorySchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToExpenses(request, "error=invalid-category");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO expense_categories (name, is_active, created_at, updated_at)
       VALUES (?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [parsed.data.name],
    );
    const categoryId = String(result.insertId);
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "expense_category",
      entityId: categoryId,
      action: "created",
      afterData: { name: parsed.data.name, is_active: true },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToExpenses(request, "created=category");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Expense category rollback failed.");
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
      return redirectToExpenses(request, "error=duplicate-category");
    }

    console.error(`Expense category creation failed (${code}).`);
    return redirectToExpenses(request, "error=failed");
  } finally {
    connection?.release();
  }
}
