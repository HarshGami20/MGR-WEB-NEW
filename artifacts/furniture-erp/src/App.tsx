import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/layout";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import Categories from "@/pages/categories";
import Inventory from "@/pages/inventory";
import Orders from "@/pages/orders";
import Invoices from "@/pages/invoices";
import Payments from "@/pages/payments";
import PurchaseOrders from "@/pages/purchase-orders";
import Suppliers from "@/pages/suppliers";
import Manufacturers from "@/pages/manufacturers";
import Users from "@/pages/users";
import Roles from "@/pages/roles";
import Settings from "@/pages/settings";
import Branches from "@/pages/branches";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  
  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        {user && !isLoading ? <Redirect to="/dashboard" /> : <Login />}
      </Route>
      <Route path="/">
        <Redirect to={user ? "/dashboard" : "/login"} />
      </Route>
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/products"><ProtectedRoute component={Products} /></Route>
      <Route path="/categories"><ProtectedRoute component={Categories} /></Route>
      <Route path="/inventory"><ProtectedRoute component={Inventory} /></Route>
      <Route path="/orders"><ProtectedRoute component={Orders} /></Route>
      <Route path="/invoices"><ProtectedRoute component={Invoices} /></Route>
      <Route path="/payments"><ProtectedRoute component={Payments} /></Route>
      <Route path="/purchase-orders"><ProtectedRoute component={PurchaseOrders} /></Route>
      <Route path="/suppliers"><ProtectedRoute component={Suppliers} /></Route>
      <Route path="/manufacturers"><ProtectedRoute component={Manufacturers} /></Route>
      <Route path="/branches"><ProtectedRoute component={Branches} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/roles"><ProtectedRoute component={Roles} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;