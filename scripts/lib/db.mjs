import mysql from "mysql2/promise";
import { databaseUrl } from "./env.mjs";

const options = { multipleStatements: true, dateStrings: true, charset: "utf8mb4" };

/** Connects to the database named in DATABASE_URL. */
export async function connect() {
  return mysql.createConnection({ uri: databaseUrl(), ...options });
}

/** Creates the database from DATABASE_URL when it does not exist yet, then connects to it. */
export async function connectCreatingDatabase() {
  const url = new URL(databaseUrl());
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error("Database name in DATABASE_URL may only use letters, digits and _");
  url.pathname = "/";
  const admin = await mysql.createConnection({ uri: url.toString(), ...options });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  return connect();
}
