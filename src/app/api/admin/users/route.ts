import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { getDbPool } from "@/lib/db";
import {
  getSameOriginUrl,
  hasSameOrigin,
} from "@/lib/security/origin";
import { createUserSchema } from "@/lib/validation/auth";

function errorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNKNOWN";
}

function redirectToUsers(request: Request, result: string) {
  return NextResponse.redirect(
    getSameOriginUrl(request, `/admin/users?${result}`),
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

  if (!hasPermission(actor.role, "users:manage")) {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return redirectToUsers(request, "error=invalid");
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return redirectToUsers(request, "error=invalid");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    const activeConnection = await getDbPool().getConnection();
    connection = activeConnection;
    await activeConnection.beginTransaction();
    transactionStarted = true;

    const [result] = await activeConnection.execute<ResultSetHeader>(
      `INSERT INTO users
        (name, email, password_hash, user_role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [
        parsed.data.name,
        parsed.data.email,
        passwordHash,
        parsed.data.role,
      ],
    );
    const userId = String(result.insertId);

    await activeConnection.execute(
      `INSERT INTO audit_logs
        (actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at)
       VALUES (?, 'user', ?, 'created', NULL, ?, UTC_TIMESTAMP(3))`,
      [
        actor.id,
        userId,
        JSON.stringify({
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          is_active: true,
        }),
      ],
    );

    await activeConnection.commit();
    transactionStarted = false;
    return redirectToUsers(request, "created=1");
  } catch (error) {
    if (transactionStarted && connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("User creation rollback failed.");
      }
    }

    if (errorCode(error) === "ER_DUP_ENTRY") {
      return redirectToUsers(request, "error=duplicate");
    }

    console.error(`User creation failed (${errorCode(error)}).`);
    return NextResponse.json(
      { error: "No fue posible crear el usuario." },
      { status: 503 },
    );
  } finally {
    connection?.release();
  }
}
