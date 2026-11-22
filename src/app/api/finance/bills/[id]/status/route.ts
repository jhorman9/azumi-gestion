import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { writeAuditLog } from "@/lib/finance/audit";
import { formFields } from "@/lib/finance/form";
import { moneyToCents } from "@/lib/finance/money";
import { getDbPool } from "@/lib/db";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";
import { billStatusSchema } from "@/lib/validation/finance";

interface BillRow extends RowDataPacket {
  status: "open" | "void";
  amount: string;
}

interface PaidRow extends RowDataPacket {
  paid_total: string;
}

function redirectToBills(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/dashboard/bills?${result}`),
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
    return NextResponse.json({ error: "Factura no válida." }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToBills(request, "error=invalid");
  }

  const parsed = billStatusSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToBills(request, "error=invalid");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute<BillRow[]>(
      "SELECT status, amount FROM purchase_bills WHERE id = ? FOR UPDATE",
      [id],
    );
    const bill = rows[0];

    if (!bill) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToBills(request, "error=not-found");
    }

    if (bill.status !== "open") {
      await connection.rollback();
      transactionStarted = false;
      return redirectToBills(request, "error=locked");
    }

    const [paidRows] = await connection.execute<PaidRow[]>(
      `SELECT COALESCE(SUM(amount), 0.00) AS paid_total
       FROM bill_payments
       WHERE purchase_bill_id = ?`,
      [id],
    );
    const paidTotal = paidRows[0]?.paid_total ?? "0.00";

    if (moneyToCents(paidTotal) > BigInt(0)) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToBills(request, "error=has-payments");
    }

    await connection.execute(
      `UPDATE purchase_bills
       SET status = 'void', updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [id],
    );
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "purchase_bill",
      entityId: id,
      action: "voided",
      beforeData: { status: bill.status, amount: bill.amount, paid_total: paidTotal },
      afterData: { status: "void", amount: bill.amount, paid_total: paidTotal },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToBills(request, "updated=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Bill status rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Bill status update failed (${code}).`);
    return redirectToBills(request, "error=failed");
  } finally {
    connection?.release();
  }
}
