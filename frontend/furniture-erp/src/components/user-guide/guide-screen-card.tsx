import { Badge } from "@/components/ui/badge";
import { PERMISSION_COLORS, PERMISSION_LABELS } from "@/lib/user-guide/filter-guides";
import type { GuideScreen } from "@/lib/user-guide/types";
import { GuideInteractivePreview } from "./guide-interactive-preview";
import { cn } from "@/lib/utils";
import { Route } from "lucide-react";
import { useState } from "react";

type GuideScreenCardProps = {
  screen: GuideScreen;
  moduleKey: string;
  index: number;
  layout?: "split" | "full";
};

function renderStepText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function GuideScreenCard({ screen, moduleKey, index, layout = "split" }: GuideScreenCardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const isFull = layout === "full";

  return (
    <article
      id={`guide-${screen.id}`}
      className={cn(
        "rounded-2xl border bg-card shadow-sm overflow-hidden scroll-mt-24",
        isFull && "border-primary/10",
      )}
    >
      <div className="border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-2 justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Guide · {index + 1}
            </p>
            <h3 className="text-lg font-semibold text-foreground mt-1">{screen.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{screen.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Badge variant="outline" className="gap-1 text-[11px] font-normal">
              <Route className="h-3 w-3" />
              {screen.route}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[11px] font-medium border ${PERMISSION_COLORS[screen.permission]}`}
            >
              Requires {PERMISSION_LABELS[screen.permission]}
            </Badge>
          </div>
        </div>
      </div>

      {isFull ? (
        <div className="flex flex-col">
          <div className="p-4 sm:p-6 bg-muted/15 border-b border-border/60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
              Screen preview — use Next to walk through each step
            </p>
            <GuideInteractivePreview
              screenId={screen.id}
              moduleKey={moduleKey}
              preview={screen.preview}
              steps={screen.steps}
              stepHighlights={screen.stepHighlights}
              activeStep={activeStep}
              onActiveStepChange={setActiveStep}
              size="full"
            />
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Steps — click to jump to that highlight
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {screen.steps.map((step, i) => {
                const isActive = i === activeStep;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveStep(i)}
                    className={cn(
                      "flex gap-2.5 text-left text-sm leading-relaxed rounded-xl px-3 py-3 transition-colors border h-full",
                      isActive
                        ? "border-primary/30 bg-primary/5 text-foreground shadow-sm"
                        : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">{renderStepText(step)}</span>
                  </button>
                );
              })}
            </div>
            {screen.tips?.length ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200/80 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Tips</p>
                <ul className="space-y-1">
                  {screen.tips.map((tip, i) => (
                    <li key={i} className="text-xs text-amber-900/90 leading-relaxed">
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-0 lg:divide-x divide-border/60">
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                How to use — click a step or use Next in preview
              </p>
              <ol className="space-y-2">
                {screen.steps.map((step, i) => {
                  const isActive = i === activeStep;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setActiveStep(i)}
                        className={cn(
                          "flex w-full gap-3 text-left text-sm leading-relaxed rounded-xl px-3 py-2.5 transition-colors border",
                          isActive
                            ? "border-primary/30 bg-primary/5 text-foreground shadow-sm"
                            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{renderStepText(step)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            {screen.tips?.length ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200/80 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Tips</p>
                <ul className="space-y-1">
                  {screen.tips.map((tip, i) => (
                    <li key={i} className="text-xs text-amber-900/90 leading-relaxed">
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="p-5 sm:p-6 bg-muted/10">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
              Interactive screen preview
            </p>
            <GuideInteractivePreview
              screenId={screen.id}
              moduleKey={moduleKey}
              preview={screen.preview}
              steps={screen.steps}
              stepHighlights={screen.stepHighlights}
              activeStep={activeStep}
              onActiveStepChange={setActiveStep}
            />
          </div>
        </div>
      )}
    </article>
  );
}
