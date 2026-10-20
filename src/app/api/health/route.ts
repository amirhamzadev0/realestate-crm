import { NextResponse } from "next/server";
import { getMysqlPool } from "@/server/database/mysql";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.DATA_STORAGE !== "mysql") return NextResponse.json({ data: { status: "ok", storage: "mock" } });
  try {
    await getMysqlPool().query("SELECT 1");
    return NextResponse.json({ data: { status: "ok", storage: "mysql" } });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
