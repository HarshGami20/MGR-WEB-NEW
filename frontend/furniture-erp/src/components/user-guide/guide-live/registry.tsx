import { GuideLiveDetailPreview } from "@/components/user-guide/guide-live/detail-preview";
import { GuideLiveFormPreview } from "@/components/user-guide/guide-live/form-preview";
import { GuideLiveListPreview } from "@/components/user-guide/guide-live/list-preview";
import {
  GuideLiveCalculatorPreview,
  GuideLiveComplaintsFormPreview,
  GuideLiveDashboardPreview,
  GuideLivePartnerPreview,
  GuideLiveSettingsPreview,
} from "@/components/user-guide/guide-live/special-preview";
import { GuideLiveDeliveriesPreview } from "@/components/user-guide/guide-live/deliveries-preview";
import { GuideLiveProductsPreview } from "@/components/user-guide/guide-live/products-preview";
import { GuideLiveCategoriesPreview } from "@/components/user-guide/guide-live/categories-preview";
import { GuideLiveInventoryPreview } from "@/components/user-guide/guide-live/inventory-preview";
import { GuideLivePaymentsPreview } from "@/components/user-guide/guide-live/payments-preview";
import { GuideLiveReportsPreview } from "@/components/user-guide/guide-live/reports-preview";
import { GuideLiveProcurementPartnersPreview } from "@/components/user-guide/guide-live/procurement-partners-preview";
import type { GuidePreviewKind } from "@/lib/user-guide/types";

type GuideLivePreviewProps = {
  screenId: string;
  moduleKey: string;
  preview: GuidePreviewKind;
  activeHighlight: string | null;
};

/** Renders guide previews that match live ERP pages — full-width main content, no mini sidebar. */
export function GuideLivePreview({ screenId, moduleKey, preview, activeHighlight }: GuideLivePreviewProps) {
  if (screenId === "dashboard-overview") {
    return <GuideLiveDashboardPreview activeHighlight={activeHighlight} />;
  }
  if (screenId === "settings-view" || screenId === "settings-edit") {
    return <GuideLiveSettingsPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId === "curtain-calculator") {
    return <GuideLiveCalculatorPreview activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("deliveries-") || screenId.startsWith("drivers-")) {
    return <GuideLiveDeliveriesPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("products-")) {
    return <GuideLiveProductsPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("categories-")) {
    return <GuideLiveCategoriesPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("inventory-")) {
    return <GuideLiveInventoryPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("payments-")) {
    return <GuideLivePaymentsPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("reports-") || screenId === "reports-hub") {
    return <GuideLiveReportsPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("suppliers-") || screenId.startsWith("manufacturers-")) {
    return <GuideLiveProcurementPartnersPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }
  if (screenId === "partner-po-update") {
    return <GuideLiveFormPreview screenId="po-edit" moduleKey="purchaseOrders" activeHighlight={activeHighlight} />;
  }
  if (screenId.startsWith("partner-")) {
    const partner = GuideLivePartnerPreview({ screenId, activeHighlight });
    if (partner) return partner;
  }
  if (screenId === "complaints-create" || screenId === "complaints-update") {
    return <GuideLiveComplaintsFormPreview screenId={screenId} activeHighlight={activeHighlight} />;
  }

  if (preview === "form") {
    return <GuideLiveFormPreview screenId={screenId} moduleKey={moduleKey} activeHighlight={activeHighlight} />;
  }
  if (preview === "detail") {
    return <GuideLiveDetailPreview screenId={screenId} moduleKey={moduleKey} activeHighlight={activeHighlight} />;
  }

  return <GuideLiveListPreview screenId={screenId} moduleKey={moduleKey} activeHighlight={activeHighlight} />;
}
