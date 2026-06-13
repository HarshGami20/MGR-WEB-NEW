import { useEffect, useMemo, useState } from "react";
import { GuideExactPreview } from "@/components/user-guide/guide-exact-preview";
import { GuideStepControls } from "@/components/user-guide/guide-step-controls";
import { highlightLabel, resolveStepHighlights } from "@/lib/user-guide/step-highlights";
import type { GuidePreviewKind } from "@/lib/user-guide/types";

type GuideInteractivePreviewProps = {
  screenId: string;
  moduleKey: string;
  preview: GuidePreviewKind;
  steps: string[];
  stepHighlights?: string[];
  activeStep?: number;
  onActiveStepChange?: (step: number) => void;
  size?: "default" | "full";
};

export function GuideInteractivePreview({
  screenId,
  moduleKey,
  preview,
  steps,
  stepHighlights,
  activeStep: controlledStep,
  onActiveStepChange,
  size = "default",
}: GuideInteractivePreviewProps) {
  const [internalStep, setInternalStep] = useState(0);
  const activeStep = controlledStep ?? internalStep;
  const setActiveStep = onActiveStepChange ?? setInternalStep;

  const highlights = useMemo(
    () => resolveStepHighlights(screenId, moduleKey, preview, steps, stepHighlights),
    [screenId, moduleKey, preview, steps, stepHighlights],
  );

  const activeHighlight = highlights[activeStep] ?? null;

  useEffect(() => {
    if (activeStep >= steps.length) setActiveStep(Math.max(0, steps.length - 1));
  }, [activeStep, steps.length, setActiveStep]);

  useEffect(() => {
    if (!activeHighlight) return;
    const el = document.querySelector(`[data-guide-target="${CSS.escape(activeHighlight)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [activeHighlight, screenId]);

  return (
    <div className="space-y-4">
      <GuideStepControls
        activeStep={activeStep}
        totalSteps={steps.length}
        stepLabel={steps[activeStep] ?? ""}
        onPrev={() => setActiveStep(Math.max(0, activeStep - 1))}
        onNext={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
      />
      <GuideExactPreview
        screenId={screenId}
        moduleKey={moduleKey}
        preview={preview}
        activeHighlight={activeHighlight}
        size={size}
      />
      <p className="text-[11px] text-center text-muted-foreground">
        Highlighting:{" "}
        <span className="font-medium text-primary">{highlightLabel(activeHighlight ?? "", moduleKey)}</span>
      </p>
    </div>
  );
}
