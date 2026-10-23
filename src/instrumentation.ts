/**
 * Runs once when the server starts. It starts the job that saves each month's sales report as soon as the month is over,
 * so nobody has to open the report page for it to be kept.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReportScheduler } = await import("@/server/scheduler");
  startReportScheduler();
}
