import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VisibleGuideModule } from "@/lib/user-guide/types";
import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpen,
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
  Search,
  Settings,
  Shield,
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

type GuideModulePickerProps = {
  modules: VisibleGuideModule[];
  grouped: { section: string; modules: VisibleGuideModule[] }[];
  roleLabel: string;
  moduleCount: number;
  onSelect: (moduleKey: string) => void;
};

export function GuideModulePicker({ modules, grouped, roleLabel, moduleCount, onSelect }: GuideModulePickerProps) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const filteredGrouped = grouped
    .map(({ section, modules: sectionMods }) => ({
      section,
      modules: sectionMods.filter(
        (m) =>
          !q ||
          m.label.toLowerCase().includes(q) ||
          m.intro.toLowerCase().includes(q) ||
          m.section.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col justify-center px-2 py-8">
      <div className="text-center mb-8">
        {/* <div className="inline-flex items-center gap-2 text-primary mb-2">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-[0.16em]">Step 1 of 2</span>
        </div> */}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Select a module</h1>
        <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm md:text-base">
          Choose the area you want to learn. You will only see modules your role can access.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <Shield className="h-3.5 w-3.5" />
            {roleLabel}
          </Badge>
          <Badge variant="outline" className="py-1.5 px-3">
            {moduleCount} modules available
          </Badge>
        </div>
      </div>

      <div className="relative max-w-md mx-auto w-full mb-8">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10 h-11 rounded-xl bg-card"
          placeholder="Search modules…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-8">
        {filteredGrouped.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No modules match your search.
          </div>
        ) : (
          filteredGrouped.map(({ section, modules: sectionMods }) => (
            <section key={section}>
              <p className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-[0.16em] mb-3 px-1">
                {section}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionMods.map((mod) => {
                  const Icon = ICON_MAP[mod.icon] ?? LayoutDashboard;
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => onSelect(mod.key)}
                      className={cn(
                        "group relative flex flex-col items-start rounded-2xl border bg-card p-5 text-left shadow-sm",
                        "transition-all hover:border-primary/40 hover:shadow-md hover:bg-primary/[0.02]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {mod.visibleScreens.length} guides
                        </Badge>
                      </div>
                      <h2 className="mt-4 font-semibold text-foreground group-hover:text-primary transition-colors">
                        {mod.label}
                      </h2>
                      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{mod.intro}</p>
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        Open guide
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
