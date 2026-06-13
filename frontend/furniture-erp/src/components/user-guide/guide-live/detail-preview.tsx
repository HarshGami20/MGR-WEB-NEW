import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageHeader, LivePageRoot, OrderStatusBadge } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { getDetailConfig } from "@/lib/user-guide/preview-configs";
import { ArrowLeft, Edit, FileDown, MessageCircle, PencilLine } from "lucide-react";

type DetailPreviewProps = {
  screenId: string;
  moduleKey: string;
  activeHighlight: string | null;
};

function OrderDetailPreview({ activeHighlight }: { activeHighlight: string | null }) {
  return (
    <LivePageRoot>
      <GuideTarget id="detail-header" activeHighlight={activeHighlight} label="Order header">
        <div className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" disabled>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to orders
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{DUMMY.order.id}</h2>
                <OrderStatusBadge status="Order Received" />
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Partially paid</Badge>
              </div>
              <p className="text-muted-foreground mt-1">{DUMMY.order.customer} · {DUMMY.order.mobile}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled>
                <FileDown className="h-4 w-4 mr-1" />
                Quotation
              </Button>
              <Button variant="outline" size="sm" disabled>
                <MessageCircle className="h-4 w-4 mr-1" />
                WhatsApp
              </Button>
              <GuideTarget id="detail-edit-btn" activeHighlight={activeHighlight} label="Edit order" dimOthers={false}>
                <Button size="sm" disabled>
                  <PencilLine className="h-4 w-4 mr-1" />
                  Edit order
                </Button>
              </GuideTarget>
            </div>
          </div>
        </div>
      </GuideTarget>

      <GuideTarget id="detail-content" activeHighlight={activeHighlight} label="Order details">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="font-semibold mb-4">Line items</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit (₹)</TableHead>
                    <TableHead className="text-right">Total (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <span className="font-medium">{DUMMY.product.name}</span>
                      <span className="block text-xs text-muted-foreground">{DUMMY.product.sku}</span>
                    </TableCell>
                    <TableCell className="text-right">1</TableCell>
                    <TableCell className="text-right tabular-nums">42,000</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">42,000</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <Separator className="my-4" />
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">42,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST (18%)</span>
                    <span className="tabular-nums">7,560</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base pt-1 border-t">
                    <span>Total</span>
                    <span className="tabular-nums">{DUMMY.order.total.replace("₹", "")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <h3 className="font-semibold">Customer</h3>
              <p className="text-sm">{DUMMY.order.customer}</p>
              <p className="text-sm text-muted-foreground">{DUMMY.order.mobile}</p>
              <p className="text-sm text-muted-foreground">42, MG Road, Bengaluru</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <h3 className="font-semibold">Payment</h3>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="tabular-nums font-medium">25,000</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due</span>
                <span className="tabular-nums font-medium text-amber-700">23,500</span>
              </div>
            </div>
          </div>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function PoDetailPreview({ activeHighlight, partner }: { activeHighlight: string | null; partner?: boolean }) {
  return (
    <LivePageRoot>
      <GuideTarget id="detail-header" activeHighlight={activeHighlight} label="PO header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{DUMMY.po.id}</h2>
            <p className="text-muted-foreground mt-1">{DUMMY.po.supplier}</p>
            <div className="flex gap-2 mt-2">
              <OrderStatusBadge status={DUMMY.po.status} />
              <Badge variant="outline">Supplier PO</Badge>
            </div>
          </div>
          {!partner ? (
            <GuideTarget id="detail-edit-btn" activeHighlight={activeHighlight} label="Edit PO" dimOthers={false}>
              <Button variant="outline" size="sm" disabled>
                <Edit className="h-4 w-4 mr-1" />
                Edit PO
              </Button>
            </GuideTarget>
          ) : null}
        </div>
      </GuideTarget>

      <GuideTarget id="detail-content" activeHighlight={activeHighlight} label="PO line items">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate (₹)</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{DUMMY.product.name}</TableCell>
                <TableCell className="text-right">5</TableCell>
                <TableCell className="text-right tabular-nums">25,000</TableCell>
                <TableCell className="text-right tabular-nums font-medium">1,25,000</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </GuideTarget>
    </LivePageRoot>
  );
}

function GenericDetailPreview({ screenId, moduleKey, activeHighlight }: DetailPreviewProps) {
  const cfg = getDetailConfig(screenId, moduleKey);

  return (
    <LivePageRoot>
      <GuideTarget id="detail-header" activeHighlight={activeHighlight} label="Record header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{cfg.title}</h2>
            <p className="text-muted-foreground mt-1">{cfg.subtitle}</p>
            {cfg.badges?.length ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {cfg.badges.map((b) => (
                  <Badge key={b} variant="outline">
                    {b}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {cfg.showEditButton ? (
            <GuideTarget id="detail-edit-btn" activeHighlight={activeHighlight} label="Edit" dimOthers={false}>
              <Button variant="outline" size="sm" disabled>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </GuideTarget>
          ) : null}
        </div>
      </GuideTarget>

      <GuideTarget id="detail-content" activeHighlight={activeHighlight} label="Details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cfg.fields.map((f) => (
            <div key={f.label} className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium mt-1">{f.value}</p>
            </div>
          ))}
        </div>
        {cfg.sections?.map((s) => (
          <div key={s.title} className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold mb-3">{s.title}</h3>
            {s.lines.map((line) => (
              <div key={line} className="flex justify-between text-sm py-1">
                <span>{line.split(" — ")[0]}</span>
                <span className="font-medium tabular-nums">{line.split(" — ")[1] ?? ""}</span>
              </div>
            ))}
          </div>
        ))}
      </GuideTarget>
    </LivePageRoot>
  );
}

export function GuideLiveDetailPreview(props: DetailPreviewProps) {
  if (props.screenId === "orders-detail") return <OrderDetailPreview activeHighlight={props.activeHighlight} />;
  if (props.screenId === "po-detail" || props.screenId === "partner-po-detail") {
    return <PoDetailPreview activeHighlight={props.activeHighlight} partner={props.screenId.startsWith("partner")} />;
  }
  return <GenericDetailPreview {...props} />;
}
