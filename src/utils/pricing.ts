export type DiscountMode = "none" | "amount" | "rate" | "percent";

export interface Priced {
  listPrice: number; // area x the project's rate
  price: number; // what the buyer pays
  discountAmount: number; // listPrice - price
}

/**
 * Works out what a unit costs. A discount can be:
 * - amount: a fixed amount off the total (e.g. 10,000 off 5,000,000),
 * - rate: a lower rate per sq ft / marla used instead of the list rate (e.g. 9,080 instead of 10,000),
 * - percent: a percentage off the total (e.g. 10%).
 * Used by the sale form for the live preview and by the server, so both always agree.
 */
export function priceUnit(area: number, rate: number, mode: DiscountMode = "none", value?: number): Priced {
  const listPrice = Math.round(area * rate);
  let price = listPrice;
  if (value !== undefined) {
    if (mode === "amount") price = Math.round(listPrice - value);
    else if (mode === "rate") price = Math.round(area * value);
    else if (mode === "percent") price = Math.round(listPrice * (1 - value / 100));
  }
  return { listPrice, price, discountAmount: listPrice - price };
}

/** A message when the discount does not make sense, or null when it is fine. */
export function discountProblem(listPrice: number, rate: number, mode: DiscountMode, value?: number): string | null {
  if (mode === "none") return null;
  if (value === undefined || !(value > 0)) return "Enter the discount";
  if (mode === "amount" && value >= listPrice) return "A discount amount must be less than the total price";
  if (mode === "rate" && value >= rate) return "The discounted rate must be lower than the list rate";
  if (mode === "percent" && value >= 100) return "A percentage discount must be below 100";
  return null;
}
