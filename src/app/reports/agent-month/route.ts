import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getAgentMonthDetail, getAgentReportsPage } from "@/viewmodels/sales.viewmodel";
import { toCsv, type CsvCell } from "@/utils/csv";
import { formatMonth } from "@/utils/format";

export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Downloads a monthly sales report as a CSV file (opens in Excel): one agent's month in detail with `?agent=<id>&month=2026-09`,
 * or every agent's summary for a month with just `?month=2026-09`. Only the Super Admin and the sales manager may download.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (user.role !== "superadmin" && user.role !== "sales") return NextResponse.json({ error: "Not allowed for your role" }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  const agent = request.nextUrl.searchParams.get("agent");
  if (!MONTH.test(month)) return NextResponse.json({ error: "The month must look like 2026-10" }, { status: 400 });

  let rows: CsvCell[][];
  let filename: string;

  if (agent) {
    const detail = await getAgentMonthDetail(agent, month);
    if (!detail) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    filename = `agent-report-${slug(detail.agent.name)}-${month}.csv`;
    rows = [
      ["Agent report", detail.agent.name],
      ["Month", formatMonth(month)],
      ["Commission rate (%)", detail.agent.commissionRate],
      [],
      ["Leads forwarded", "Calls", "WhatsApp messages", "Units sold", "Sales value (PKR)", "Commission (PKR)"],
      [detail.row.leads, detail.row.calls, detail.row.whatsapp, detail.row.units, detail.row.revenue, detail.row.commission],
      [],
      ["Sales"],
      ["Date", "Project", "Unit", "Floor", "Plot type", "Size", "List price (PKR)", "Discount (PKR)", "Price paid (PKR)", "Buyer", "Commission (PKR)"],
      ...detail.sales.map((s): CsvCell[] => [
        s.date, detail.projectName[s.projectId] ?? "", s.unit, s.floor ?? "", s.category, s.area, s.listPrice, s.discountAmount ?? 0, s.price, s.buyer ?? "", s.commission,
      ]),
      [],
      ["Leads forwarded in this month"],
      ["Forwarded", "Client", "Phone", "Project", "Stage", "Calls", "WhatsApp"],
      ...detail.leads.map((l): CsvCell[] => [l.assignedAt ?? l.createdAt, l.name, l.phone, detail.projectName[l.projectId] ?? "", l.status, l.contacts.calls, l.contacts.whatsapp]),
    ];
  } else {
    const report = await getAgentReportsPage(month);
    filename = `sales-report-${month}.csv`;
    rows = [
      ["Sales report", formatMonth(month)],
      [],
      ["Agent", "Leads", "Calls", "WhatsApp messages", "Units sold", "Sales value (PKR)", "Commission (PKR)"],
      ...report.selectedRows.map((r): CsvCell[] => [r.name, r.leads, r.calls, r.whatsapp, r.units, r.revenue, r.commission]),
      [
        "Total",
        report.selectedRows.reduce((n, r) => n + r.leads, 0),
        report.selectedRows.reduce((n, r) => n + r.calls, 0),
        report.selectedRows.reduce((n, r) => n + r.whatsapp, 0),
        report.selectedRows.reduce((n, r) => n + r.units, 0),
        report.selectedRows.reduce((n, r) => n + r.revenue, 0),
        report.selectedRows.reduce((n, r) => n + r.commission, 0),
      ],
    ];
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
