import type { PermissionUiAction } from "@/lib/permissions";

export type GuideAudience = "staff" | "partner" | "all";

export type GuidePreviewKind =
  | "dashboard"
  | "list"
  | "detail"
  | "form"
  | "settings"
  | "calculator"
  | "reports";

export type GuideScreen = {
  id: string;
  title: string;
  route: string;
  /** Minimum permission required to see this guide section */
  permission: PermissionUiAction;
  summary: string;
  steps: string[];
  tips?: string[];
  preview: GuidePreviewKind;
  /** Optional per-step highlight target ids (auto-generated when omitted) */
  stepHighlights?: string[];
};

export type GuideModule = {
  key: string;
  label: string;
  icon: string;
  section: string;
  audience: GuideAudience;
  intro: string;
  screens: GuideScreen[];
};

export type VisibleGuideModule = GuideModule & {
  visibleScreens: GuideScreen[];
};
