import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
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
import { billPaymentSchema } from "@/lib/validation/finance";

interface BillRow extends RowDataPacket {
  amount: string;
  status: "open" | "void";
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
    return redirectToBills(request, "error=invalid-payment");
  }

  const parsed = billPaymentSchema.safeParse(formFields(formData));

  if (!parsed.success) {
    return redirectToBills(request, "error=invalid-payment");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [billRows] = await connection.execute<BillRow[]>(
      "SELECT amount, status FROM purchase_bills WHERE id = ? FOR UPDATE",
      [id],
    );
    const bill = billRows[0];

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
    const paidBefore = paidRows[0]?.paid_total ?? "0.00";
    const totalCents = moneyToCents(bill.amount);
    const paidCents = moneyToCents(paidBefore);
    const paymentCents = moneyToCents(parsed.data.amount);

    if (paymentCents > totalCents - paidCents) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToBills(request, "error=overpayment");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO bill_payments
        (purchase_bill_id, paid_at, amount, payment_method, reference,
         created_by, created_at)
       VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        id,
        parsed.data.amount,
        parsed.data.payment_method,
        parsed.data.reference,
        actor.id,
      ],
    );
    const paidAfterCents = paidCents + paymentCents;
    await writeAuditLog(connection, {
      actorUserId: actor.id,
      entityType: "bill_payment",
      entityId: String(result.insertId),
      action: "recorded",
      beforeData: {
        purchase_bill_id: id,
        paid_total: paidBefore,
        balance_cents: (totalCents - paidCents).toString(),
      },
      afterData: {
        purchase_bill_id: id,
        amount: parsed.data.amount,
        payment_method: parsed.data.payment_method,
        reference: parsed.data.reference,
        paid_total_cents: paidAfterCents.toString(),
        remaining_balance_cents: (totalCents - paidAfterCents).toString(),
      },
    });
    await connection.commit();
    transactionStarted = false;
    return redirectToBills(request, "payment=recorded");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Bill payment rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`Bill payment creation failed (${code}).`);
    return redirectToBills(request, "error=failed");
  } finally {
    connection?.release();
  }
}
