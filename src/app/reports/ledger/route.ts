import { today as todayInBusinessZone } from "@/utils/id";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { toCsv, type CsvCell } from "@/utils/csv";
import { instalmentName, instalmentOutcome } from "@/utils/ledger";
import { getLedger, getLedgers, type LedgerStatus } from "@/viewmodels/finance.viewmodel";

export const dynamic = "force-dynamic";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Downloads a ledger as a CSV file (opens in Excel): one buyer's ledger with `?sale=<id>`, or the list of every buyer's plan
 * (limited by `project`, `q` and `status` like the Ledgers page) without it. Only the Super Admin and Finance may download.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (user.role !== "superadmin" && user.role !== "finance") return NextResponse.json({ error: "Not allowed for your role" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const today = todayInBusinessZone();
  let rows: CsvCell[][];
  let filename: string;

  const saleId = params.get("sale");
  if (saleId) {
    const ledger = await getLedger(saleId);
    if (!ledger) return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    const { sale, summary } = ledger;
    filename = `ledger-${slug(sale.buyer ?? "buyer")}-${slug(sale.unit)}.csv`;
    rows = [
      ["Ledger", sale.buyer ?? ""],
      ["Phone", sale.buyerPhone ?? ""],
      ["Project", ledger.projectName],
      ["Unit", `${sale.floor ? `Floor ${sale.floor}, ` : ""}${sale.unit}`],
      ["Bought on", sale.date],
      ["Price (PKR)", sale.price],
      ["Down payment (PKR)", summary.downPayment],
      ["Down payment (%)", summary.downPercent],
      ["Plan length (months)", summary.months],
      ["Plan ends", summary.endDate ?? "On possession"],
      ["Instalments paid", `${summary.paidCount} of ${summary.totalCount}`],
      ["Received (PKR)", summary.received],
      ["Still owed (PKR)", summary.owed],
      [],
      ["Instalments with a payment so far, newest first"],
      ["Instalment", "Due date", "To pay (PKR)", "Paid (PKR)", "Pending (PKR)", "Last payment", "Status", "How it stands"],
      ...ledger.items.filter((i) => i.paid > 0).map((i): CsvCell[] => [instalmentName(i, ledger.ordered), i.dueDate ?? "On possession", i.amount, i.paid, i.remaining, i.paidAt ?? "", i.state, instalmentOutcome(i, today)]),
      [],
      ["Payments received"],
      ["Instalment", "Date", "Amount (PKR)"],
      ...ledger.ordered.flatMap((i) => i.payments.map((p): CsvCell[] => [instalmentName(i, ledger.ordered), p.date, p.amount])),
    ];
  } else {
    const status = (["all", "booked", "sold"].includes(params.get("status") ?? "") ? params.get("status") : "all") as LedgerStatus;
    const list = await getLedgers(params.get("project") ?? undefined, params.get("q") ?? "", status);
    filename = `ledgers-${list.project?.slug ?? "all-projects"}.csv`;
    rows = [
      ["Ledgers", list.project?.name ?? "All projects"],
      [],
      ["Buyer", "Phone", "Project", "Unit", "Bought on", "Price (PKR)", "Down payment (PKR)", "Plan (months)", "Plan ends", "Instalments paid", "Instalments in all", "Received (PKR)", "Still owed (PKR)", "Status"],
      ...list.rows.map(({ sale, projectName, summary }): CsvCell[] => [
        sale.buyer ?? "", sale.buyerPhone ?? "", projectName, sale.unit, sale.date, sale.price, summary.downPayment, summary.months,
        summary.endDate ?? "On possession", summary.paidCount, summary.totalCount, summary.received, summary.owed, sale.status === "booked" ? "running" : "fully paid",
      ]),
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
