import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Package, 
  Tags, 
  Archive, 
  ShoppingCart, 
  FileText, 
  CreditCard, 
  Truck, 
  Users, 
  Settings,
  LogOut,
  Building2,
  Factory
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { type: "divider", label: "Products & Inventory" },
    { label: "Products", href: "/products", icon: Package },
    { label: "Categories", href: "/categories", icon: Tags },
    { label: "Inventory", href: "/inventory", icon: Archive },
    { type: "divider", label: "Sales" },
    { label: "Orders", href: "/orders", icon: ShoppingCart },
    { label: "Invoices", href: "/invoices", icon: FileText },
    { label: "Payments", href: "/payments", icon: CreditCard },
    { type: "divider", label: "Procurement" },
    { label: "Purchase Orders", href: "/purchase-orders", icon: Truck },
    { label: "Suppliers", href: "/suppliers", icon: Building2 },
    { label: "Manufacturers", href: "/manufacturers", icon: Factory },
    { type: "divider", label: "Administration" },
    { label: "Users", href: "/users", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col hidden md:flex">
        <div className="p-6">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            Furniture ERP
          </h1>
        </div>
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 py-2">
            {navItems.map((item, i) => {
              if (item.type === "divider") {
                return (
                  <div key={i} className="pt-4 pb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                      {item.label}
                    </p>
                  </div>
                );
              }
              const isActive = location === item.href;
              const Icon = item.icon!;
              return (
                <Link key={i} href={item.href!} className="block">
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start ${isActive ? "bg-primary/10 text-primary hover:bg-primary/15" : "hover:bg-muted"}`}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>
        <div className="p-4 border-t">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs text-muted-foreground">{user?.role?.name}</span>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b bg-card flex items-center px-6 md:hidden">
          <h1 className="text-xl font-bold text-primary">Furniture ERP</h1>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}