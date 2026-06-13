import { isPartnerPortalUser } from "@/lib/partner";
import type { PermissionUiAction } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { useMemo } from "react";
import { PARTNER_GUIDE_MODULES, STAFF_GUIDE_MODULES } from "./content";
import type { GuideModule, GuideScreen, VisibleGuideModule } from "./types";

function screenVisible(
  moduleKey: string,
  screen: GuideScreen,
  can: (module: string, action: PermissionUiAction) => boolean,
): boolean {
  if (moduleKey === "tools") {
    return screen.permission === "view" && can("tools", "view");
  }
  return can(moduleKey, screen.permission);
}

function moduleVisible(
  module: GuideModule,
  can: (module: string, action: PermissionUiAction) => boolean,
): boolean {
  const hasAnyScreen = module.screens.some((s) => screenVisible(module.key, s, can));
  if (!hasAnyScreen) return false;
  if (module.key === "tools") return can("tools", "view");
  return can(module.key, "view") || module.screens.some((s) => screenVisible(module.key, s, can));
}

export function filterGuideModules(
  modules: GuideModule[],
  can: (module: string, action: PermissionUiAction) => boolean,
): VisibleGuideModule[] {
  return modules
    .filter((m) => moduleVisible(m, can))
    .map((m) => ({
      ...m,
      visibleScreens: m.screens.filter((s) => screenVisible(m.key, s, can)),
    }))
    .filter((m) => m.visibleScreens.length > 0);
}

export function useVisibleGuideModules(): VisibleGuideModule[] {
  const { user } = useAuth();
  const { can } = usePermissions();

  return useMemo(() => {
    const source = user && isPartnerPortalUser(user) ? PARTNER_GUIDE_MODULES : STAFF_GUIDE_MODULES;
    return filterGuideModules(source, can);
  }, [user, can]);
}

export function groupModulesBySection(modules: VisibleGuideModule[]): { section: string; modules: VisibleGuideModule[] }[] {
  const map = new Map<string, VisibleGuideModule[]>();
  for (const mod of modules) {
    const list = map.get(mod.section) ?? [];
    list.push(mod);
    map.set(mod.section, list);
  }
  return Array.from(map.entries()).map(([section, mods]) => ({ section, modules: mods }));
}

export const PERMISSION_LABELS: Record<PermissionUiAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  delete: "Delete",
};

export const PERMISSION_COLORS: Record<PermissionUiAction, string> = {
  view: "bg-sky-100 text-sky-800 border-sky-200",
  add: "bg-emerald-100 text-emerald-800 border-emerald-200",
  edit: "bg-amber-100 text-amber-800 border-amber-200",
  delete: "bg-rose-100 text-rose-800 border-rose-200",
};
