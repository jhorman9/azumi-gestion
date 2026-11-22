import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
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
import { supplierSchema } from "@/lib/validation/finance";

function redirectToSuppliers(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/dashboard/suppliers?${result}`),
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
    return redirectToSuppliers(request, "error=invalid");
  }

  const parsed = supplierSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToSuppliers(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO suppliers
        (legal_name, contact_name, phone, email, notes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.legal_name,
        parsed.data.contact_name,
        parsed.data.phone,
        parsed.data.email,
        parsed.data.notes,
      ],
    );
    const supplierId = String(result.insertId);
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "supplier",
      entityId: supplierId,
      action: "created",
      afterData: { ...parsed.data, is_active: true },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToSuppliers(request, "created=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Supplier rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Supplier creation failed (${code}).`);
    return redirectToSuppliers(request, "error=failed");
  } finally {
    connection?.release();
  }
}
