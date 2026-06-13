import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { GuideTarget } from "@/components/user-guide/guide-target";
import {
  LiveDataTable,
  LiveDeleteDialog,
  LiveFilterSelect,
  LiveLowStockToggle,
  LivePageHeader,
  LivePageRoot,
  LiveSearchFilter,
  OrderStatusBadge,
  type LiveColumn,
} from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { getListConfig } from "@/lib/user-guide/preview-configs";

type ListPreviewProps = {
  screenId: string;
  moduleKey: string;
  activeHighlight: string | null;
};

function ordersColumns(): LiveColumn[] {
  return [
    { header: "Order #", className: "font-mono text-sm font-medium" },
    { header: "Customer" },
    { header: "Date", className: "text-muted-foreground" },
    { header: "Status" },
    { header: "Delivery" },
    { header: "Payment" },
    { header: "Total Amount (₹)", headClassName: "text-right", className: "text-right tabular-nums font-medium" },
    { header: "Due Amount (₹)", headClassName: "text-right", className: "text-right tabular-nums font-medium" },
  ];
}

function ordersRows() {
  return [
    [
      DUMMY.order.id,
      <>
        <span className="font-medium">{DUMMY.order.customer}</span>
        <span className="block text-xs text-muted-foreground">{DUMMY.order.mobile}</span>
      </>,
      DUMMY.order.date,
      <OrderStatusBadge status="Order Received" />,
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>,
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Partially paid</Badge>,
      DUMMY.order.total.replace("₹", ""),
      "23,500",
    ],
    [
      "SO-2026-0138",
      <>
        <span className="font-medium">Anita Desai</span>
        <span className="block text-xs text-muted-foreground">98760 11122</span>
      </>,
      "10 Jun 2026",
      <OrderStatusBadge status="Complete" />,
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Delivered</Badge>,
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>,
      "22,100",
      "0",
    ],
  ];
}

function poColumns(): LiveColumn[] {
  return [
    { header: "PO #", className: "font-mono text-sm font-medium" },
    { header: "Type" },
    { header: "Vendor" },
    { header: "Date", className: "text-muted-foreground" },
    { header: "Status" },
    { header: "Total (₹)", headClassName: "text-right", className: "text-right tabular-nums font-medium" },
  ];
}

function poRows() {
  return [
    [
      DUMMY.po.id,
      <Badge variant="outline">Supplier</Badge>,
      DUMMY.po.supplier,
      "11 Jun 2026",
      <OrderStatusBadge status="confirmed" />,
      "1,25,000",
    ],
  ];
}

function productsColumns(): LiveColumn[] {
  return [
    { header: "Name" },
    { header: "SKU", className: "font-mono text-sm text-muted-foreground" },
    { header: "Category" },
    { header: "Price (₹)", headClassName: "text-right", className: "text-right tabular-nums" },
    { header: "GST", headClassName: "text-right", className: "text-right tabular-nums text-muted-foreground" },
    { header: "Stock", headClassName: "text-right", className: "text-right tabular-nums font-medium" },
    { header: "Variants", headClassName: "text-center", className: "text-center" },
  ];
}

function productsRows() {
  return [
    [
      <>
        <span className="font-semibold">{DUMMY.product.name}</span>
        <span className="block text-sm text-muted-foreground line-clamp-1">Premium upholstered sofa</span>
      </>,
      DUMMY.product.sku,
      DUMMY.product.category,
      "42,000",
      "18%",
      String(DUMMY.product.stock),
      <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs font-medium border-border/80" disabled>
        Variants (2)
      </Button>,
    ],
  ];
}

function categoriesColumns(): LiveColumn[] {
  return [
    { header: "Category" },
    { header: "Type" },
    { header: "Products", headClassName: "text-right", className: "text-right tabular-nums" },
  ];
}

function categoriesRows() {
  return [
    ["Living room", <Badge variant="secondary">Main</Badge>, "24"],
    ["Sofas", <Badge variant="outline">Sub · Living room</Badge>, "8"],
  ];
}

function configToColumns(cfg: ReturnType<typeof getListConfig>): LiveColumn[] {
  return cfg.columns.map((c) => ({
    header: c.header,
    className: c.cellClassName,
    headClassName: c.align === "right" ? "text-right" : undefined,
  }));
}

