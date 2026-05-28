/** Round to whole rupees: fraction strictly greater than 0.50 rounds up, otherwise down. */
export function roundInrPaymentAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const fraction = abs - whole;
  const rounded = fraction > 0.5 ? whole + 1 : whole;
  return sign * rounded;
}

/** Remaining order balance rounded for payment entry and validation. */
export function remainingInrPaymentAmount(totalAmount: number, paidAmount: number): number {
  return roundInrPaymentAmount(Math.max(0, totalAmount - paidAmount));
}
