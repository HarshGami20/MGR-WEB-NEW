import { 
  useGetDashboardSummary,
  useGetRecentOrders,
  useGetSalesReport,
  useGetOrderStatusBreakdown
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ShoppingCart, 
  IndianRupee, 
  PackageSearch, 
  AlertTriangle,
  Package,
  Building2,
  CreditCard,
  CheckCircle2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: recentOrders, isLoading: ordersLoading } = useGetRecentOrders({ limit: 5 });
  const { data: salesReport, isLoading: salesLoading } = useGetSalesReport({});
  const { data: orderStatus, isLoading: statusLoading } = useGetOrderStatusBreakdown();

  const kpis = summary ? [
    { title: "Total Revenue", value: `₹${summary.totalRevenue.toLocaleString()}`, icon: IndianRupee, color: "text-green-600" },
    { title: "Total Orders", value: summary.totalOrders, icon: ShoppingCart, color: "text-blue-600" },
    { title: "Pending Orders", value: summary.pendingOrders, icon: PackageSearch, color: "text-orange-600" },
    { title: "Low Stock Items", value: summary.lowStockCount, icon: AlertTriangle, color: "text-red-600" },
    { title: "Total Products", value: summary.totalProducts, icon: Package, color: "text-purple-600" },
    { title: "Total Suppliers", value: summary.totalSuppliers, icon: Building2, color: "text-indigo-600" },
    { title: "Pending Payments", value: summary.pendingPayments, icon: CreditCard, color: "text-pink-600" },
    { title: "Completed Today", value: summary.completedOrdersToday, icon: CheckCircle2, color: "text-emerald-600" },
  ] : [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "confirmed": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Confirmed</Badge>;
      case "processing": return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Processing</Badge>;
      case "completed": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
      case "cancelled": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your business metrics</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))
        ) : (
          kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {kpi.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{kpi.value}</div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Sales Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {salesLoading ? (
                <div className="w-full h-full flex items-center justify-center">Loading chart...</div>
              ) : salesReport && salesReport.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesReport}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                    <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
                  No sales data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {statusLoading ? (
                <div className="w-full h-full flex items-center justify-center">Loading chart...</div>
              ) : orderStatus && orderStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderStatus} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis dataKey="status" type="category" tickLine={false} axisLine={false} className="capitalize" />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground border border-dashed rounded-md">
                  No order data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordersLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
                </TableRow>
              ) : recentOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No recent orders.</TableCell>
                </TableRow>
              ) : (
                recentOrders?.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm font-medium">{order.orderNumber}</TableCell>
                    <TableCell className="font-medium">{order.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-right font-medium">₹{order.totalAmount.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}