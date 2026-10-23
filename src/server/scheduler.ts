import "server-only";

import { salesService } from "@/server/container";

const HOUR = 60 * 60 * 1000;
const KEY = "__buildflow_report_scheduler__";
type GlobalWithScheduler = typeof globalThis & { [KEY]?: boolean };

/**
 * Saves the report of every finished month, now and then once an hour. A month that ends while the server is running is
 * saved within the hour; if the server was off, the next start catches up on every month it missed.
 */
export function startReportScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g[KEY]) return; // dev hot reload must not start a second timer
  g[KEY] = true;

  const run = async () => {
    try {
      const saved = await salesService.savedMonthlyReports();
      console.log(`[reports] monthly sales reports are up to date (${saved.length} saved)`);
    } catch (error) {
      console.error("[reports] could not save the monthly reports", error);
    }
  };

  setTimeout(() => void run(), 5_000).unref(); // let the server and the database come up first
  setInterval(() => void run(), HOUR).unref();
}
