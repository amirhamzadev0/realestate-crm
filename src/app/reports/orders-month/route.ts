import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { toCsv, type CsvCell } from "@/utils/csv";
import { formatMonth } from "@/utils/format";
import { getOrdersHistory } from "@/viewmodels/warehouse.viewmodel";

export const dynamic = "force-dynamic";

const kindLabel = { requested: "Requested", ordered: "Ordered", delivered: "Received", paid: "Paid", rejected: "Rejected" } as const;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Downloads what happened to the requests and orders in one month as a CSV file (opens in Excel): `?month=2026-10`, or every month
 * with `?month=all`. `&project=<slug>` limits it to one project. Only the Super Admin and the orders desk may download.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (user.role !== "superadmin" && user.role !== "warehouse") return NextResponse.json({ error: "Not allowed for your role" }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (month !== "all" && !MONTH.test(month)) return NextResponse.json({ error: "The month must look like 2026-10, or all" }, { status: 400 });

  const history = await getOrdersHistory(month === "all" ? undefined : month, request.nextUrl.searchParams.get("project") ?? undefined);
  const events = month === "all" ? history.all : history.rows;
  const name = `${history.project?.slug ?? "all-projects"}-${month}`;

  const rows: CsvCell[][] = [
    ["Material orders", history.project?.name ?? "All projects", month === "all" ? "All months" : formatMonth(month)],
    [],
    ["Date", "Project", "Material", "What happened", "Details", "Quantity ordered", "Quantity received in this event", "Paid in this event (PKR)", "Unit", "Vendor", "Order amount (PKR)", "Order status now", "Requested by"],
    ...events.map((e): CsvCell[] => [
      e.date, e.request.projectName, e.request.materialName, kindLabel[e.kind], e.text, e.request.quantity, e.quantity ?? "", e.amount ?? "",
      e.request.unit, e.request.vendor ?? "", e.request.totalAmount ?? "", e.request.status, e.request.requestedBy,
    ]),
  ];

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="material-orders-${name}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
