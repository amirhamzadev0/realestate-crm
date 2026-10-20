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
