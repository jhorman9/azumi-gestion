import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { recordStatusSchema } from "@/lib/validation/finance";

interface CategoryRow extends RowDataPacket {
  id: string | number;
  name: string;
  is_active: number;
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
    return NextResponse.json({ error: "Categoría no válida." }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToExpenses(request, "error=invalid-category");
  }

  const parsed = recordStatusSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToExpenses(request, "error=invalid-category");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute<CategoryRow[]>(
      "SELECT id, name, is_active FROM expense_categories WHERE id = ? FOR UPDATE",
      [id],
    );
    const category = rows[0];

    if (!category) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToExpenses(request, "error=not-found");
    }

    const wasActive = Boolean(category.is_active);
    const isActive = parsed.data.is_active === "1";
    if (wasActive !== isActive) {
      await connection.execute(
        `UPDATE expense_categories
         SET is_active = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [isActive ? 1 : 0, id],
      );
      await writeAuditLog(connection, {
        actorUserId: actor.id,
        entityType: "expense_category",
        entityId: id,
        action: "status_changed",
        beforeData: { name: category.name, is_active: wasActive },
        afterData: { name: category.name, is_active: isActive },
      });
    }

    await connection.commit();
    transactionStarted = false;
    return redirectToExpenses(request, "updated=category");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Expense category status rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Expense category status update failed (${code}).`);
    return redirectToExpenses(request, "error=failed");
  } finally {
    connection?.release();
  }
}
