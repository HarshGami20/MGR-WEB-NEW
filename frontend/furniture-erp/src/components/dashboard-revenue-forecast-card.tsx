import { useMemo, useState } from "react";
import { Calendar, ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr } from "@/lib/format-currency";
import {
  buildForecastChartData,
  computeForecastYAxis,
  computePillSegmentHeights,
  type CategoryRevenueMatrixShape,
  type DashboardForecastRow,
} from "@/lib/dashboard-category-charts";

const CHART_HEIGHT = 220;
const BAR_WIDTH = 34;
const PILL_GAP = 5;
const PILL_RADIUS = 10;
const INACTIVE_FILL = "rgba(59, 113, 243, 0.08)";
const INACTIVE_STROKE = "rgba(59, 113, 243, 0.38)";

function formatCompactInr(value: number): string {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatChangePct(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function ForecastTooltip({ row }: { row: DashboardForecastRow }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm shadow-[0_8px_30px_rgba(15,23,42,0.12)] min-w-[200px] z-20">
      <p className="font-semibold text-foreground">{row.tooltipTitle}</p>
      <div className="mt-2.5 space-y-2">
        {row.segments.map((seg) => {
          const change = formatChangePct(seg.changePct);
          return (
            <div key={seg.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 rounded-[4px] shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="font-medium tabular-nums text-foreground">{formatInr(seg.value)}</span>
              </span>
              {change ? (
                <span className="text-xs font-semibold text-primary tabular-nums shrink-0">{change}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PillBarColumn({
  row,
  hovered,
  maxY,
  onHover,
  onLeave,
}: {
  row: DashboardForecastRow;
  hovered: boolean;
  maxY: number;
  onHover: () => void;
  onLeave: () => void;
}) {
  const barHeight =
    row.total > 0 && maxY > 0 ? Math.max(10, (row.total / maxY) * CHART_HEIGHT) : 6;
  const segmentValues = row.segments.map((s) => s.value);
  const segmentHeights = computePillSegmentHeights(barHeight, segmentValues, PILL_GAP);

  return (
    <div
      role="presentation"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="group flex flex-1 flex-col items-center justify-end min-w-0 cursor-default"
      style={{ height: CHART_HEIGHT + 28 }}
    >
      <div className="relative flex flex-col items-center justify-end w-full" style={{ height: CHART_HEIGHT }}>
        {row.total > 0 ? (
          <div className="flex flex-col-reverse items-center" style={{ width: BAR_WIDTH, gap: PILL_GAP }}>
            {row.segments.map((seg, i) => {
              const h = segmentHeights[i];
              if (h <= 0) return null;
              return (
                <div
                  key={seg.name}
                  style={{
                    width: BAR_WIDTH,
                    height: h,
                    borderRadius: PILL_RADIUS,
                    backgroundColor: seg.color,
                    opacity: hovered ? 1 : 0.92,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div
            style={{
              width: BAR_WIDTH,
              height: barHeight,
              borderRadius: PILL_RADIUS,
              backgroundColor: INACTIVE_FILL,
              border: `1.5px solid ${INACTIVE_STROKE}`,
            }}
          />
        )}
      </div>
      <span
        className={cn(
          "mt-2 text-xs font-semibold",
          hovered ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {row.label}
      </span>
    </div>
  );
}

type Props = {
  matrix: CategoryRevenueMatrixShape | null | undefined;
  year: number;
  yearOptions: number[];
  onYearChange: (year: number) => void;
  loading?: boolean;
};

export function DashboardRevenueForecastCard({
  matrix,
  year,
  yearOptions,
  onYearChange,
  loading,
}: Props) {
  const { rows, stacks } = useMemo(
    () => (matrix ? buildForecastChartData(matrix) : { rows: [], stacks: [] }),
    [matrix],
  );

  const visibleRows = useMemo(() => rows.slice(0, 9), [rows]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxDataTotal = Math.max(0, ...visibleRows.map((r) => r.total));
  const { max: yMax, ticks: yTicks } = useMemo(
    () => computeForecastYAxis(maxDataTotal),
    [maxDataTotal],
  );

  const hoveredRow = hoveredIndex != null ? visibleRows[hoveredIndex] : null;

  return (
    <div className="rounded-3xl border border-border bg-card p-5 md:p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Revenue Forecast</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground z-10" />
            <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-xs font-medium text-foreground z-10">
              Monthly
            </span>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground z-10" />
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="appearance-none rounded-xl border border-border bg-background pl-8 pr-8 py-1.5 text-xs font-medium text-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer min-w-[108px]"
              aria-label="Filter forecast by year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y} className="text-foreground">
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground"
            aria-label="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 flex-1 min-h-[320px] overflow-visible">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : visibleRows.length === 0 || stacks.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-2xl">
            No category revenue for {year}
          </div>
        ) : (
          <div className="flex gap-2 h-full">
            <div
              className="flex flex-col justify-between shrink-0 text-[11px] text-muted-foreground tabular-nums pr-1"
              style={{ height: CHART_HEIGHT, marginBottom: 28 }}
            >
              {[...yTicks].reverse().map((tick) => (
                <span key={tick}>₹{formatCompactInr(tick)}</span>
              ))}
            </div>

            <div
              className="flex-1 min-w-0 relative"
              style={{ height: CHART_HEIGHT + 28 }}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {hoveredRow && hoveredRow.total > 0 && hoveredIndex != null ? (
                <div
                  className="absolute z-10 -translate-x-1/2 pointer-events-none"
                  style={{
                    left: `${((hoveredIndex + 0.5) / visibleRows.length) * 100}%`,
                    bottom: CHART_HEIGHT + 8,
                  }}
                >
                  <ForecastTooltip row={hoveredRow} />
                </div>
              ) : null}

              <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: CHART_HEIGHT }}>
                {yTicks.map((tick) => {
                  const top = CHART_HEIGHT - (tick / yMax) * CHART_HEIGHT;
                  return (
                    <div
                      key={tick}
                      className="absolute left-0 right-0 border-t border-dashed border-border/80"
                      style={{ top }}
                    />
                  );
                })}
              </div>

              <div className="absolute inset-x-0 top-0 flex items-end gap-1" style={{ height: CHART_HEIGHT + 28 }}>
                {visibleRows.map((row, index) => (
                  <PillBarColumn
                    key={row.periodKey}
                    row={row}
                    hovered={hoveredIndex === index}
                    maxY={yMax}
                    onHover={() => setHoveredIndex(index)}
                    onLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {stacks.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-5 text-xs text-muted-foreground">
          {stacks.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate max-w-[120px]">{s.name}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
