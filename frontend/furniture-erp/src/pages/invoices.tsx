import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTablePaginationFooter } from "@/components/data-table";
import { 
  useListInvoices, 
  useGetInvoice,
  useListBranches,
} from "@/api-client";
import { useBranch } from "@/lib/branch-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Download, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@/api-client/custom-fetch";
import { useToast } from "@/hooks/use-toast";

export default function Invoices() {
  const [page, setPage] = useState(1);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const { selectedBranchId, setSelectedBranchId } = useBranch();

  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });

  const monthFilterParams = useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes("-")) return {};
    const [year, month] = selectedMonth.split("-");
    if (!year || !month) return {};
    return {
      year: Number(year),
      month: Number(month),
    };
  }, [selectedMonth]);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, selectedBranchId]);

  const { data: invoicesData, isLoading } = useListInvoices({
    page,
    limit: 10,
    ...monthFilterParams,
    branchId: selectedBranchId ?? undefined,
  });

  const { data: selectedInvoice } = useGetInvoice(selectedInvoiceId || 0, {
    query: {
      enabled: !!selectedInvoiceId,
      queryKey: selectedInvoiceId ? ["invoice", selectedInvoiceId] : ["invoice", 0]
    }
  });

  const openViewDialog = (id: number) => {
    setSelectedInvoiceId(id);
    setIsViewDialogOpen(true);
  };

  const handleDownloadAll = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (monthFilterParams.month && monthFilterParams.year) {
        params.set("month", String(monthFilterParams.month));
        params.set("year", String(monthFilterParams.year));
      }
      if (selectedBranchId != null) {
        params.set("branchId", String(selectedBranchId));
      }
      const query = params.toString();
      const blob = await customFetch<Blob>(`/api/invoices/export/zip${query ? `?${query}` : ""}`, {
        responseType: "blob",
      });

      const fileName = monthFilterParams.month && monthFilterParams.year
        ? `invoices-${monthFilterParams.year}-${String(monthFilterParams.month).padStart(2, "0")}.zip`
        : "invoices-all.zip";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Invoices exported successfully" });
    } catch (error: any) {
      toast({
        title: "Failed to export invoices",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const invoices = invoicesData?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof invoices)[number]>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: "Invoice #",
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-primary">{row.original.invoiceNumber}</span>
        ),
      },
      {
        id: "orderNumber",
        header: "Order #",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.order?.orderNumber}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "branch",
        header: "Branch",
        cell: ({ row }) => {
          const b = (row.original as { order?: { branch?: { name?: string } | null } }).order?.branch;
          return b?.name ? (
            <Badge variant="outline" className="flex w-fit max-w-[160px] items-center gap-1 font-normal">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{b.name}</span>
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
      },
      {
        accessorKey: "isGst",
        header: "Type",
        cell: ({ row }) =>
          row.original.isGst ? (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">GST</Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Standard</Badge>
          ),
      },
      {
        accessorKey: "totalAmount",
        header: () => <span className="text-right block w-full">Total Amount (₹)</span>,
        meta: { headerClassName: "text-right", cellClassName: "text-right font-medium" },
        cell: ({ row }) => `₹${row.original.totalAmount.toLocaleString()}`,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { headerClassName: "w-[80px]", cellClassName: "text-right" },
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" onClick={() => openViewDialog(row.original.id)}>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </Button>
        ),
      },
    ],
    [openViewDialog],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
          <p className="text-muted-foreground">View and manage order invoices</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Branch</label>
            <Select
              value={selectedBranchId?.toString() ?? "all"}
              onValueChange={(v) => setSelectedBranchId(v === "all" ? null : parseInt(v, 10))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(branchesData?.data ?? []).map((b: { id: number; name: string }) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Filter by month</label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedMonth("");
              setSelectedBranchId(null);
            }}
            disabled={!selectedMonth && selectedBranchId == null}
          >
            Clear filters
          </Button>
          <Button type="button" onClick={handleDownloadAll} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Download All ZIP"}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={invoices}
          isLoading={isLoading}
          emptyMessage="No invoices found."
          footer={<DataTablePaginationFooter page={page} total={invoicesData?.total ?? 0} limit={invoicesData?.limit ?? 10} onPageChange={setPage} itemLabel="invoices" />}
        />
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice ? (
            <div className="space-y-8 bg-white p-8 rounded border">
              {/* Invoice Header */}
              <div className="flex justify-between items-start border-b pb-6">
                <div>
                  <h1 className="text-2xl font-bold text-primary">INVOICE</h1>
                  <p className="text-sm text-muted-foreground mt-1">Invoice #: <span className="font-mono text-foreground">{selectedInvoice.invoiceNumber}</span></p>
                  <p className="text-sm text-muted-foreground">Date: <span className="text-foreground">{new Date(selectedInvoice.createdAt).toLocaleDateString()}</span></p>
                  <p className="text-sm text-muted-foreground">Order #: <span className="font-mono text-foreground">{selectedInvoice.order?.orderNumber}</span></p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold">MGR Casa</h2>
                  <p className="text-sm text-muted-foreground">123 Business Avenue</p>
                  <p className="text-sm text-muted-foreground">City, State, 12345</p>
                  <p className="text-sm text-muted-foreground mt-1">GSTIN: 22AAAAA0000A1Z5</p>
                </div>
              </div>

              {/* Bill To */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bill To:</h3>
                <p className="font-medium">{selectedInvoice.order?.customerName}</p>
                <p className="text-sm text-muted-foreground">{selectedInvoice.order?.customerAddress || "Address not provided"}</p>
                <p className="text-sm text-muted-foreground">{selectedInvoice.order?.customerMobile}</p>
                {selectedInvoice.isGst && selectedInvoice.order?.customerGstNumber && (
                  <p className="text-sm font-mono mt-1">GSTIN: {selectedInvoice.order.customerGstNumber}</p>
                )}
              </div>

              {/* Items Table */}
              <Table className="border">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">
                      {selectedInvoice.isGst ? "Rate (excl. GST)" : "Rate"}
                    </TableHead>
                    {selectedInvoice.isGst && <TableHead className="text-right">GST %</TableHead>}
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedInvoice.order?.items?.map((item: any) => {
                    const label = item.isCustom
                      ? item.customName ?? "Custom item"
                      : item.product?.name ?? `Product #${item.productId}`;
                    return (
                    <TableRow key={item.id}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">₹{item.unitPrice.toLocaleString()}</TableCell>
                      {selectedInvoice.isGst && <TableCell className="text-right">{item.gstPercent}%</TableCell>}
                      <TableCell className="text-right font-medium">₹{item.totalPrice.toLocaleString()}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {/* {selectedInvoice.isGst ? "Taxable amount:" : "Subtotal:"} */}
                      Sub Total:
                    </span>
                    <span>₹{selectedInvoice.order?.subtotal?.toLocaleString()}</span>
                  </div>
                  
                  {selectedInvoice.isGst && (
                    <>
                      {selectedInvoice.cgst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">CGST:</span>
                          <span>₹{selectedInvoice.cgst.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedInvoice.sgst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">SGST:</span>
                          <span>₹{selectedInvoice.sgst.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedInvoice.igst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">IGST:</span>
                          <span>₹{selectedInvoice.igst.toLocaleString()}</span>
                        </div>
                      )}
                    </>
                  )}
                  
                  <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
                    <span>Total:</span>
                    <span className="text-primary">₹{selectedInvoice.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center p-8">Loading...</div>
          )}
          <div className="flex justify-end space-x-2 border-t pt-4">
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            <Button disabled>
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}