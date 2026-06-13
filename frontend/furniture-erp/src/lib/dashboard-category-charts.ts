export type CategoryRevenueRow = {
  categoryId: number | null;
  categoryName: string;
  revenue: number;
};

export type CategoryRevenueMatrixShape = {
  periodType: "day" | "month";
  periods: Array<{ key: string; label: string }>;
  rows: Array<{
    categoryId: number | null;
    categoryName: string;
    byPeriod: Record<string, number>;
    totalRevenue: number;
  }>;
};

/** Forecast stack bottom → top: grey, black, blue, other */
export const FORECAST_STACK_COLORS = ["#64748B", "#0F172A", "#2563EB", "#CBD5E1"] as const;

/** Source bar left → right: blue, black, grey, light grey */
export const SOURCE_STACK_COLORS = ["#2563EB", "#0F172A", "#64748B", "#CBD5E1"] as const;

export const DASHBOARD_STACK_COLORS = SOURCE_STACK_COLORS;

export type DashboardStackSeries = {
  key: string;
  name: string;
  color: string;
};

export type DashboardForecastSegment = {
  name: string;
  value: number;
  color: string;
  changePct: number | null;
};

export type DashboardForecastRow = {
  periodKey: string;
  label: string;
  tooltipTitle: string;
  total: number;
  segments: DashboardForecastSegment[];
  [key: string]: unknown;
};

export type DashboardSourceItem = {
  categoryId: number | null;
  name: string;
  value: number;
  pct: number;
  color: string;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortMonthLabel(label: string, periodKey: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodKey);
  if (m) {
    const idx = Number(m[2]) - 1;
    if (idx >= 0 && idx < 12) return MONTH_SHORT[idx];
  }
  return label.slice(0, 3);
}

export function formatForecastTooltipTitle(periodKey: string, fallback: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodKey);
  if (m) {
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx >= 0 && monthIdx < 12) return `${MONTH_SHORT[monthIdx]}, ${m[1]}`;
  }
  return fallback;
}

export function computeForecastYAxis(maxValue: number, tickCount = 5): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: 1, ticks: [0] };
  const rough = maxValue * 1.12;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  let niceNorm = 10;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  const max = niceNorm * magnitude;
  const step = max / tickCount;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => step * i);
  return { max, ticks };
}

export function buildForecastChartData(matrix: CategoryRevenueMatrixShape): {
  rows: DashboardForecastRow[];
  stacks: DashboardStackSeries[];
} {
  const categories = [...matrix.rows]
    .filter((r) => r.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
  const top = categories.slice(0, 3);
  const stacks: DashboardStackSeries[] = top.map((c, i) => ({
    key: `stack${i}`,
    name: c.categoryName,
    color: FORECAST_STACK_COLORS[i] ?? FORECAST_STACK_COLORS[3],
  }));
  if (categories.length > 3) {
    stacks.push({ key: "other", name: "Other", color: FORECAST_STACK_COLORS[3] });
  }

  const rawRows: DashboardForecastRow[] = matrix.periods.map((period) => {
    const row: DashboardForecastRow = {
      periodKey: period.key,
      label: shortMonthLabel(period.label, period.key),
      tooltipTitle: formatForecastTooltipTitle(period.key, period.label),
      total: 0,
      segments: [],
    };
    let other = 0;
    for (const cat of categories) {
      const value = cat.byPeriod[period.key] ?? 0;
      if (value <= 0) continue;
      const topIdx = top.findIndex((t) => t.categoryId === cat.categoryId && t.categoryName === cat.categoryName);
      if (topIdx >= 0) {
        const key = `stack${topIdx}`;
        row[key] = value;
      } else {
        other += value;
      }
    }
    if (other > 0) row.other = other;

    for (const stack of stacks) {
      const value = Number(row[stack.key] ?? 0);
      if (value > 0) {
        row.segments.push({
          name: stack.name,
          value,
          color: stack.color,
          changePct: null,
        });
      }
      if (row[stack.key] == null) row[stack.key] = 0;
    }
    row.total = row.segments.reduce((sum, s) => sum + s.value, 0);
    return row;
  });

  const rows = rawRows.map((row, idx) => {
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const segments = row.segments.map((seg) => {
      const prevVal = prev?.segments.find((s) => s.name === seg.name)?.value ?? 0;
      const changePct = prevVal > 0 ? ((seg.value - prevVal) / prevVal) * 100 : null;
      return { ...seg, changePct };
    });
    return { ...row, segments };
  });

  return { rows, stacks };
}

export function buildSourceItems(categoryWise: CategoryRevenueRow[]): {
  total: number;
  items: DashboardSourceItem[];
} {
  const sorted = [...categoryWise].filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const top = sorted.slice(0, 4);
  const total = sorted.reduce((sum, c) => sum + c.revenue, 0);
  const items: DashboardSourceItem[] = top.map((c, i) => ({
    categoryId: c.categoryId,
    name: c.categoryName,
    value: c.revenue,
    pct: total > 0 ? (c.revenue / total) * 100 : 0,
    color: SOURCE_STACK_COLORS[i] ?? SOURCE_STACK_COLORS[3],
  }));
  return { total, items };
}

/** Pill segment heights with gaps between stacked capsules. */
export function computePillSegmentHeights(
  totalBarHeight: number,
  values: number[],
  gapPx: number,
): number[] {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) return values.map(() => 0);
  const gaps = Math.max(0, positive.length - 1) * gapPx;
  const usable = Math.max(0, totalBarHeight - gaps);
  const sum = positive.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  return values.map((v) => (v > 0 ? (v / sum) * usable : 0));
}
