import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import { hasSameOrigin } from "@/lib/security/origin";

interface TargetUserRow extends RowDataPacket {
  id: string | number;
  user_role: string;
  is_active: number;
}

function redirectToUsers(request: Request, result: string) {
  return NextResponse.redirect(
    new URL(`/admin/users?${result}`, request.url),
    303,
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 403 });
  }

  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!hasPermission(actor.role, "users:manage")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const params = await context.params;

  if (
    typeof params !== "object" ||
    params === null ||
    !("id" in params) ||
    typeof params.id !== "string" ||
    !/^[1-9][0-9]{0,19}$/.test(params.id)
  ) {
    return NextResponse.json({ error: "Usuario no válido." }, { status: 400 });
  }
  const id = params.id;

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToUsers(request, "error=invalid");
  }

  const isActiveValue = formData.get("is_active");

  if (isActiveValue !== "0" && isActiveValue !== "1") {
    return redirectToUsers(request, "error=invalid");
  }

  const isActive = isActiveValue === "1";

  if (!isActive && String(actor.id) === id) {
    return redirectToUsers(request, "error=self");
  }

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    const activeConnection = await getDbPool().getConnection();
    connection = activeConnection;
    await activeConnection.beginTransaction();
    transactionStarted = true;

    const [targetRows] = await activeConnection.execute<TargetUserRow[]>(
      `SELECT id, user_role, is_active
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [id],
    );
    const target = targetRows[0];

    if (!target) {
      await connection.rollback();
      transactionStarted = false;
      return redirectToUsers(request, "error=not-found");
    }

    const wasActive = Boolean(target.is_active);

    if (wasActive === isActive) {
      await activeConnection.rollback();
      transactionStarted = false;
      return redirectToUsers(request, "updated=1");
    }

    if (!isActive && target.user_role === "admin") {
      const [adminRows] = await activeConnection.execute<RowDataPacket[]>(
        `SELECT id
         FROM users
         WHERE user_role = 'admin' AND is_active = 1
         FOR UPDATE`,
      );

      if (adminRows.length <= 1) {
        await activeConnection.rollback();
        transactionStarted = false;
        return redirectToUsers(request, "error=last-admin");
      }
    }

    await activeConnection.execute<ResultSetHeader>(
      `UPDATE users
       SET is_active = ?, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [isActive ? 1 : 0, id],
    );

    if (!isActive) {
      await activeConnection.execute("DELETE FROM auth_sessions WHERE user_id = ?", [
        id,
      ]);
    }

    await activeConnection.execute(
      `INSERT INTO audit_logs
        (actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at)
       VALUES (?, 'user', ?, 'status_changed', ?, ?, UTC_TIMESTAMP(3))`,
      [
        actor.id,
        id,
        JSON.stringify({ is_active: wasActive }),
        JSON.stringify({ is_active: isActive }),
      ],
    );

    await activeConnection.commit();
    transactionStarted = false;
    return redirectToUsers(request, "updated=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("User status rollback failed.");
      }
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    console.error(`User status update failed (${code}).`);
    return NextResponse.json(
      { error: "No fue posible actualizar el usuario." },
      { status: 503 },
    );
  } finally {
    connection?.release();
  }
}
