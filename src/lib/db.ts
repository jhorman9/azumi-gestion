import "server-only";

import mysql, { type Pool } from "mysql2/promise";

declare global {
  var __restaurantDbPool: Pool | undefined;
}

let productionDbPool: Pool | undefined;

function createPool(): Pool {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const port = Number(process.env.DB_PORT ?? "3306");

  if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error(
      "Missing database configuration. Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD.",
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be an integer between 1 and 65535.");
  }

  return mysql.createPool({
    host: DB_HOST,
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    decimalNumbers: false,
  });
}

export function getDbPool(): Pool {
  if (process.env.NODE_ENV !== "production") {
    globalThis.__restaurantDbPool ??= createPool();
    return globalThis.__restaurantDbPool;
  }

  productionDbPool ??= createPool();
  return productionDbPool;
}
