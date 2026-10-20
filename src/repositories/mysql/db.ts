import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getMysqlPool } from "@/server/database/mysql";

export type Row = RowDataPacket;
type Param = string | number | boolean | null | undefined;

const clean = (params: Param[]) => params.map((p) => (p === undefined ? null : p));

/** Parameterized SELECT. Dynamic identifiers never come from callers, only values do. */
export async function select<T extends Row = Row>(sql: string, params: Param[] = []): Promise<T[]> {
  const [rows] = await getMysqlPool().execute<T[]>(sql, clean(params));
  return rows;
}

export async function selectOne<T extends Row = Row>(sql: string, params: Param[] = []): Promise<T | null> {
  return (await select<T>(sql, params))[0] ?? null;
}

/** Parameterized INSERT / UPDATE / DELETE. */
export async function run(sql: string, params: Param[] = []): Promise<ResultSetHeader> {
  const [result] = await getMysqlPool().execute<ResultSetHeader>(sql, clean(params));
  return result;
}

/** Builds " WHERE a = ? AND b = ?" from a fixed list of conditions. */
export function where(conditions: { sql: string; value: Param; when: boolean }[]): { clause: string; params: Param[] } {
  const active = conditions.filter((c) => c.when);
  return {
    clause: active.length ? ` WHERE ${active.map((c) => c.sql).join(" AND ")}` : "",
    params: active.map((c) => c.value),
  };
}
