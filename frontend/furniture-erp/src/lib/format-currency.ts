const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const inrDetail = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Indian Rupee display (e.g. ₹12,34,567). */
export function formatInr(amount: number): string {
  return inrWhole.format(amount);
}

/** Indian Rupee with paise (e.g. ₹12,34,567.89). */
export function formatInrDetail(amount: number): string {
  return inrDetail.format(amount);
}

/** Indian number grouping without currency symbol (e.g. 12,34,567). */
export function formatInrNumber(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(amount);
}
