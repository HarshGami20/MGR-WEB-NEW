import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type GuideStepControlsProps = {
  activeStep: number;
  totalSteps: number;
  stepLabel: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function GuideStepControls({
  activeStep,
  totalSteps,
  stepLabel,
  onPrev,
  onNext,
  className,
}: GuideStepControlsProps) {
  const atStart = activeStep <= 0;
  const atEnd = activeStep >= totalSteps - 1;

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 rounded-full transition-all",
              i === activeStep ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
            )}
          />
        ))}
        <span className="text-xs text-muted-foreground ml-1">
          Step {activeStep + 1} of {totalSteps}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={atStart} onClick={onPrev} className="h-8">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button type="button" size="sm" disabled={atEnd} onClick={onNext} className="h-8">
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground sm:max-w-[280px] sm:text-right leading-relaxed">{stepLabel}</p>
    </div>
  );
}
