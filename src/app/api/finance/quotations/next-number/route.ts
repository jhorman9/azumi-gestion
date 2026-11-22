import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { todayInPanama } from "@/lib/finance/dates";
import { hasSameOrigin } from "@/lib/security/origin";

interface SequenceRow extends RowDataPacket {
  next_number: string | number | bigint;
}

function errorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!hasPermission(user.role, "finance:write")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const date = todayInPanama();
  const year = Number(date.slice(0, 4));
  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    connection = await getDbPool().getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    await connection.execute(
      `INSERT IGNORE INTO quotation_sequences (sequence_year, next_number)
       VALUES (?, 1)`,
      [year],
    );
    const [rows] = await connection.execute<SequenceRow[]>(
      `SELECT next_number
       FROM quotation_sequences
       WHERE sequence_year = ?
       FOR UPDATE`,
      [year],
    );
    const sequence = rows[0];
    if (!sequence) {
      throw new Error("Quotation number sequence was not initialized.");
    }

    const currentNumber = BigInt(sequence.next_number);
    await connection.execute(
      `UPDATE quotation_sequences
       SET next_number = ?
       WHERE sequence_year = ?`,
      [(currentNumber + BigInt(1)).toString(), year],
    );
    await connection.commit();
    transactionStarted = false;

    return NextResponse.json({
      quoteNumber: `COT-${year}-${currentNumber.toString().padStart(5, "0")}`,
      date,
    });
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Quotation sequence rollback failed.");
      }
    }

    const code = errorCode(error);
    console.error(`Quotation number allocation failed (${code}).`);
    if (code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json(
        {
          error:
            "Falta aplicar la migración 007_quotation_number_sequences.sql en la base de datos.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "No fue posible asignar un número de cotización." },
      { status: 503 },
    );
  } finally {
    connection?.release();
  }
}
