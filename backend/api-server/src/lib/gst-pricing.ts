/** Round money to 2 decimal places. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Unit price entered with GST included → taxable (exclusive) unit price. */
export function exclusiveUnitFromInclusive(inclusiveUnitPrice: number, gstPercent: number): number {
  if (gstPercent <= 0) return inclusiveUnitPrice;
  return roundMoney(inclusiveUnitPrice / (1 + gstPercent / 100));
}

/** Stored exclusive unit price → display inclusive unit price. */
export function inclusiveUnitFromExclusive(exclusiveUnitPrice: number, gstPercent: number): number {
  if (gstPercent <= 0) return exclusiveUnitPrice;
  return roundMoney(exclusiveUnitPrice * (1 + gstPercent / 100));
}

export type GstLineBreakdown = {
  exclusiveUnitPrice: number;
  lineTaxable: number;
  lineTax: number;
  lineTotal: number;
};

/**
 * Resolve a line when the user-entered unit price is GST-inclusive (GST invoice orders).
 * Stores exclusive unit price; lineTotal is the inclusive amount (qty × inclusive unit).
 */
export function breakdownGstInclusiveLine(
  inclusiveUnitPrice: number,
  quantity: number,
  gstPercent: number,
): GstLineBreakdown {
  const qty = Math.max(0, quantity);
  const lineTotal = roundMoney(inclusiveUnitPrice * qty);
  if (gstPercent <= 0) {
    return {
      exclusiveUnitPrice: inclusiveUnitPrice,
      lineTaxable: lineTotal,
      lineTax: 0,
      lineTotal,
    };
  }
  const exclusiveUnitPrice = exclusiveUnitFromInclusive(inclusiveUnitPrice, gstPercent);
  const lineTaxable = roundMoney(exclusiveUnitPrice * qty);
  const lineTax = roundMoney(lineTotal - lineTaxable);
  return { exclusiveUnitPrice, lineTaxable, lineTax, lineTotal };
}

/** Line when unit price is already exclusive (non-GST orders). */
export function breakdownGstExclusiveLine(
  exclusiveUnitPrice: number,
  quantity: number,
  gstPercent: number,
): GstLineBreakdown {
  const qty = Math.max(0, quantity);
  const lineTaxable = roundMoney(exclusiveUnitPrice * qty);
  const lineTax = gstPercent > 0 ? roundMoney((lineTaxable * gstPercent) / 100) : 0;
  return {
    exclusiveUnitPrice,
    lineTaxable,
    lineTax,
    lineTotal: roundMoney(lineTaxable + lineTax),
  };
}
