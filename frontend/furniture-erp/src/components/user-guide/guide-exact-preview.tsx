import { GuideLivePreview } from "@/components/user-guide/guide-live/registry";
import type { GuidePreviewKind } from "@/lib/user-guide/types";

type ExactPreviewProps = {
  screenId: string;
  moduleKey: string;
  preview: GuidePreviewKind;
  activeHighlight: string | null;
  size?: "default" | "full";
};

/** Full-width live screen replica for the user guide (matches real ERP pages). */
export function GuideExactPreview({ screenId, moduleKey, preview, activeHighlight }: ExactPreviewProps) {
  return (
    <GuideLivePreview
      screenId={screenId}
      moduleKey={moduleKey}
      preview={preview}
      activeHighlight={activeHighlight}
    />
  );
}
