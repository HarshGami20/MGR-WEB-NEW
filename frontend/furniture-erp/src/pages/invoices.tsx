import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { 
  useListInvoices, 
  useGetInvoice,
  getListInvoicesQueryKey
} from "@/api-client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Invoices() {
  const [page, setPage] = useState(1);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const { data: invoicesData, isLoading } = useListInvoices({
    page,
    limit: 10,
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
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <DataTable
          columns={columns}
          data={invoices}
          isLoading={isLoading}
          emptyMessage="No invoices found."
          footer={
            invoicesData && invoicesData.total > invoicesData.limit ? (
              <div className="p-4 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Showing {(page - 1) * invoicesData.limit + 1} to {Math.min(page * invoicesData.limit, invoicesData.total)} of {invoicesData.total} invoices
                </span>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * invoicesData.limit >= invoicesData.total}>
                    Next
                  </Button>
                </div>
              </div>
            ) : undefined
          }
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
                    <TableHead className="text-right">Rate</TableHead>
                    {selectedInvoice.isGst && <TableHead className="text-right">GST %</TableHead>}
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedInvoice.order?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product?.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">₹{item.unitPrice.toLocaleString()}</TableCell>
                      {selectedInvoice.isGst && <TableCell className="text-right">{item.gstPercent}%</TableCell>}
                      <TableCell className="text-right font-medium">₹{item.totalPrice.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
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