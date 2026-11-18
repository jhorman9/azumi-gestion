import { createInterface } from "node:readline/promises";
import process from "node:process";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { z } from "zod";

function promptSecret(message) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;

    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Ejecuta este comando desde una terminal interactiva."));
      return;
    }

    let value = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Operación cancelada."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          value += character;
          process.stdout.write("*");
        }
      }
    };

    process.stdout.write(message);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function errorCode(error) {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

async function main() {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const name = (await prompt.question("Nombre del administrador: ")).trim();
  const email = (await prompt.question("Correo del administrador: "))
    .trim()
    .toLowerCase();
  prompt.close();

  const password = await promptSecret("Contraseña (mínimo 12 caracteres): ");
  const confirmation = await promptSecret("Confirma la contraseña: ");
  const credentials = z
    .object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(190),
      password: z
        .string()
        .min(12)
        .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
    })
    .safeParse({ name, email, password });

  if (!credentials.success || password !== confirmation) {
    throw new Error(
      "Datos inválidos, contraseña demasiado larga o confirmación distinta.",
    );
  }

  if (
    !process.env.DB_HOST ||
    !process.env.DB_NAME ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error("Falta configurar la conexión de base de datos en .env.");
  }

  if (
    !process.env.SESSION_SECRET ||
    Buffer.byteLength(process.env.SESSION_SECRET, "utf8") < 32
  ) {
    throw new Error("SESSION_SECRET debe tener al menos 32 bytes.");
  }

  const port = Number(process.env.DB_PORT ?? "3306");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT no es válido.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [users] = await connection.query(
      "SELECT id FROM users LIMIT 1 FOR UPDATE",
    );

    if (users.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      throw new Error(
        "Ya existen usuarios. Crea y administra cuentas desde el panel.",
      );
    }

    const passwordHash = await bcrypt.hash(credentials.data.password, 12);
    const [result] = await connection.execute(
      `INSERT INTO users
        (name, email, password_hash, user_role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [credentials.data.name, credentials.data.email, passwordHash],
    );
    const userId = String(result.insertId);

    await connection.execute(
      `INSERT INTO audit_logs
        (actor_user_id, entity_type, entity_id, action, before_data, after_data, created_at)
       VALUES (NULL, 'user', ?, 'bootstrap_admin_created', NULL, ?, UTC_TIMESTAMP(3))`,
      [
        userId,
        JSON.stringify({
          name: credentials.data.name,
          email: credentials.data.email,
          role: "admin",
          is_active: true,
        }),
      ],
    );

    await connection.commit();
    transactionStarted = false;
    process.stdout.write("Administrador inicial creado.\n");
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    const code = errorCode(error);

    if (code) {
      throw new Error(`No se pudo crear el administrador (${code}).`);
    }

    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Error inesperado.");
  process.exitCode = 1;
});
