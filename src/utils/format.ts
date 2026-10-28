import { whatsappDigits } from "@/utils/phone";
const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const formatMoney = (value: number) => money.format(value);
export const formatCompactMoney = (value: number) => `PKR ${compact.format(value)}`;
export const formatNumber = (value: number) => new Intl.NumberFormat("en").format(value);

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export const phoneHref = (phone: string) => {
  const raw = phone.replace(/[^+\d]/g, "");
  return `tel:${/^3\d{9}$/.test(raw) ? `0${raw}` : raw}`; // Excel drops the leading 0 of a mobile number
};

/** A number for wa.me: digits only, with the country code. "0333-1000001" -> "923331000001" (Pakistan). */
export function whatsappNumber(phone: string): string {
  return whatsappDigits(phone);
}

/** "2026-10" -> "Oct 2026". */
export function formatMonth(period: string): string {
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
