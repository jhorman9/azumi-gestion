import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { cookies } from "next/headers";
import { getDbPool } from "@/lib/db";

// Keep the legacy database value so retired accounts can be denied safely.
export type UserRole = "admin" | "manager" | "menu_editor";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const sessionLifetimeSeconds = 60 * 60 * 12;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }

  return secret;
}

function digest(value: string): Buffer {
  return createHmac("sha256", getSessionSecret()).update(value).digest();
}

function formatUtcDateTime(date: Date): string {
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function cookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-restaurant_session"
    : "restaurant_session";
}

export function hashAccountIdentifier(email: string): Buffer {
  return digest(email.trim().toLowerCase());
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  const pool = getDbPool();

  await pool.execute(
    `DELETE FROM auth_sessions
     WHERE expires_at <= UTC_TIMESTAMP(3)
     LIMIT 100`,
  );
  await pool.execute(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
    [userId, digest(token), formatUtcDateTime(expiresAt)],
  );

  const cookieStore = await cookies();
  cookieStore.set(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

interface SessionRow extends RowDataPacket {
  id: string | number;
  name: string;
  email: string;
  user_role: UserRole;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName())?.value;

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const pool = getDbPool();
  const [rows] = await pool.execute<SessionRow[]>(
    `SELECT u.id, u.name, u.email, u.user_role
     FROM auth_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND u.is_active = 1
       AND u.user_role <> 'menu_editor'
     LIMIT 1`,
    [digest(token)],
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    role: row.user_role,
  };
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName())?.value;

  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await getDbPool().execute(
      "DELETE FROM auth_sessions WHERE token_hash = ?",
      [digest(token)],
    );
  }

  cookieStore.set(cookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
