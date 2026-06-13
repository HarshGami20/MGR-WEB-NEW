import type { GuidePreviewKind } from "@/lib/user-guide/types";

/** Default highlight target ids per step — maps 1:1 with step text order. */
export function defaultStepHighlights(
  screenId: string,
  moduleKey: string,
  preview: GuidePreviewKind,
  stepCount: number,
): string[] {
  let pool: string[] = [];

  if (preview === "dashboard") {
    pool = ["branch-picker", "kpi-cards", "charts", "charts"];
  } else if (preview === "settings") {
    pool = ["page-header", "settings-form", "form-save"];
  } else if (preview === "calculator") {
    pool = ["page-header", "calc-inputs", "calc-result"];
  } else if (preview === "reports") {
    pool = ["page-header", "report-filters", "report-types", "report-types"];
  } else if (screenId === "orders-create") {
    pool = [
      "branch-picker",
      "form-header",
      "order-details",
      "gst-section",
      "line-item-mode",
      "product-select",
      "variant-select",
      "line-qty-price",
      "add-item",
      "delivery-section",
      "payment-sidebar",
      "challan-section",
      "form-save",
    ];
  } else if (screenId === "orders-edit") {
    pool = [
      "form-header",
      "order-details",
      "order-items-section",
      "line-item-mode",
      "product-select",
      "variant-select",
      "line-qty-price",
      "add-item",
      "payment-sidebar",
      "challan-section",
      "form-save",
    ];
  } else if (screenId === "po-create") {
    pool = [
      "branch-picker",
      "form-header",
      "po-type",
      "po-vendor",
      "line-item-mode",
      "product-select",
      "variant-select",
      "line-qty-price",
      "add-item",
      "expected-delivery",
      "form-save",
    ];
  } else if (screenId === "po-edit") {
    pool = [
      "form-header",
      "po-type",
      "po-vendor",
      "order-items-section",
      "line-item-mode",
      "product-select",
      "variant-select",
      "line-qty-price",
      "expected-delivery",
      "form-save",
    ];
  } else if (screenId === "deliveries-calendar") {
    pool = [
      "branch-picker",
      "page-header",
      "delivery-tabs",
      "delivery-date-filter",
      "delivery-schedule-list",
      "delivery-schedule-list",
      "order-view-link",
    ];
  } else if (screenId === "deliveries-schedule") {
    pool = [
      "branch-picker",
      "page-header",
      "delivery-section",
      "delivery-date-field",
      "delivery-driver-field",
      "delivery-section",
      "form-save",
    ];
  } else if (screenId === "deliveries-update") {
    pool = [
      "branch-picker",
      "page-header",
      "delivery-date-filter",
      "delivery-schedule-list",
      "driver-assign",
      "delivery-status",
      "order-view-link",
    ];
  } else if (screenId === "deliveries-cancel") {
    pool = [
      "page-header",
      "delivery-section",
      "delivery-date-field",
      "delivery-driver-field",
      "clear-delivery",
      "form-save",
    ];
  } else if (screenId === "drivers-list") {
    pool = [
      "branch-picker",
      "page-header",
      "search",
      "data-table",
      "header-action-add",
      "table-actions",
      "table-actions",
    ];
  } else if (screenId === "drivers-detail") {
    pool = [
      "detail-header",
      "driver-deliveries-table",
      "driver-deliveries-table",
      "driver-deliveries-table",
      "payment-history",
      "payment-summary",
      "record-payment",
    ];
  } else if (screenId === "products-list") {
    pool = ["page-header", "search", "filters", "data-table", "header-action-add", "table-actions", "table-actions"];
  } else if (screenId === "products-create") {
    pool = [
      "form-header",
      "product-details",
      "inventory-type",
      "variants-section",
      "product-photos",
      "pricing-stock",
      "gst-info",
      "form-save",
    ];
  } else if (screenId === "products-detail") {
    pool = [
      "detail-header",
      "product-gallery",
      "product-stats",
      "product-description",
      "variants-table",
      "detail-edit-btn",
      "delete-action",
    ];
  } else if (screenId === "products-edit") {
    pool = [
      "form-header",
      "product-details",
      "inventory-type",
      "variants-section",
      "product-photos",
      "pricing-stock",
      "form-save",
    ];
  } else if (screenId === "products-delete") {
    pool = ["page-header", "data-table", "delete-action", "delete-dialog"];
  } else if (screenId === "categories-list") {
    pool = [
      "page-header",
      "page-header",
      "header-action-add-main",
      "data-table",
      "table-actions",
      "table-actions",
    ];
  } else if (screenId === "categories-add-main") {
    pool = [
      "header-action-add-main",
      "category-dialog",
      "category-name",
      "main-category-note",
      "form-save",
      "form-cancel",
    ];
  } else if (screenId === "categories-add-sub") {
    pool = [
      "header-action-add-sub",
      "category-dialog",
      "category-name",
      "parent-category",
      "form-save",
      "parent-category",
    ];
  } else if (screenId === "categories-edit") {
    pool = [
      "table-actions",
      "category-dialog",
      "category-name",
      "parent-category",
      "parent-category",
      "form-save",
    ];
  } else if (screenId === "categories-delete") {
    pool = ["table-actions", "delete-action", "delete-dialog", "delete-dialog", "delete-dialog"];
  } else if (screenId === "inventory-list") {
    pool = ["page-header", "page-header", "filter-date-range", "filters", "data-table", "data-table"];
  } else if (screenId === "inventory-low-stock") {
    pool = [
      "filter-low-stock",
      "low-stock-panel",
      "low-stock-table",
      "restock-action",
      "low-stock-table",
      "filter-low-stock",
    ];
  } else if (screenId === "inventory-adjust") {
    pool = [
      "header-action-adjust",
      "adjust-dialog",
      "product-variant-select",
      "movement-type",
      "adjust-quantity",
      "adjust-notes",
      "form-save",
      "form-cancel",
    ];
  } else if (screenId === "inventory-export") {
    pool = [
      "header-action-export",
      "export-dialog",
      "export-branch",
      "export-category",
      "export-options",
      "export-date-filter",
      "export-save",
    ];
  } else if (screenId === "payments-list") {
    pool = ["page-header", "branch-selector", "payment-tabs", "filters", "data-table", "data-table"];
  } else if (screenId === "payments-due") {
    pool = ["payment-tabs", "due-filters", "due-table", "due-table", "due-table", "header-action-record"];
  } else if (screenId === "payments-followups") {
    pool = [
      "payment-tabs",
      "followups-reminders",
      "followups-reminders",
      "followups-by-date",
      "followup-date-picker",
      "followups-by-date",
    ];
  } else if (screenId === "payments-record") {
    pool = [
      "header-action-record",
      "payment-dialog",
      "order-picker",
      "order-due-summary",
      "payment-amount",
      "payment-mode",
      "payment-notes",
      "form-save",
      "form-cancel",
    ];
  } else if (screenId === "payments-record-order") {
    pool = [
      "order-payment-summary",
      "order-record-payment",
      "payment-amount",
      "payment-mode",
      "form-save",
      "payment-history",
      "order-followup-panel",
    ];
  } else if (screenId === "reports-overview" || screenId === "reports-hub") {
    pool = ["page-header", "kpi-cards", "kpi-cards", "report-filters", "revenue-table", "category-table"];
  } else if (screenId === "reports-revenue") {
    pool = ["filter-view-mode", "filter-year", "filter-category", "revenue-table", "view-mode-badges", "revenue-export-csv"];
  } else if (screenId === "reports-daily") {
    pool = ["filter-view-mode", "filter-month", "filter-year", "view-mode-badges", "revenue-table", "revenue-export-csv"];
  } else if (screenId === "reports-category") {
    pool = ["category-table", "category-table", "category-table", "category-table", "category-table", "category-export-csv"];
  } else if (screenId === "reports-export-orders") {
    pool = [
      "header-action-export-orders",
      "orders-export-dialog",
      "export-date-filter",
      "export-branch",
      "export-category",
      "export-save",
    ];
  } else if (screenId === "suppliers-list") {
    pool = ["page-header", "search", "data-table", "table-actions", "table-actions", "data-table"];
  } else if (screenId === "suppliers-create") {
    pool = [
      "header-action-add",
      "partner-dialog",
      "company-name",
      "contact-mobile",
      "portal-password",
      "gst-number",
      "address-field",
      "form-save",
    ];
  } else if (screenId === "suppliers-edit") {
    pool = ["table-actions", "partner-dialog", "company-name", "contact-person", "portal-password", "gst-number", "form-save"];
  } else if (screenId === "suppliers-delete") {
    pool = ["table-actions", "delete-action", "delete-dialog"];
  } else if (screenId === "manufacturers-list") {
    pool = ["page-header", "header-action-add", "search", "data-table", "table-actions"];
  } else if (screenId === "manufacturers-create") {
    pool = [
      "header-action-add",
      "partner-dialog",
      "company-name",
      "contact-person",
      "specialization",
      "address-field",
      "portal-password",
      "form-save",
    ];
  } else if (screenId === "manufacturers-edit") {
    pool = ["table-actions", "partner-dialog", "company-name", "specialization", "portal-password", "form-save"];
  } else if (screenId === "manufacturers-delete") {
    pool = ["table-actions", "delete-action", "delete-dialog"];
  } else if (preview === "reports") {
    pool = ["page-header", "kpi-cards", "report-filters", "revenue-table", "category-table"];
  } else if (preview === "form") {
    if (screenId.includes("delete")) {
      pool = ["table-actions", "delete-action", "delete-dialog"];
    } else {
      pool = ["page-header", "header-action-add", "form-fields", "form-save"];
    }
  } else if (preview === "detail") {
    pool = ["detail-header", "detail-content", "detail-edit-btn", "detail-content"];
  } else if (screenId.includes("delete")) {
    pool =
      stepCount <= 3
        ? ["table-actions", "delete-action", "delete-dialog"]
        : ["page-header", "table-actions", "delete-action", "delete-dialog"];
  } else {
    pool = ["page-header", "search", "filters", "data-table", "table-actions"];
  }

  if (stepCount <= pool.length) return pool.slice(0, stepCount);

  const out = [...pool];
  while (out.length < stepCount) {
    out.push(pool[pool.length - 1] ?? "data-table");
  }
  return out;
}

