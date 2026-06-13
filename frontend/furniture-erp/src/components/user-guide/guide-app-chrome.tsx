import { cn } from "@/lib/utils";
import {
  Archive,
  BarChart3,
  Building2,
  Calculator,
  CalendarClock,
  ClipboardList,
  CreditCard,
  Factory,
  FileText,
  GitBranch,
  Headphones,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { GuideTarget } from "./guide-target";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  CalendarClock,
  Truck,
  Package,
  Tags,
  Archive,
  FileText,
  CreditCard,
  BarChart3,
  Calculator,
  Building2,
  Factory,
  GitBranch,
  Users,
  ShieldCheck,
  ScrollText,
  Headphones,
  Settings,
};

export type GuideNavItem = {
  label: string;
  moduleKey: string;
  icon: string;
  section: string;
};

/** Sidebar chrome matching the real ERP layout — highlights the active module nav link. */
export function GuideAppChrome({
  activeHighlight,
  navItem,
  children,
  size = "default",
}: {
  activeHighlight: string | null;
  navItem: GuideNavItem;
  children: React.ReactNode;
  size?: "default" | "full";
}) {
  const Icon = ICONS[navItem.icon] ?? LayoutDashboard;
  const navTargetId = `nav-${navItem.moduleKey}`;
  const isFull = size === "full";

  return (
    <div
      className={cn(
        "flex rounded-xl border border-border/80 bg-background overflow-hidden",
        isFull ? "min-h-[480px] max-h-[min(72vh,680px)]" : "min-h-[420px] max-h-[560px]",
      )}
    >
      <aside className="hidden sm:flex w-[200px] shrink-0 flex-col border-r border-border/60 bg-card">
        <div className="h-14 flex items-center gap-2 border-b border-border/60 px-3">
          <div className="h-9 w-9 rounded-xl shadow flex items-center justify-center shrink-0">
            <img src="/mgr_casa_logo_blue_mg.svg" alt="" className="size-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">MGR Casa</p>
            <p className="text-[10px] text-muted-foreground">ERP</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 text-[11px]">
          <div>
            <p className="px-2 pb-1 text-[9px] font-bold text-muted-foreground/80 uppercase tracking-[0.14em]">
              {navItem.section}
            </p>
            <GuideTarget
              id={navTargetId}
              activeHighlight={activeHighlight}
              label={`Open ${navItem.label}`}
              className="mx-0.5"
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-2.5 py-2 font-semibold text-primary bg-primary/10 relative",
                )}
              >
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                <Icon className="h-4 w-4 shrink-0 ml-1" />
                <span className="truncate">{navItem.label}</span>
              </div>
            </GuideTarget>
          </div>
          <div className="px-2 pt-2 border-t border-border/40">
            <p className="pb-1 text-[9px] font-bold text-muted-foreground/80 uppercase tracking-[0.14em]">General</p>
            <div className="flex items-center gap-2 rounded-2xl px-2.5 py-2 text-muted-foreground">
              <Settings className="h-4 w-4" />
              Settings
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto bg-background">
        <div className="border-b border-border/60 bg-card/50 px-3 py-2 flex items-center justify-between sm:hidden">
          <span className="text-xs font-medium text-muted-foreground">Mobile header</span>
          <GuideTarget id={navTargetId} activeHighlight={activeHighlight} label={`Open ${navItem.label}`}>
            <span className="text-xs font-semibold text-primary">{navItem.label}</span>
          </GuideTarget>
        </div>
        <div className={cn("p-3 sm:p-4 origin-top", isFull ? "sm:p-5" : "scale-[0.98]")}>{children}</div>
      </div>
    </div>
  );
}
