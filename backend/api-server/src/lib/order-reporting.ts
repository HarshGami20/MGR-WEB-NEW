import type { Prisma } from "@prisma/client";

export const CANCELLED_ORDER_STATUS = "cancelled";

export function isCancelledOrderStatus(status: string): boolean {
  return status === CANCELLED_ORDER_STATUS;
}

/** Prisma filter: omit cancelled orders from revenue / sales reports. */
export const excludeCancelledOrdersWhere: Prisma.OrderWhereInput = {
  status: { not: CANCELLED_ORDER_STATUS },
};

/** Revenue reports: apply branch/date filters but never include cancelled orders. */
export function revenueReportingOrderWhere(
  base: Prisma.OrderWhereInput = {},
): Prisma.OrderWhereInput {
  return { AND: [base, excludeCancelledOrdersWhere] };
}
