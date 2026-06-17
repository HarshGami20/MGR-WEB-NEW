import { useId, useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Clock, Package, Truck, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryDayStats } from "@/lib/delivery-stats";

type Chip = { label: string; value: number; icon: typeof Package };

const ARC_VIEW_W = 320;
const ARC_VIEW_H = 72;

/** Quadratic Bézier B(t) */
function quadPoint(
  t: number,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
) {
  const u = 1 - t;
  return {
    x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  };
}

const ARC_P0: readonly [number, number] = [18, 54];
const ARC_P1: readonly [number, number] = [160, 8];
const ARC_P2: readonly [number, number] = [302, 54];
const ARC_PATH = `M ${ARC_P0[0]} ${ARC_P0[1]} Q ${ARC_P1[0]} ${ARC_P1[1]} ${ARC_P2[0]} ${ARC_P2[1]}`;

function CurvedProgressBar({ pct }: { pct: number }) {
  const gradientId = useId().replace(/:/g, "");
  const clamped = Math.max(0, Math.min(100, pct));
  const t = clamped / 100;

  const marker = useMemo(() => quadPoint(t, ARC_P0, ARC_P1, ARC_P2), [t]);
  const markerLeftPct = (marker.x / ARC_VIEW_W) * 100;
  const markerTopPct = (marker.y / ARC_VIEW_H) * 100;

  return (
    <div className="relative w-full pt-6 pb-1">
      <div
        className="pointer-events-none absolute z-10 flex flex-col items-center"
        style={{
          left: `${markerLeftPct}%`,
          top: `${markerTopPct}%`,
          transform: "translate(-50%, calc(-100% - 10px))",
        }}
      >
        <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold tabular-nums text-foreground shadow-lg">
          {clamped}%
        </span>
        <span
          className="mt-px block h-0 w-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-white"
          aria-hidden
        />
      </div>

      <svg
        viewBox={`0 0 ${ARC_VIEW_W} ${ARC_VIEW_H}`}
        className="w-full h-[72px] block"
        aria-hidden
        role="img"
        aria-label={`Delivery progress ${clamped} percent`}
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={ARC_P0[0]}
            y1={ARC_P0[1]}
            x2={ARC_P2[0]}
            y2={ARC_P2[1]}
          >
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="45%" stopColor="#fb923c" />
            <stop offset="75%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
        </defs>

        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        <path
          d={ARC_PATH}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${clamped} ${100 - clamped}`}
        />

        <circle cx={marker.x} cy={marker.y} r="7" fill="white" className="drop-shadow-md" />
        <circle cx={marker.x} cy={marker.y} r="4" fill="rgba(15,10,25,0.12)" />
      </svg>

      <div className="flex justify-between px-1 text-[10px] font-medium text-white/50 -mt-1">
        <span>0%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export function DeliveryProgressKpi({
  title = "Today's delivery progress",
  stats,
  loading,
  linkHref = "/deliveries",
  className,
}: {
  title?: string;
  stats: DeliveryDayStats;
  loading?: boolean;
  linkHref?: string;
  className?: string;
}) {
  const chips: Chip[] = [
    { label: "Pending", value: stats.pending, icon: Clock },
    { label: "Out for delivery", value: stats.outForDelivery, icon: Truck },
    { label: "Delivered", value: stats.delivered, icon: CheckCircle2 },
    { label: "Scheduled", value: stats.scheduled, icon: Package },
  ];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 p-5 md:p-6 text-white shadow-[0_18px_48px_rgba(15,10,25,0.35)] min-h-[280px] flex flex-col",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(165deg, rgba(24, 6, 45, 0.85) 0%, rgba(24, 9, 45, 0.98) 45%, rgba(221, 221, 221, 0.99) 100%), url('./mgrcasa.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundBlendMode: "overlay, normal",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-black/50" />

      <div className="relative flex items-start justify-between gap-2 mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-white/95">{title}</h2>
        <Link
          href={linkHref}
          className="rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open deliveries"
        >
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </div>

      {loading ? (
        <div className="relative flex-1 flex items-center justify-center text-sm text-white/60">
          Loading delivery data…
        </div>
      ) : (
        <>
          <div className="relative grid grid-cols-2 gap-2.5 sm:gap-3 mb-6">
            {chips.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-sm px-3 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-white/75" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] text-white/65 truncate">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mt-auto pt-1 overflow-visible">
            <CurvedProgressBar pct={stats.progressPct} />
            <p className="text-center text-xs text-white/70 mt-2 tabular-nums">
              {stats.delivered} delivered / {stats.dailyGoal} scheduled ({stats.progressPct}%)
            </p>
          </div>
        </>
      )}
    </div>
  );
}