function configToRows(cfg: ReturnType<typeof getListConfig>) {
  return cfg.rows.map((row) =>
    cfg.columns.map((col) => {
      const val = row[col.key] ?? "";
      if (col.key === "status") return <OrderStatusBadge status={val} />;
      if (val.includes("\n")) {
        const [a, b] = val.split("\n");
        return (
          <>
            <span className="font-medium">{a}</span>
            <span className="block text-xs text-muted-foreground">{b}</span>
          </>
        );
      }
      return val;
    }),
  );
}

export function GuideLiveListPreview({ screenId, moduleKey, activeHighlight }: ListPreviewProps) {
  const cfg = getListConfig(screenId, moduleKey);
  const isDelete = screenId.includes("-delete");
  const isOrders = screenId.startsWith("orders");
  const isPo = screenId.startsWith("po") || screenId.startsWith("partner-po");
  const isProducts = screenId.startsWith("products");
  const isCategories = screenId.startsWith("categories");

  const filterLayout = isProducts ? "inline" : isCategories ? "none" : "orders";

  return (
    <LivePageRoot>
      <LivePageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        activeHighlight={activeHighlight}
        actions={
          cfg.showCreateButton ? (
            <GuideTarget id="header-action-add" activeHighlight={activeHighlight} label={cfg.createLabel ?? "Add"}>
              <Button disabled>
                <Plus className="mr-2 h-4 w-4" />
                {cfg.createLabel}
              </Button>
            </GuideTarget>
          ) : null
        }
      />

      {filterLayout !== "none" ? (
        <LiveSearchFilter
          placeholder={cfg.searchPlaceholder}
          activeHighlight={activeHighlight}
          layout={filterLayout}
          extra={
            <>
              {isOrders ? (
                <>
                  <LiveFilterSelect label="Date" value="All dates" />
                  <LiveFilterSelect label="Category" value="All categories" />
                  <LiveFilterSelect label="Order Status" value="All statuses" />
                  <LiveFilterSelect label="GST" value="All" />
                  <LiveFilterSelect label="Payment" value="All" />
                  <LiveFilterSelect label="Sort" value="Newest first" />
                </>
              ) : null}
              {isPo && !screenId.startsWith("partner") ? (
                <>
                  <LiveFilterSelect label="Type" value="All types" />
                  <LiveFilterSelect label="Status" value="All statuses" />
                  <LiveFilterSelect label="Date" value="All dates" />
                  <LiveFilterSelect label="Category" value="All categories" />
                </>
              ) : null}
              {isProducts ? (
                <>
                  <LiveFilterSelect label="Date range" value="All dates" />
                  <LiveFilterSelect label="Category" value="All categories" />
                  <LiveLowStockToggle />
                </>
              ) : null}
              {!isOrders && !isPo && !isProducts && cfg.filterLabels?.map((label) => (
                <LiveFilterSelect key={label} label={label} />
              ))}
            </>
          }
        />
      ) : null}

      {isOrders ? (
        <GuideTarget id="data-table" activeHighlight={activeHighlight} label="Orders table">
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-10 px-4 py-3">
                    <Checkbox disabled aria-label="Select all" />
                  </th>
                  {ordersColumns().map((c, i) => (
                    <th key={i} className={`px-4 py-3 text-left font-medium text-muted-foreground ${c.headClassName ?? ""}`}>
                      {c.header}
                    </th>
                  ))}
                  <th className="w-[100px] px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordersRows().map((cells, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Checkbox disabled />
                    </td>
                    {cells.map((cell, ci) => (
                      <td key={ci} className={`px-4 py-3 ${ordersColumns()[ci]?.className ?? ""}`}>
                        {cell}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">⋯</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border/60 px-6 py-4 text-sm text-muted-foreground">Showing 1–10 of 142 orders</div>
          </div>
        </GuideTarget>
      ) : (
        <LiveDataTable
          columns={
            isPo ? poColumns() : isProducts ? productsColumns() : isCategories ? categoriesColumns() : configToColumns(cfg)
          }
          rows={isPo ? poRows() : isProducts ? productsRows() : isCategories ? categoriesRows() : configToRows(cfg)}
          activeHighlight={activeHighlight}
          showActions={cfg.showRowActions !== false}
        />
      )}

      {isDelete ? <LiveDeleteDialog activeHighlight={activeHighlight} /> : null}
    </LivePageRoot>
  );
}
