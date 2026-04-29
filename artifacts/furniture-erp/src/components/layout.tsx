import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
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
  Factory,
  GitBranch,
  ShieldCheck,
  ChevronDown,
  Bell,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useListBranches } from "@workspace/api-client-react";
import { useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

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
  { label: "Branches", href: "/branches", icon: GitBranch },
  { label: "Users", href: "/users", icon: Users },
  { label: "Roles", href: "/roles", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings },
];

function getPageTitle(location: string): string {
  const found = navItems.find((item) => !item.type && item.href === location);
  return found?.label ?? "Furniture ERP";
}

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useBranch();
  const [location, setLocation] = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });
  const branches = branchesData?.data ?? [];

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const Sidebar = (
    <div className="w-64 border-r bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b shrink-0">
        <h1 className="text-lg font-bold text-primary flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          Furniture ERP
        </h1>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-0.5">
          {navItems.map((item, i) => {
            if (item.type === "divider") {
              return (
                <div key={i} className="pt-5 pb-1.5 px-2">
                  <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                    {item.label}
                  </p>
                </div>
              );
            }
            const isActive = location === item.href;
            const Icon = item.icon!;
            return (
              <Link key={i} href={item.href!} className="block" onClick={() => setMobileSidebarOpen(false)}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start h-9 text-sm ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium hover:bg-primary/15"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="mr-2.5 h-4 w-4 shrink-0" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      {/* User info */}
      <div className="p-3 border-t shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-muted/50">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
              {getInitials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.role?.name}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative h-full">
            {Sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="h-16 border-b bg-card shrink-0 flex items-center gap-4 px-4 md:px-6">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{getPageTitle(location)}</h2>
          </div>

          {/* Branch selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 gap-2 min-w-0 max-w-[220px] border-primary/30 bg-primary/5 hover:bg-primary/10"
              >
                <GitBranch className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate font-medium">
                  {selectedBranch ? selectedBranch.name : "All Branches"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Select working branch
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={!selectedBranchId ? "bg-primary/5 text-primary font-medium" : ""}
                onClick={() => setSelectedBranchId(null)}
              >
                <LayoutDashboard className="h-3.5 w-3.5 mr-2 shrink-0" />
                All Branches
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {branches.length === 0 ? (
                <DropdownMenuItem disabled>No branches found</DropdownMenuItem>
              ) : (
                branches.map((branch) => (
                  <DropdownMenuItem
                    key={branch.id}
                    className={selectedBranchId === branch.id ? "bg-primary/5 text-primary font-medium" : ""}
                    onClick={() => setSelectedBranchId(branch.id)}
                  >
                    <GitBranch className="h-3.5 w-3.5 mr-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{branch.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{branch.code}</p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notification bell placeholder */}
          <Button variant="ghost" size="icon" className="shrink-0 relative hidden sm:flex">
            <Bell className="h-4.5 w-4.5" />
          </Button>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2 shrink-0">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                    {getInitials(user?.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium truncate max-w-[120px]">{user?.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">{user?.role?.name}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{user?.name}</span>
                  <span className="text-xs text-muted-foreground font-normal">{user?.role?.name}</span>
                  {(user as any)?.branch?.name && (
                    <span className="text-xs text-primary flex items-center gap-1 mt-0.5">
                      <GitBranch className="h-3 w-3" />
                      {(user as any).branch.name}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
