import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";
import { billSchema } from "@/lib/validation/finance";

interface SupplierRow extends RowDataPacket {
  id: string | number;
}

function redirectToBills(request: Request, result: string) {
  return NextResponse.redirect(
    new URL(`/dashboard/bills?${result}`, request.url),
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
    return redirectToBills(request, "error=invalid");
  }

  const parsed = billSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToBills(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
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
      return redirectToBills(request, "error=supplier-required");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO purchase_bills
        (supplier_id, invoice_reference, issue_date, due_date, amount, status,
         notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.supplier_id,
        parsed.data.invoice_reference,
        parsed.data.issue_date,
        parsed.data.due_date,
        parsed.data.amount,
        parsed.data.notes,
        actor.id,
      ],
    );
    const billId = String(result.insertId);
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "purchase_bill",
      entityId: billId,
      action: "created",
      afterData: { ...parsed.data, status: "open" },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToBills(request, "created=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Purchase bill rollback failed.");
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
      return redirectToBills(request, "error=duplicate");
    }

    console.error(`Purchase bill creation failed (${code}).`);
    return redirectToBills(request, "error=failed");
  } finally {
    connection?.release();
  }
}
