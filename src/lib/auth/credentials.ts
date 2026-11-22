import "server-only";

import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";
import { hashAccountIdentifier, type SessionUser, type UserRole } from "@/lib/auth/session";

const dummyPasswordHash =
  "$2b$12$GOy6quA2qqFdQvh.sKDoFeGgVb1D2m5tbgemC2W849FFOKnoStxXe";
const maxFailedAttempts = 5;

interface UserRow extends RowDataPacket {
  id: string | number;
  name: string;
  email: string;
  password_hash: string;
  user_role: UserRole;
  is_active: number;
}

interface RateLimitRow extends RowDataPacket {
  is_locked: number;
  window_expired: number;
}

export type CredentialResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "invalid" }
  | { status: "rate-limited" };

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<CredentialResult> {
  const pool = getDbPool();
  const accountHash = hashAccountIdentifier(email);

  await pool.execute(
    `DELETE FROM login_attempt_limits
     WHERE updated_at < UTC_TIMESTAMP(3) - INTERVAL 1 DAY
     LIMIT 100`,
  );
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    await connection.execute(
      `INSERT INTO login_attempt_limits
        (account_hash, window_started_at, failed_attempts, locked_until, updated_at)
       VALUES (?, UTC_TIMESTAMP(3), 0, NULL, UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP(3)`,
      [accountHash],
    );

    const [rateLimitRows] = await connection.execute<RateLimitRow[]>(
      `SELECT
         locked_until > UTC_TIMESTAMP(3) AS is_locked,
         window_started_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE AS window_expired
       FROM login_attempt_limits
       WHERE account_hash = ?
       FOR UPDATE`,
      [accountHash],
    );
    const rateLimit = rateLimitRows[0];

    if (!rateLimit) {
      throw new Error("Unable to read login rate limit state.");
    }

    if (rateLimit.is_locked) {
      await bcrypt.compare(password, dummyPasswordHash);
      await connection.commit();
      transactionStarted = false;
      return { status: "rate-limited" };
    }

    if (rateLimit.window_expired) {
      await connection.execute(
        `UPDATE login_attempt_limits
         SET window_started_at = UTC_TIMESTAMP(3),
             failed_attempts = 0,
             locked_until = NULL,
             updated_at = UTC_TIMESTAMP(3)
         WHERE account_hash = ?`,
        [accountHash],
      );
    }

    const [userRows] = await connection.execute<UserRow[]>(
      `SELECT id, name, email, password_hash, user_role, is_active
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );
    const user = userRows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password_hash ?? dummyPasswordHash,
    );

    if (
      !user ||
      !user.is_active ||
      user.user_role === "menu_editor" ||
      !passwordMatches
    ) {
      await connection.execute(
        `UPDATE login_attempt_limits
         SET locked_until = CASE
               WHEN failed_attempts + 1 >= ?
               THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
               ELSE NULL
             END,
             failed_attempts = failed_attempts + 1,
             updated_at = UTC_TIMESTAMP(3)
         WHERE account_hash = ?`,
        [maxFailedAttempts, accountHash],
      );
      await connection.commit();
      transactionStarted = false;
      return { status: "invalid" };
    }

    await connection.execute(
      `UPDATE login_attempt_limits
       SET window_started_at = UTC_TIMESTAMP(3),
           failed_attempts = 0,
           locked_until = NULL,
           updated_at = UTC_TIMESTAMP(3)
       WHERE account_hash = ?`,
      [accountHash],
    );
    await connection.commit();
    transactionStarted = false;

    return {
      status: "authenticated",
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.user_role,
      },
    };
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
}
