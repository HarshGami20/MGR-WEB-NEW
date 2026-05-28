import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser, partnerPortalLabel } from "@/lib/partner";
import { useBranch, assignedUserBranchIds, isSuperAdminUser } from "@/lib/branch-context";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Tags,
  Archive,
  ShoppingCart,
  FileText,
  CreditCard,
  Users,
  Settings,
  LogOut,
  Building2,
  Factory,
  GitBranch,
  Truck,
  ShieldCheck,
  ChevronDown,
  Menu,
  X,
  Mail,
  Search,
  HelpCircle,
  BadgeCheck,
  BarChart3,
  Calculator,
  CalendarClock,
  ClipboardList,
  Headphones,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useListBranches, useGetDashboardSummary } from "@/api-client";
import { useEffect, useState, useRef, useMemo, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { ROUTE_VIEW_MODULE, usePermissions } from "@/lib/permissions";

/** Must match `/orders` prefill cleanup key */
const ERP_ORDERS_SEARCH_PREFILL_KEY = "erp_orders_search_prefill";
const SIDEBAR_APP_PROMO_DISMISSED_KEY = "erp_sidebar_app_promo_dismissed";

interface LayoutProps {
  children: React.ReactNode;
}

type StaffNavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Show pending-order count badge from dashboard summary when available */
  showPendingBadge?: boolean;
};

type StaffSection = {
  title: string;
  items: StaffNavItem[];
};

const staffNavSections: StaffSection[] = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      // { label: "Orders", href: "/orders", icon: ShoppingCart, showPendingBadge: true },
      { label: "Purchase orders", href: "/purchase-orders", icon: ClipboardList },
      // { label: "Products", href: "/products", icon: Package },
      // { label: "Inventory", href: "/inventory", icon: Archive },
      // { label: "Deliveries", href: "/deliveries", icon: CalendarClock },
      // { label: "Drivers", href: "/drivers", icon: Truck },
      // { label: "Categories", href: "/categories", icon: Tags },
    ],
  },

  {
    title: "Orders",
    items: [
      { label: "Orders", href: "/orders", icon: ShoppingCart },
      { label: "Deliveries", href: "/deliveries", icon: CalendarClock },
      { label: "Drivers", href: "/drivers", icon: Truck },
    ],
  },

  {
    title: "Products",
    items: [
      { label: "Products", href: "/products", icon: Package },
      { label: "Categories", href: "/categories", icon: Tags },
      { label: "Inventory", href: "/inventory", icon: Archive },
    ],
  },


  {
    title: "Sales & billing",
    items: [
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Payments", href: "/payments", icon: CreditCard },
      { label: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Tools",
    items: [{ label: "Curtain calculator", href: "/curtain-calculator", icon: Calculator }],
  },
  {
    title: "Procurement",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
      { label: "Manufacturers", href: "/manufacturers", icon: Factory },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Branches", href: "/branches", icon: GitBranch },
      { label: "Users", href: "/users", icon: Users },
      { label: "Roles", href: "/roles", icon: ShieldCheck },
    ],
  },
];

function partnerNavItemsForUser(user: { supplierId?: number | null; manufacturerId?: number | null }) {
  const panelLabel = user.supplierId ? "Supplier portal" : "Manufacturer portal";
  const PanelIcon = user.supplierId ? Truck : Factory;
  return [
    { label: "Dashboard", href: "/dashboard", icon: PanelIcon },
    { label: "Purchase orders", href: "/purchase-orders", icon: ClipboardList },
    { label: "Notifications", href: "/notifications", icon: Bell },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Curtain calculator", href: "/curtain-calculator", icon: Calculator },
  ];
}

