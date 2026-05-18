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

/** Form lines use GST-inclusive unit prices when `pricesIncludeGst` is true. */
export function computeOrderTotalsFromLines(
  lines: GstLineInput[],
  pricesIncludeGst: boolean,
): OrderTotalsSummary {
  let taxableSubtotal = 0;
  let taxAmount = 0;
  let enteredLinesTotal = 0;

  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unitPrice) || 0;
    const gst = Number(line.gstPercent) || 0;
    enteredLinesTotal += unit * qty;

    if (pricesIncludeGst && gst > 0) {
      const exUnit = exclusiveUnitFromInclusive(unit, gst);
      const lineTaxable = roundMoney(exUnit * qty);
      const lineTotal = roundMoney(unit * qty);
      taxableSubtotal += lineTaxable;
      taxAmount += roundMoney(lineTotal - lineTaxable);
    } else if (!pricesIncludeGst && gst > 0) {
      const lineTaxable = roundMoney(unit * qty);
      taxableSubtotal += lineTaxable;
      taxAmount += roundMoney((lineTaxable * gst) / 100);
    } else {
      const lineTaxable = roundMoney(unit * qty);
      taxableSubtotal += lineTaxable;
    }
  }

  return {
    taxableSubtotal: roundMoney(taxableSubtotal),
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(taxableSubtotal + taxAmount),
    enteredLinesTotal: roundMoney(enteredLinesTotal),
  };
}
