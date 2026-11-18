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

interface SupplierRow extends RowDataPacket {
  id: string | number;
  legal_name: string;
  is_active: number;
}

function redirectToSuppliers(request: Request, result: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/suppliers?${result}`, request.url),
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
    return NextResponse.json({ error: "Proveedor no válido." }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToSuppliers(request, "error=invalid");
  }

  const parsed = recordStatusSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToSuppliers(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute<SupplierRow[]>(
      "SELECT id, legal_name, is_active FROM suppliers WHERE id = ? FOR UPDATE",
      [id],
    );
    const supplier = rows[0];

    if (!supplier) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToSuppliers(request, "error=not-found");
    }

    const wasActive = Boolean(supplier.is_active);
    const isActive = parsed.data.is_active === "1";
    if (wasActive !== isActive) {
      await connection.execute(
        `UPDATE suppliers
         SET is_active = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [isActive ? 1 : 0, id],
      );
      await writeAuditLog(connection, {
        actorUserId: actor.id,
        entityType: "supplier",
        entityId: id,
        action: "status_changed",
        beforeData: { legal_name: supplier.legal_name, is_active: wasActive },
        afterData: { legal_name: supplier.legal_name, is_active: isActive },
      });
    }

    await connection.commit();
    transactionStarted = false;
    return redirectToSuppliers(request, "updated=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Supplier status rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Supplier status update failed (${code}).`);
    return redirectToSuppliers(request, "error=failed");
  } finally {
    connection?.release();
  }
}
