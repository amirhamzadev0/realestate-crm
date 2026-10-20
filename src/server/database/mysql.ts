import "server-only";

import mysql, { type Pool } from "mysql2/promise";
import { AppError } from "@/utils/errors";

const KEY = "__buildflow_mysql_pool__";
type GlobalWithPool = typeof globalThis & { [KEY]?: Pool };

/** One shared pool, cached on globalThis so dev hot reload does not open a new one each time. */
export function getMysqlPool(): Pool {
  const g = globalThis as GlobalWithPool;
  if (g[KEY]) return g[KEY];
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new AppError("Database is not configured", 503);
  g[KEY] = mysql.createPool({
    uri,
    charset: "utf8mb4",
    connectionLimit: 10,
    queueLimit: 100,
    enableKeepAlive: true,
    dateStrings: true, // DATE columns come back as "YYYY-MM-DD", like the mock data
    decimalNumbers: true, // DECIMAL columns come back as numbers
  });
  return g[KEY];
}