function getPageTitle(location: string, partnerUser: boolean, user?: { supplierId?: number | null } | null): string {
  if (partnerUser && location === "/dashboard") {
    return user?.supplierId ? "Supplier portal" : "Manufacturer portal";
  }
  if (partnerUser && location === "/settings") return "Settings";
  if (partnerUser && location === "/notifications") return "Notifications";
  if (partnerUser && location === "/purchase-orders") return "Purchase orders";
  if (partnerUser && location.startsWith("/purchase-orders/")) return "Purchase order";
  if (partnerUser && location.startsWith("/products/")) return "Product";
  if (location === "/complaints") return "Complaints";
  if (location.startsWith("/complaints/")) return "Complaint";
  if (partnerUser && user) {
    const found = partnerNavItemsForUser(user).find((item) => item.href === location);
    return found?.label ?? "MGR Casa";
  }
  const flat = staffNavSections.flatMap((s) => s.items);
  const hit = flat.find((item) => item.href === location);
  if (hit) return hit.label;
  if (location.startsWith("/products/")) {
    if (location === "/products/new") return "Add Product";
    if (location.endsWith("/edit")) return "Edit Product";
    return "Product";
  }
  return "MGR Casa";
}

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useBranch();
  const [location, setLocation] = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [showSidebarAppPromo, setShowSidebarAppPromo] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SIDEBAR_APP_PROMO_DISMISSED_KEY) !== "1";
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const dismissSidebarAppPromo = () => {
    setShowSidebarAppPromo(false);
    localStorage.setItem(SIDEBAR_APP_PROMO_DISMISSED_KEY, "1");
  };


  const { data: branchesData } = useListBranches({ isActive: true, limit: 100 });
  const branches = branchesData?.data ?? [];

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  const partnerUser = isPartnerPortalUser(user);
  const partnerNav = user ? partnerNavItemsForUser(user) : [];
  const assignedBranchIds = assignedUserBranchIds(user);
  const branchLocked = !partnerUser && assignedBranchIds.length === 1;
  const homeBranchId = branchLocked ? assignedBranchIds[0]! : null;
  const lockedBranchLabel =
    (user as { branch?: { name?: string } | null } | null)?.branch?.name ??
    branches.find((b) => b.id === homeBranchId)?.name ??
    "Branch";

  const branchesForPicker = useMemo(() => {
    if (!user || partnerUser || isSuperAdminUser(user)) return branches;
    const ids = assignedUserBranchIds(user);
    if (ids.length === 0) return branches;
    return branches.filter((b) => ids.includes(b.id));
  }, [branches, user, partnerUser]);

  const { data: summary } = useGetDashboardSummary(
    selectedBranchId != null ? { branchId: selectedBranchId } : undefined,
    { query: { enabled: !partnerUser && !!user } },
  );

  const pendingOrdersBadge =
    summary && summary.pendingOrders > 0 ? (summary.pendingOrders > 99 ? "99+" : String(summary.pendingOrders)) : null;

  const { can } = usePermissions();

  const visibleStaffNavSections = useMemo(() => {
    if (partnerUser) return [];
    return staffNavSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const mod = ROUTE_VIEW_MODULE[item.href];
          if (mod === "tools") return can("tools", "view");
          if (!mod) return false;
          return can(mod, "view");
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [partnerUser, user, can]);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = headerSearch.trim();
    if (q) sessionStorage.setItem(ERP_ORDERS_SEARCH_PREFILL_KEY, q);
    setMobileSidebarOpen(false);
    setLocation("/orders");
  };

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (partnerUser) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
        ev.preventDefault();
        searchRef.current?.focus();
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [partnerUser]);

  const sidebarAppPromoEl = showSidebarAppPromo ? (
    <div className="relative overflow-hidden rounded-2xl mt-5 bg-[linear-gradient(145deg,hsl(var(--primary-deep))_0%,hsl(var(--primary-dim))_48%,hsl(var(--primary))_100%)] p-4.5 text-white shadow-[0_16px_30px_rgba(56,39,67,0.28)]">
      <div className="absolute right-2 top-2 z-[2]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close app promo"
          className="absolute cursor-pointer right-2 top-2 z-[2] h-8 w-8 rounded-full text-white/85 hover:bg-white/10 hover:text-white"
          onClick={dismissSidebarAppPromo}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(ellipse at 102% 100%, rgba(176,138,218,.42) 0%, rgba(176,138,218,0) 58%)`,
        }}
      />
      <div className="pointer-events-none absolute -left-7 top-10 h-56 w-56 rounded-full border-2 border-white/20" />
      <div className="pointer-events-none absolute left-10 top-16 h-60 w-60 rounded-full border-2 border-white/15" />
      <div className="pointer-events-none absolute right-[-118px] top-20 h-72 w-72 rounded-full border-2 border-white/20" />
      <div className="pointer-events-none absolute right-[-66px] top-28 h-56 w-56 rounded-full border-2 border-white/15" />

      <div className="relative z-[1]">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[1.025rem] font-semibold leading-tight">
          Download our
          <br />
          Mobile App
        </p>
        <p className="text-xs text-white/80 mt-2.5 leading-relaxed">Get easy in another way</p>
      </div>
      <Button
        type="button"
        size="sm"
        className="relative z-[1] mt-5 rounded-full bg-white text-primary hover:bg-white/90 font-semibold w-full h-11 shadow-sm border-0"
        onClick={() => window.scrollTo({ top: 0 })}
      >
        Download
      </Button>
    </div>
  ) : null;

  const renderStaffSidebarInner = () => (
    <>
      <div className="h-[4.75rem] w-full flex items-center gap-2 border-b border-border/60 px-5">
        <div className="h-11 w-11 rounded-2xl size-11 shadow-xl flex items-center justify-center">
          <img src="/mgr_casa_logo_blue_mg.svg" alt="" className="size-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground truncate leading-tight">MGR Casa</p>
          <p className="text-[11px] text-muted-foreground truncate">ERP</p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-3 min-h-0">
        <div className="space-y-6 pr-2">
          {visibleStaffNavSections.map((section, si) => (
            <div key={si}>
              <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em]">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href === "/products" && location.startsWith("/products"));
                  const Icon = item.icon;
                  const badge =
                    item.showPendingBadge && pendingOrdersBadge ? (
                      <span className="ml-auto tabular-nums rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {pendingOrdersBadge}
                      </span>
                    ) : null;
                  return (
                    <Link key={item.href} href={item.href} className="block" onClick={() => setMobileSidebarOpen(false)}>
                      <span
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors relative",
                          isActive
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                        )}
                      >
                        {isActive ? (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-1 rounded-full bg-primary"
                            aria-hidden
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {badge}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="px-3 pb-4 pt-2 space-y-2 shrink-0 border-t border-border/50">
        <p className="px-3 pb-1 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em]">General</p>
        {can("complaints", "view") ? (
          <Link href="/complaints" className="block" onClick={() => setMobileSidebarOpen(false)}>
            <span
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                location === "/complaints" || location.startsWith("/complaints/")
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Headphones className="h-[18px] w-[18px]" />
              Complaints
            </span>
          </Link>
        ) : null}
        {can("settings", "view") ? (
          <Link href="/settings" className="block" onClick={() => setMobileSidebarOpen(false)}>
            <span className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
              <Settings className="h-[18px] w-[18px]" />
              Settings
            </span>
          </Link>
        ) : null}
        {/* <button
          type="button"
          onClick={() => {
            window.open(import.meta.env.VITE_HELP_URL ?? "mailto:support@mgrcasa.example", "_blank");
          }}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          Help
        </button> */}
        
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-medium"
          onClick={handleLogout}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </button>

        {sidebarAppPromoEl}
      </div>
    </>
  );

  const renderSidebar = (options: {
    rootClassName: string;
    headerEnd?: React.ReactNode;
    staff?: boolean;
  }) => (
    <div className={cn("flex flex-col h-full bg-card shadow-sm overflow-hidden border border-border", options.rootClassName)}>
    
      {partnerUser ? (
        <>
          <div className="h-[4.75rem] w-full flex items-center gap-2 border-b border-border/60 px-5 shrink-0">
            <div className="h-11 w-11 rounded-2xl size-11 shadow-xl flex items-center justify-center shrink-0">
              <img src="/mgr_casa_logo_blue_mg.svg" alt="" className="size-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground truncate leading-tight">MGR Casa</p>
              <p className="text-[11px] text-muted-foreground truncate">ERP</p>
            </div>
            {options.headerEnd ? <div className="shrink-0 flex items-center">{options.headerEnd}</div> : null}
          </div>

          <ScrollArea className="flex-1 px-3 py-3 min-h-0">
            <div className="space-y-6 pr-2">
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em]">
                  Menu
                </p>
                <div className="space-y-1">
                  {partnerNav.map((item) => {
                    const isActive =
                      location === item.href ||
                      (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
                    const Icon = item.icon;
                    return (
                      <Link key={item.label} href={item.href} className="block" onClick={() => setMobileSidebarOpen(false)}>
                        <span
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors relative",
                            isActive
                              ? "bg-primary/10 font-semibold text-primary"
                              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                          )}
                        >
                          {isActive ? (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-1 rounded-full bg-primary"
                              aria-hidden
                            />
                          ) : null}
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0",
                              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="px-3 pb-4 pt-2 space-y-2 shrink-0 border-t border-border/50">
            {/* <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate leading-tight">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.role?.name}</p>
              </div>
            </div> */}

            <p className="px-3 pb-1 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em]">General</p>
            {can("complaints", "view") ? (
              <Link href="/complaints" className="block" onClick={() => setMobileSidebarOpen(false)}>
                <span
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                    location === "/complaints" || location.startsWith("/complaints/")
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  <Headphones className="h-[18px] w-[18px]" />
                  Complaints
                </span>
              </Link>
            ) : null}
            {can("settings", "view") ? (
              <Link href="/settings" className="block" onClick={() => setMobileSidebarOpen(false)}>
                <span className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
                  <Settings className="h-[18px] w-[18px]" />
                  Settings
                </span>
              </Link>
            ) : null}
            {/* <button
              type="button"
              onClick={() => {
                window.open(import.meta.env.VITE_HELP_URL ?? "mailto:support@mgrcasa.example", "_blank");
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            >
              <HelpCircle className="h-[18px] w-[18px]" />
              Help
            </button> */}
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors font-medium"
              onClick={handleLogout}
            >
              <LogOut className="h-[18px] w-[18px]" />
              Log out
            </button>

            {sidebarAppPromoEl}
          </div>
        </>
      ) : options.staff ? (
        renderStaffSidebarInner()
      ) : null}
    </div>
  );

  return (
    <div className={cn("flex h-screen bg-background overflow-hidden")}>
      {!partnerUser ? (
        <div className="hidden md:flex shrink-0 w-[272px] p-4 pl-5">{renderSidebar({ rootClassName: " w-full rounded-2xl h-[calc(100vh-32px)]", staff: true })}</div>
      ) : (
        <div className="hidden md:flex shrink-0 w-[272px] p-4 pl-5">
          {renderSidebar({ rootClassName: " w-full rounded-2xl h-[calc(100vh-32px)]" })}
        </div>
      )}

      <div
        id="mobile-nav"
        className={cn(
          "fixed inset-0 z-50 md:hidden transition-[visibility,opacity] duration-200 ease-out",
          mobileSidebarOpen ? "visible opacity-100" : "invisible opacity-0 pointer-events-none",
        )}
        aria-hidden={!mobileSidebarOpen}
      >
        <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          className={cn(
            "absolute left-4 top-4 bottom-4 w-[min(17.5rem,calc(100vw-2rem))] flex flex-col shadow-2xl transition-transform duration-200 ease-out rounded-[1.65rem]",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {!partnerUser ? (
            <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden rounded-[inherit] border border-border bg-card shadow-sm">
                <div className="absolute top-3 right-3 z-20">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-xl bg-primary/10 text-primary"
                      aria-label="Close menu"
                      onClick={() => setMobileSidebarOpen(false)}
                    >
                      <X className="h-8 w-8" />
                    </Button>
              </div>
              {renderSidebar({ rootClassName: "flex-1 min-h-0 rounded-none border-0 shadow-none", staff: true })}
            </div>
          ) : (
            <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden rounded-[inherit] border border-border bg-card shadow-sm">
              <div className="absolute top-3 right-3 z-20">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-xl bg-primary/10 text-primary"
                  aria-label="Close menu"
                  onClick={() => setMobileSidebarOpen(false)}
                >
                  <X className="h-8 w-8" />
                </Button>
              </div>
              {renderSidebar({ rootClassName: "flex-1 min-h-0 rounded-none border-0 shadow-none" })}
            </div>
          )}
        </aside>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 md:pr-4 md:py-4">
        
        <header className="h-[4.25rem] justify-between border border-border/80 bg-card shrink-0 flex items-center gap-2 sm:gap-3 md:gap-4 px-3 md:px-6 rounded-none md:rounded-2xl shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 rounded-xl"
            aria-expanded={mobileSidebarOpen}
            aria-controls="mobile-nav"
            aria-label={mobileSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileSidebarOpen((open) => !open)}
          >
            {mobileSidebarOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </Button>

          {!partnerUser ? (
            <>
              <form onSubmit={submitSearch} className="flex-1 min-w-0 max-w-xl hidden sm:flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchRef}
                    placeholder="Search orders…"
                    value={headerSearch}
                    onChange={(e) => setHeaderSearch(e.target.value)}
                    className="h-11 rounded-xl bg-muted/40 border-0 pl-10 pr-[5.75rem] text-sm placeholder:text-muted-foreground/75 focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-muted-foreground">
                    <KbdGroup>
                      <Kbd className="rounded-md px-1.5 h-6 min-w-[1.375rem]">⌘</Kbd>
                      <Kbd className="rounded-md px-1.5">K</Kbd>
                    </KbdGroup>
                  </div>
                </div>
              </form>
              <span className="sm:hidden flex-1 min-w-0 text-sm font-semibold truncate">{getPageTitle(location, false)}</span>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold truncate">{getPageTitle(location, true, user)}</h2>
            </div>
          )}

      <div className="flex items-center gap-2">

          {!partnerUser && branchLocked ? (
            <div
              className="hidden md:flex h-10 gap-1.5 min-w-0 max-w-[220px] items-center rounded-xl border border-primary/25 bg-primary/5 px-3"
              title="Your account is assigned to this branch"
            >
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm truncate font-medium">{lockedBranchLabel}</span>
            </div>
          ) : null}

          {!partnerUser && !branchLocked ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="hidden md:flex h-10 gap-1.5 min-w-0 max-w-[220px] border-primary/25 bg-primary/5 hover:bg-primary/10 px-3 rounded-xl"
                >
                  <GitBranch className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm truncate font-medium">{selectedBranch ? selectedBranch.name : "All branches"}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Working branch</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={!selectedBranchId ? "bg-primary/5 text-primary font-medium rounded-lg" : "rounded-lg"}
                  onClick={() => setSelectedBranchId(null)}
                >
                  <LayoutDashboard className="h-3.5 w-3.5 mr-2 shrink-0" />
                  All branches
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {branchesForPicker.length === 0 ? (
                  <DropdownMenuItem disabled>No branches found</DropdownMenuItem>
                ) : (
                  branchesForPicker.map((branch) => (
                    <DropdownMenuItem
                      key={branch.id}
                      className={selectedBranchId === branch.id ? "bg-primary/5 text-primary font-medium rounded-lg" : "rounded-lg"}
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
          ) : null}

          {!partnerUser && (
            <Button variant="ghost" size="icon" type="button" className="shrink-0 rounded-xl hidden lg:flex relative" aria-label="Messages">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" aria-hidden />
            </Button>
          )}

          <div className="hidden sm:flex">
            <NotificationBell />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className=" gap-2.5 p-2 shrink-0 rounded-xl">
                <Avatar className="h-9 w-9 rounded-2xl">
                  <AvatarImage src={(user as any)?.avatarUrl || undefined} alt={user?.name || "User"} />
                  <AvatarFallback className="text-xs rounded-2xl bg-primary/15 text-primary font-bold">{getInitials(user?.name)}</AvatarFallback>
                </Avatar>
                {!partnerUser && (
                  <div className="hidden lg:flex flex-col items-start min-w-0">
                    <span className="text-sm font-semibold truncate max-w-[140px] leading-tight">{user?.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {(user?.email ?? user?.mobile) || user?.role?.name}
                    </span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{user?.name}</span>
                  <span className="text-xs text-muted-foreground font-normal">{user?.role?.name}</span>
                  {partnerUser && user ? (
                    <span className="text-xs text-primary flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{partnerPortalLabel(user)}</span>
                    </span>
                  ) : (user as any)?.branch?.name ? (
                    <span className="text-xs text-primary flex items-center gap-1 mt-0.5">
                      <GitBranch className="h-3 w-3" />
                      {(user as any).branch.name}
                    </span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer rounded-lg">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive hover:bg-destructive/10 focus:text-destructive rounded-lg" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>

        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-8 md:pt-7 md:bg-transparent md:[&]:rounded-t-none">
          {partnerUser ? children : <div className="mx-auto">{children}</div>}
        </main>
      </div>
    </div>
  );
}
