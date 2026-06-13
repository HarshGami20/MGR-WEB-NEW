import { cn } from "@/lib/utils";
import type { VisibleGuideModule } from "@/lib/user-guide/types";
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
  Users,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  CalendarClock,
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

type GuideModuleNavProps = {
  modules: VisibleGuideModule[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  grouped: { section: string; modules: VisibleGuideModule[] }[];
};

export function GuideModuleNav({ activeKey, onSelect, grouped }: GuideModuleNavProps) {
  return (
    <nav className="space-y-5" aria-label="Guide modules">
      {grouped.map(({ section, modules }) => (
        <div key={section}>
          <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em]">
            {section}
          </p>
          <div className="space-y-0.5">
            {modules.map((mod) => {
              const Icon = ICON_MAP[mod.icon] ?? LayoutDashboard;
              const active = activeKey === mod.key;
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => onSelect(mod.key)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors text-left",
                    active
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  ) : null}
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{mod.label}</span>
                  <span
                    className={cn(
                      "ml-auto text-[10px] font-medium rounded-full px-2 py-0.5",
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {mod.visibleScreens.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
