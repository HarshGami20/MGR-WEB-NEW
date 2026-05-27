import { cn } from "@/lib/utils";

export type TableStickyColumnMeta = {
  /** Pin column on the right when the table scrolls horizontally. Defaults to true for id `actions`. */
  stickyRight?: boolean;
};

export function isStickyRightColumn(columnId: string, meta?: TableStickyColumnMeta): boolean {
  if (meta?.stickyRight === false) return false;
  if (meta?.stickyRight === true) return true;
  return columnId === "actions";
}

const STICKY_RIGHT_BASE =
  "sticky right-0 shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.12)] border-l border-border/60";

/** Shared row hover — keep in sync with sticky action cells (solid bg, same transition). */
export const TABLE_ROW_HOVER_CLASS = "transition-colors hover:bg-muted";

/** Sticky header cell — use on the rightmost actions column. */
export function tableStickyHeadClassName(className?: string) {
  return cn("z-20 bg-card transition-colors", STICKY_RIGHT_BASE, className);
}

/** Sticky body cell — pair with `group` on TableRow for hover background. */
export function tableStickyCellClassName(className?: string) {
  return cn(
    "z-10 bg-card transition-colors group-hover:bg-muted group-data-[state=selected]:bg-muted",
    STICKY_RIGHT_BASE,
    className,
  );
}

/** Row wrapper for tables with a sticky actions column. */
export function tableRowWithStickyActionsClassName(className?: string) {
  return cn("group", TABLE_ROW_HOVER_CLASS, className);
}
