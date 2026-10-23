const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const formatMoney = (value: number) => money.format(value);
export const formatCompactMoney = (value: number) => `PKR ${compact.format(value)}`;
export const formatNumber = (value: number) => new Intl.NumberFormat("en").format(value);

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export const phoneHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

/** A number for wa.me: digits only, with the country code. "0333-1000001" -> "923331000001" (Pakistan). */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

/** "2026-10" -> "Oct 2026". */
export function formatMonth(period: string): string {
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