/** Align custom highlights to step count — never discard the whole array on off-by-one. */
export function resolveStepHighlights(
  screenId: string,
  moduleKey: string,
  preview: GuidePreviewKind,
  steps: string[],
  existing?: string[],
): string[] {
  const defaults = defaultStepHighlights(screenId, moduleKey, preview, steps.length);

  if (!existing?.length) return defaults;
  if (existing.length === steps.length) return existing;

  if (existing.length > steps.length) return existing.slice(0, steps.length);

  const out = [...existing];
  while (out.length < steps.length) {
    out.push(defaults[out.length] ?? defaults[defaults.length - 1] ?? "data-table");
  }
  return out;
}

/** Human label for a highlight target id (shown in preview tooltip). */
export function highlightLabel(targetId: string, moduleKey: string): string {
  const labels: Record<string, string> = {
    [`nav-${moduleKey}`]: "Open from sidebar",
    "branch-picker": "Branch selector (header)",
    "page-header": "Page header",
    "header-action-add": "Create / Add button",
    search: "Search box",
    filters: "Filters panel",
    "data-table": "Results table",
    "table-actions": "Row actions",
    "delete-action": "Delete button",
    "delete-dialog": "Confirmation dialog",
    "form-fields": "Form fields",
    "form-save": "Save button",
    "detail-header": "Record header",
    "detail-content": "Detail sections",
    "detail-edit-btn": "Edit button",
    "kpi-cards": "KPI summary cards",
    charts: "Charts & analytics",
    "settings-form": "Settings form",
    "calc-inputs": "Calculator inputs",
    "calc-result": "Result",
    "report-types": "Report tables",
    "report-filters": "Report filters",
    "form-header": "Form header / open dialog",
    "order-details": "Customer & order details",
    "gst-section": "GST invoice toggle",
    "order-items-section": "Line items section",
    "line-item-mode": "From catalog / Custom",
    "product-select": "Product picker",
    "variant-select": "Variant picker",
    "line-qty-price": "Quantity & unit price",
    "add-item": "Add item button",
    "delivery-section": "Delivery section (order form)",
    "payment-sidebar": "Payment summary",
    "challan-section": "Challan upload",
    "po-type": "PO type",
    "po-vendor": "Supplier / manufacturer",
    "expected-delivery": "Expected delivery date",
    "delivery-tabs": "Booked / Drivers tabs",
    "delivery-date-filter": "Date range filter",
    "delivery-schedule-list": "Booked deliveries list",
    "driver-assign": "Assign driver",
    "delivery-status": "Delivery status",
    "order-view-link": "View order",
    "delivery-date-field": "Delivery date",
    "delivery-driver-field": "Driver",
    "clear-delivery": "Clear delivery booking",
    "driver-deliveries-table": "Driver deliveries table",
    "payment-history": "Payment history",
    "payment-summary": "Payment summary",
    "record-payment": "Record payment",
    "slot-filters": "Slot filters",
    "slots-table": "Delivery slots table",
    "product-details": "Product details fields",
    "inventory-type": "Single SKU vs variants",
    "variants-section": "Variants section",
    "add-variant": "Add variant button",
    "product-photos": "Product photos upload",
    "pricing-stock": "Pricing & stock alerts",
    "gst-info": "GST rate note",
    "product-gallery": "Photo gallery",
    "product-stats": "Stock & pricing stats",
    "product-description": "Description",
    "variants-table": "Variations table",
    "header-action-add-main": "Add main category",
    "header-action-add-sub": "Add subcategory",
    "category-dialog": "Category dialog",
    "category-name": "Category name field",
    "parent-category": "Main category (parent)",
    "main-category-note": "Top-level category note",
    "form-cancel": "Cancel button",
    "header-action-export": "Export to Excel",
    "header-action-adjust": "Adjust Stock",
    "filter-date-range": "Date range filter",
    "filter-category": "Category filter",
    "filter-movement-type": "Movement type filter",
    "filter-source": "Source filter",
    "filter-low-stock": "Low Stock toggle",
    "low-stock-panel": "Low Stock Alerts panel",
    "low-stock-table": "Low stock products table",
    "restock-action": "Restock button",
    "adjust-dialog": "Adjust Inventory dialog",
    "product-variant-select": "Product & variant picker",
    "movement-type": "Movement type",
    "adjust-quantity": "Quantity",
    "adjust-notes": "Notes / Reason",
    "export-dialog": "Export dialog",
    "export-branch": "Export branch",
    "export-movement-type": "Export movement type",
    "export-category": "Export category",
    "export-options": "Include stock options",
    "export-date-filter": "Export date filter",
    "export-save": "Export button",
    "branch-selector": "Branch filter",
    "header-action-record": "Record Payment button",
    "payment-tabs": "All Payments / Due / Follow Ups tabs",
    "filter-order": "Order filter",
    "due-filters": "Due tab filters",
    "due-table": "Due orders table",
    "followups-reminders": "Pending reminders",
    "followups-by-date": "Follow-ups by date",
    "followup-date-picker": "Follow-up date picker",
    "payment-dialog": "Record Payment dialog",
    "order-picker": "Order combobox",
    "order-due-summary": "Order balance summary",
    "payment-amount": "Payment amount",
    "payment-mode": "Payment mode",
    "cheque-number": "Cheque number",
    "payment-notes": "Payment notes",
    "order-payment-summary": "Payment summary sidebar",
    "order-record-payment": "Record payment section",
    "order-followup-panel": "Payment follow-ups panel",
    "header-action-export-orders": "Export to Excel (orders)",
    "filter-view-mode": "Monthly / Yearly view",
    "filter-month": "Month filter",
    "filter-year": "Year filter",
    "view-mode-badges": "Active view badges",
    "revenue-table": "Year / month revenue table",
    "revenue-export-csv": "Export revenue CSV",
    "category-table": "Category-wise revenue matrix",
    "category-export-csv": "Export category CSV",
    "orders-export-dialog": "Export Orders dialog",
    "partner-dialog": "Add / Edit dialog",
    "company-name": "Company name",
    "contact-person": "Contact person",
    "contact-mobile": "Mobile number",
    "portal-password": "Portal password",
    "contact-email": "Email",
    "gst-number": "GST number",
    "specialization": "Specialization",
    "address-field": "Address",
  };
  return labels[targetId] ?? "Focus here";
}
