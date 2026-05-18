import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BranchProvider } from "@/lib/branch-context";
import { NotificationSocketProvider } from "@/lib/notification-socket";
import Layout from "@/components/layout";
import { isPartnerPortalUser } from "@/lib/partner";
import { usePermissions } from "@/lib/permissions";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import ProductNew from "@/pages/product-new";
import ProductEdit from "@/pages/product-edit";
import ProductDetail from "@/pages/product-detail";
import Categories from "@/pages/categories";
import Inventory from "@/pages/inventory";
import Orders from "@/pages/orders";
import { OrderCreatePage, OrderEditPage } from "@/pages/order-form-page";
import OrderDetailPage from "@/pages/order-detail-page";
import Invoices from "@/pages/invoices";
import Payments from "@/pages/payments";
import PurchaseOrders from "@/pages/purchase-orders";
import Suppliers from "@/pages/suppliers";
import Manufacturers from "@/pages/manufacturers";
import Users from "@/pages/users";
import Roles from "@/pages/roles";
import Settings from "@/pages/settings";
import Branches from "@/pages/branches";
import ReportsPage from "@/pages/reports";
import CurtainCalculatorPage from "@/pages/curtain-calculator";
import NotificationsPage from "@/pages/notifications";
import DeliveriesPage from "@/pages/deliveries";
import ComplaintsPage from "@/pages/complaints";
import ComplaintDetailPage from "@/pages/complaint-detail-page";

const queryClient = new QueryClient();

function NoModuleAccess() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground max-w-md mx-auto">
      <p className="font-medium text-foreground">No screen access</p>
      <p className="mt-2 text-sm">
        Your role does not grant access to this area. Ask an administrator to update your permissions.
      </p>
    </div>
  );
}

function ProtectedRoute({ component: Component, viewModule }: { component: any; viewModule: string }) {
  const { user, isLoading } = useAuth();
  const { can, firstAccessiblePath } = usePermissions();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (isPartnerPortalUser(user)) {
    const allowed = viewModule === "dashboard" || viewModule === "settings" || viewModule === "tools";
    if (allowed) {
      return (
        <Layout>
          <Component />
        </Layout>
      );
    }
    return <Redirect to="/dashboard" />;
  }

  if (!can(viewModule, "view")) {
    const next = firstAccessiblePath();
    if (next) return <Redirect to={next} />;
    return (
      <Layout>
        <NoModuleAccess />
      </Layout>
    );
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function LoginGate() {
  const { user, isLoading } = useAuth();
  const { firstAccessiblePath } = usePermissions();
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!user) return <Login />;
  if (isPartnerPortalUser(user)) return <Redirect to="/dashboard" />;
  const p = firstAccessiblePath();
  return <Redirect to={p ?? "/dashboard"} />;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  const { firstAccessiblePath } = usePermissions();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (isPartnerPortalUser(user)) return <Redirect to="/dashboard" />;
  const p = firstAccessiblePath();
  return <Redirect to={p ?? "/dashboard"} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        <LoginGate />
      </Route>
      <Route path="/">
        <HomeRedirect />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute viewModule="dashboard" component={Dashboard} />
      </Route>
      <Route path="/products/new">
        <ProtectedRoute viewModule="products" component={ProductNew} />
      </Route>
      <Route path="/products/:id/edit">
        <ProtectedRoute viewModule="products" component={ProductEdit} />
      </Route>
      <Route path="/products/:id">
        <ProtectedRoute viewModule="products" component={ProductDetail} />
      </Route>
      <Route path="/products">
        <ProtectedRoute viewModule="products" component={Products} />
      </Route>
      {/* <Route path="/categories">
        <ProtectedRoute viewModule="categories" component={Categories} />
      </Route> */}
      <Route path="/inventory">
        <ProtectedRoute viewModule="inventory" component={Inventory} />
      </Route>
      <Route path="/orders">
        <ProtectedRoute viewModule="orders" component={Orders} />
      </Route>
      <Route path="/deliveries">
        <ProtectedRoute viewModule="deliveries" component={DeliveriesPage} />
      </Route>
      <Route path="/complaints">
        <ProtectedRoute viewModule="complaints" component={ComplaintsPage} />
      </Route>
      <Route path="/complaints/:id">
        <ProtectedRoute viewModule="complaints" component={ComplaintDetailPage} />
      </Route>
      <Route path="/orders/new">
        <ProtectedRoute viewModule="orders" component={OrderCreatePage} />
      </Route>
      <Route path="/orders/:id/edit">
        <ProtectedRoute viewModule="orders" component={OrderEditPage} />
      </Route>
      <Route path="/orders/:id">
        <ProtectedRoute viewModule="orders" component={OrderDetailPage} />
      </Route>
      <Route path="/invoices">
        <ProtectedRoute viewModule="invoices" component={Invoices} />
      </Route>
      <Route path="/payments">
        <ProtectedRoute viewModule="payments" component={Payments} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute viewModule="reports" component={ReportsPage} />
      </Route>
      <Route path="/curtain-calculator">
        <ProtectedRoute viewModule="tools" component={CurtainCalculatorPage} />
      </Route>
      <Route path="/notifications">
        <ProtectedRoute viewModule="dashboard" component={NotificationsPage} />
      </Route>
      <Route path="/purchase-orders">
        <ProtectedRoute viewModule="purchaseOrders" component={PurchaseOrders} />
      </Route>
      <Route path="/suppliers">
        <ProtectedRoute viewModule="suppliers" component={Suppliers} />
      </Route>
      <Route path="/manufacturers">
        <ProtectedRoute viewModule="manufacturers" component={Manufacturers} />
      </Route>
      <Route path="/branches">
        <ProtectedRoute viewModule="branches" component={Branches} />
      </Route>
      <Route path="/users">
        <ProtectedRoute viewModule="users" component={Users} />
      </Route>
      <Route path="/roles">
        <ProtectedRoute viewModule="roles" component={Roles} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute viewModule="settings" component={Settings} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BranchProvider>
            <NotificationSocketProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </NotificationSocketProvider>
          </BranchProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
