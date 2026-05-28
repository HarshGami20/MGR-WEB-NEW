import { endOfMonth, startOfMonth } from "date-fns";
import {
  type DateRangeValue,
  dateToYmd,
  getDefaultDateRangePresets,
  localTodayYmd,
  ymdToDate,
} from "@/lib/date-range";

export type { DateRangeValue };

/** Maps list pages to consistent date filter labels. */
export type ListDateFilterContext =
  | "orders"
  | "complaints"
  | "deliveries"
  | "purchaseOrders"
  | "products"
  | "inventory"
  | "payments"
  | "paymentsDue";

export const LIST_DATE_FILTER_LABELS: Record<
  ListDateFilterContext,
  { label: string; placeholder: string }
> = {
  orders: { label: "Date", placeholder: "Order date" },
  complaints: { label: "Date", placeholder: "Complaint date" },
  deliveries: { label: "Date", placeholder: "Delivery date" },
  purchaseOrders: { label: "Date", placeholder: "PO date" },
  products: { label: "Date", placeholder: "Product date" },
  inventory: { label: "Date", placeholder: "Movement date" },
  payments: { label: "Date", placeholder: "Payment date" },
  paymentsDue: { label: "Date", placeholder: "Order date" },
};

/** API query fields used by list endpoints (`createdFrom` / `createdTo`, YYYY-MM-DD). */
export function dateRangeToCreatedParams(value: DateRangeValue): {
  createdFrom?: string;
  createdTo?: string;
} {
  const from = value.from?.trim();
  const to = value.to?.trim();
  return {
    ...(from ? { createdFrom: from } : {}),
    ...(to ? { createdTo: to } : {}),
  };
}

/** Default range for revenue reports: current calendar month. */
export function getThisMonthDateRange(): DateRangeValue {
  const preset = getDefaultDateRangePresets().find((p) => p.id === "this_month");
  return preset?.getValue() ?? (() => {
    const today = localTodayYmd();
    const d = ymdToDate(today)!;
    return { from: dateToYmd(startOfMonth(d)), to: dateToYmd(endOfMonth(d)) };
  })();
}
