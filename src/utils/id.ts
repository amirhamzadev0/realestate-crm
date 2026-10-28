export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/** The business time zone: a sale made at 1 am in Pakistan is dated that day, not the day before (UTC). Set APP_TIMEZONE to change it. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Karachi";

/** Today's date as YYYY-MM-DD in the business time zone. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}
