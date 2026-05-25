import pg from "pg";

import { loadDotEnv } from "./env.js";

loadDotEnv();

const { Pool } = pg;

let pool;

export function hasDatabaseConfig() {
  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD
  );
}

export function getDatabaseConfig() {
  const missingKeys = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    (key) => !process.env[key]
  );

  if (missingKeys.length > 0) {
    throw createDbError(
      `Missing database configuration: ${missingKeys.join(", ")}.`,
      500
    );
  }

  return {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || 5432),
    ssl: getSslConfig(),
    max: Number(process.env.DB_POOL_SIZE || 5),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10_000),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  };
}

export function getDbPool() {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
  }

  return pool;
}

export async function queryDb(text, params = []) {
  return getDbPool().query(text, params);
}

export async function closeDbPool() {
  if (!pool) return;

  await pool.end();
  pool = undefined;
}

export function createDbError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getSslConfig() {
  const setting = String(process.env.DB_SSL || "").toLowerCase();

  if (["true", "1", "require", "required"].includes(setting)) {
    return {
      rejectUnauthorized:
        String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false").toLowerCase() ===
        "true",
    };
  }

  if (["false", "0", "disable", "disabled"].includes(setting)) {
    return false;
  }

  return undefined;
}
