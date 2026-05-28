export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function exclusiveUnitFromInclusive(inclusiveUnitPrice: number, gstPercent: number): number {
  if (gstPercent <= 0) return inclusiveUnitPrice;
  return roundMoney(inclusiveUnitPrice / (1 + gstPercent / 100));
}

export function inclusiveUnitFromExclusive(exclusiveUnitPrice: number, gstPercent: number): number {
  if (gstPercent <= 0) return exclusiveUnitPrice;
  return roundMoney(exclusiveUnitPrice * (1 + gstPercent / 100));
}

export type GstLineInput = {
  unitPrice: number;
  quantity: number;
  gstPercent: number;
};

export type OrderTotalsSummary = {
  taxableSubtotal: number;
  taxAmount: number;
  total: number;
  /** Sum of line amounts as entered (incl. GST when applicable). */
  enteredLinesTotal: number;
};

/**
 * Payment summary for the order form. Line amounts never change when toggling GST;
 * `showGstBreakdown` only controls whether subtotal + GST rows are shown.
 */
export function computeOrderTotalsFromLines(
  lines: GstLineInput[],
  showGstBreakdown: boolean,
  defaultGstPercent = 18,
): OrderTotalsSummary {
  let enteredLinesTotal = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unitPrice) || 0;
    enteredLinesTotal += unit * qty;
  }
  enteredLinesTotal = roundMoney(enteredLinesTotal);

  if (!showGstBreakdown) {
    return {
      taxableSubtotal: enteredLinesTotal,
      taxAmount: 0,
      total: enteredLinesTotal,
      enteredLinesTotal,
    };
  }

  let taxableSubtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unitPrice) || 0;
    const gst = Number(line.gstPercent) || 0;
    const rate = gst > 0 ? gst : defaultGstPercent;
    const lineTotal = roundMoney(unit * qty);
    if (rate > 0) {
      const exUnit = exclusiveUnitFromInclusive(unit, rate);
      const lineTaxable = roundMoney(exUnit * qty);
      taxableSubtotal += lineTaxable;
      taxAmount += roundMoney(lineTotal - lineTaxable);
    } else {
      taxableSubtotal += lineTotal;
    }
  }

  return {
    taxableSubtotal: roundMoney(taxableSubtotal),
    taxAmount: roundMoney(taxAmount),
    total: enteredLinesTotal,
    enteredLinesTotal,
  };
}
