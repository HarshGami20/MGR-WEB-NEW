import { cn } from "@/lib/utils";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

type GuideTargetProps = {
  id: string;
  activeHighlight: string | null;
  /** When any highlight is active, dim non-active zones (not ancestors of the active zone). */
  dimOthers?: boolean;
  label?: string;
  className?: string;
  children: ReactNode;
};

export function GuideTarget({
  id,
  activeHighlight,
  dimOthers = true,
  label,
  className,
  children,
}: GuideTargetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hostsActiveDescendant, setHostsActiveDescendant] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !activeHighlight || activeHighlight === id) {
      setHostsActiveDescendant(false);
      return;
    }
    const match = root.querySelector(`[data-guide-target="${CSS.escape(activeHighlight)}"]`);
    setHostsActiveDescendant(match != null && match !== root);
  }, [activeHighlight, id]);

  const isActive = activeHighlight === id;
  const dimmed = dimOthers && activeHighlight != null && !isActive && !hostsActiveDescendant;

  return (
    <div
      ref={ref}
      data-guide-target={id}
      className={cn(
        "relative rounded-lg transition-all duration-300",
        isActive && "z-[3] ring-2 ring-primary ring-offset-2 shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]",
        dimmed && "opacity-[0.38] saturate-[0.65]",
        className,
      )}
    >
      {isActive ? (
        <div className="pointer-events-none absolute -top-2 left-3 z-[4] -translate-y-full">
          <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-md">
            {label ?? "Focus here"}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
