import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuideModulePicker } from "@/components/user-guide/guide-module-picker";
import { GuideScreenCard } from "@/components/user-guide/guide-screen-card";
import { useVisibleGuideModules, groupModulesBySection } from "@/lib/user-guide/filter-guides";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ArrowLeft, BookOpen, Search } from "lucide-react";

export default function UserGuidePage() {
  const { user } = useAuth();
  const { superAdmin } = usePermissions();
  const modules = useVisibleGuideModules();
  const grouped = useMemo(() => groupModulesBySection(modules), [modules]);

  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null);
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [screenSearch, setScreenSearch] = useState("");

  const activeModule = modules.find((m) => m.key === selectedModuleKey) ?? null;

  const filteredScreens = useMemo(() => {
    if (!activeModule) return [];
    const q = screenSearch.trim().toLowerCase();
    if (!q) return activeModule.visibleScreens;
    return activeModule.visibleScreens.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.route.toLowerCase().includes(q) ||
        s.steps.some((step) => step.toLowerCase().includes(q)),
    );
  }, [activeModule, screenSearch]);

  useEffect(() => {
    if (!activeModule) {
      setActiveScreenId(null);
      return;
    }
    if (!activeScreenId || !filteredScreens.some((s) => s.id === activeScreenId)) {
      setActiveScreenId(filteredScreens[0]?.id ?? null);
    }
  }, [activeModule, activeScreenId, filteredScreens]);

  const activeScreen = filteredScreens.find((s) => s.id === activeScreenId) ?? null;
  const activeScreenIndex = activeScreen ? filteredScreens.indexOf(activeScreen) : 0;

  const roleLabel = superAdmin ? "Super Admin · full access" : (user?.role?.name ?? "Your role");

  if (modules.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h2 className="mt-4 text-lg font-semibold">No guide content available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have permissions for any modules yet. Contact an administrator.
        </p>
      </div>
    );
  }

  if (!selectedModuleKey || !activeModule) {
    return (
      <GuideModulePicker
        modules={modules}
        grouped={grouped}
        roleLabel={roleLabel}
        moduleCount={modules.length}
        onSelect={(key) => {
          setSelectedModuleKey(key);
          setScreenSearch("");
          setActiveScreenId(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] -mx-2 md:-mx-4 px-2 md:px-4">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl h-9"
            onClick={() => {
              setSelectedModuleKey(null);
              setActiveScreenId(null);
              setScreenSearch("");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Change module
          </Button>
          <div className="min-w-0">

            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{activeModule.label}</h1>
            <p className="text-sm text-muted-foreground line-clamp-2">{activeModule.intro}</p>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 rounded-xl bg-card"
            placeholder="Search guides in this module…"
            value={screenSearch}
            onChange={(e) => setScreenSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredScreens.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          No guides match your search in this module.
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {filteredScreens.map((screen, i) => (
              <button
                key={screen.id}
                type="button"
                onClick={() => setActiveScreenId(screen.id)}
                className={cn(
                  "shrink-0 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors min-w-[140px] max-w-[220px]",
                  activeScreenId === screen.id
                    ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="block text-[10px] uppercase tracking-wide opacity-70 mb-0.5">Guide {i + 1}</span>
                <span className="block truncate">{screen.title}</span>
              </button>
            ))}
          </div>

          {activeScreen ? (
            <GuideScreenCard
              key={activeScreen.id}
              screen={activeScreen}
              moduleKey={activeModule.key}
              index={activeScreenIndex}
              layout="full"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
