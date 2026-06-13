import type { GuideNavItem } from "@/components/user-guide/guide-app-chrome";
import { DUMMY } from "@/lib/user-guide/mock-data";

export type GuideTableColumn = {
  header: string;
  key: string;
  align?: "left" | "right";
  cellClassName?: string;
};

export type GuideListPageConfig = {
  screenId: string;
  nav: GuideNavItem;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  showCreateButton?: boolean;
  createLabel?: string;
  filterLabels?: string[];
  columns: GuideTableColumn[];
  rows: Record<string, string>[];
  showRowActions?: boolean;
};

export type GuideFormPageConfig = {
  screenId: string;
  nav: GuideNavItem;
  title: string;
  subtitle: string;
  formTitle: string;
  fields: { label: string; value?: string; span?: 1 | 2 }[];
  showDeleteDialog?: boolean;
};

export type GuideDetailPageConfig = {
  screenId: string;
  nav: GuideNavItem;
  title: string;
  subtitle: string;
  badges?: string[];
  fields: { label: string; value: string }[];
  sections?: { title: string; lines: string[] }[];
  showEditButton?: boolean;
};

const NAV: Record<string, GuideNavItem> = {
  dashboard: { label: "Dashboard", moduleKey: "dashboard", icon: "LayoutDashboard", section: "Menu" },
  purchaseOrders: { label: "Purchase orders", moduleKey: "purchaseOrders", icon: "ClipboardList", section: "Menu" },
  orders: { label: "Orders", moduleKey: "orders", icon: "ShoppingCart", section: "Orders" },
  deliveries: { label: "Deliveries", moduleKey: "deliveries", icon: "CalendarClock", section: "Orders" },
  products: { label: "Products", moduleKey: "products", icon: "Package", section: "Products" },
  categories: { label: "Categories", moduleKey: "categories", icon: "Tags", section: "Products" },
  inventory: { label: "Inventory", moduleKey: "inventory", icon: "Archive", section: "Products" },
  invoices: { label: "Invoices", moduleKey: "invoices", icon: "FileText", section: "Sales & billing" },
  payments: { label: "Payments", moduleKey: "payments", icon: "CreditCard", section: "Sales & billing" },
  reports: { label: "Reports", moduleKey: "reports", icon: "BarChart3", section: "Sales & billing" },
  tools: { label: "Curtain calculator", moduleKey: "tools", icon: "Calculator", section: "Tools" },
  suppliers: { label: "Suppliers", moduleKey: "suppliers", icon: "Building2", section: "Procurement" },
  manufacturers: { label: "Manufacturers", moduleKey: "manufacturers", icon: "Factory", section: "Procurement" },
  branches: { label: "Branches", moduleKey: "branches", icon: "GitBranch", section: "Administration" },
  users: { label: "Users", moduleKey: "users", icon: "Users", section: "Administration" },
  roles: { label: "Roles", moduleKey: "roles", icon: "ShieldCheck", section: "Administration" },
  activityLogs: { label: "Activity logs", moduleKey: "activityLogs", icon: "ScrollText", section: "Administration" },
  complaints: { label: "Complaints", moduleKey: "complaints", icon: "Headphones", section: "General" },
  settings: { label: "Settings", moduleKey: "settings", icon: "Settings", section: "General" },
};

function nav(key: string): GuideNavItem {
  return NAV[key] ?? NAV.dashboard;
}

export const GUIDE_LIST_CONFIGS: Record<string, GuideListPageConfig> = {
  "orders-list": {
    screenId: "orders-list",
    nav: nav("orders"),
    title: "Orders",
    subtitle: "Manage customer sales orders",
    searchPlaceholder: "Search orders...",
    showCreateButton: true,
    createLabel: "Create Order",
    filterLabels: ["Date", "Category", "Order Status", "GST", "Payment", "Sort"],
    columns: [
      { header: "Order #", key: "orderNumber" },
      { header: "Customer", key: "customer" },
      { header: "Status", key: "status" },
      { header: "Total Amount (₹)", key: "total", align: "right" },
      { header: "Due Amount (₹)", key: "due", align: "right" },
    ],
    rows: [
      {
        orderNumber: DUMMY.order.id,
        customer: `${DUMMY.order.customer}\n${DUMMY.order.mobile}`,
        status: DUMMY.order.status,
        total: DUMMY.order.total,
        due: "₹23,500",
      },
      {
        orderNumber: "SO-2026-0138",
        customer: "Anita Desai\n98760 11122",
        status: "Pending",
        total: "₹22,100",
        due: "₹22,100",
      },
    ],
    showRowActions: true,
  },
  "products-list": {
    screenId: "products-list",
    nav: nav("products"),
    title: "Products",
    subtitle: "Manage your product catalog and variants",
    searchPlaceholder: "Search products...",
    showCreateButton: true,
    createLabel: "Add Product",
    filterLabels: ["Date range", "Category", "Low stock"],
    columns: [
      { header: "Name", key: "name" },
      { header: "SKU", key: "sku", cellClassName: "font-mono text-sm text-muted-foreground" },
      { header: "Category", key: "category" },
      { header: "Price (₹)", key: "price", align: "right" },
      { header: "Stock", key: "stock", align: "right" },
    ],
    rows: [
      {
        name: DUMMY.product.name,
        sku: DUMMY.product.sku,
        category: DUMMY.product.category,
        price: DUMMY.product.price,
        stock: String(DUMMY.product.stock),
      },
    ],
    showRowActions: true,
  },
  "users-list": {
    screenId: "users-list",
    nav: nav("users"),
    title: "Users",
    subtitle: "Manage staff accounts and permissions",
    searchPlaceholder: "Search users...",
    showCreateButton: true,
    createLabel: "Add User",
    filterLabels: ["Role", "Branch"],
    columns: [
      { header: "User", key: "user" },
      { header: "Role", key: "role" },
      { header: "Branch", key: "branch" },
      { header: "Status", key: "status" },
    ],
    rows: [
      { user: DUMMY.user, role: DUMMY.role, branch: DUMMY.branchName, status: "Active" },
      { user: "Amit Kumar", role: "Store Manager", branch: DUMMY.branchName, status: "Active" },
    ],
    showRowActions: true,
  },
};

/** Resolve list page config for any list-style screen id. */
export function getListConfig(screenId: string, moduleKey: string): GuideListPageConfig {
  if (GUIDE_LIST_CONFIGS[screenId]) return GUIDE_LIST_CONFIGS[screenId];

  const n = nav(moduleKey);
  const genericTitles: Record<string, { title: string; subtitle: string; search: string; create?: string }> = {
    purchaseOrders: { title: "Purchase Orders", subtitle: "Manage supplier and manufacturer purchase orders", search: "Search POs...", create: "Create PO" },
    suppliers: { title: "Suppliers", subtitle: "Manage supplier contacts", search: "Search suppliers...", create: "Add Supplier" },
    manufacturers: { title: "Manufacturers", subtitle: "Manage manufacturer partners", search: "Search manufacturers...", create: "Add Manufacturer" },
    branches: { title: "Branches", subtitle: "Manage showroom and warehouse branches", search: "Search branches...", create: "Add Branch" },
    categories: { title: "Categories", subtitle: "Organize products into categories", search: "Search categories...", create: "Add category" },
    inventory: { title: "Inventory", subtitle: "Track stock levels by branch", search: "Search inventory..." },
    invoices: { title: "Invoices", subtitle: "View GST and non-GST invoices", search: "Search invoices..." },
    payments: { title: "Payments", subtitle: "Customer payment records", search: "Search payments..." },
    roles: { title: "Roles & Permissions", subtitle: "Control module access per role", search: "Search roles...", create: "Add role" },
    complaints: { title: "Complaints & support", subtitle: "Customer and partner support tickets", search: "Search complaints...", create: "New complaint" },
    activityLogs: { title: "Activity logs", subtitle: "System audit trail", search: "Search logs..." },
    deliveries: { title: "Deliveries", subtitle: "Schedule and manage delivery slots", search: "Search deliveries..." },
    "drivers-list": { title: "Drivers", subtitle: "Delivery drivers and vehicles", search: "Search drivers..." },
    "partner-po-list": { title: "Purchase orders", subtitle: "POs sent to your organization", search: "Search POs..." },
  };

  const meta = genericTitles[screenId.includes("drivers") ? "drivers-list" : screenId.startsWith("partner-") ? "partner-po-list" : moduleKey] ?? {
    title: n.label,
    subtitle: `Manage ${n.label.toLowerCase()}`,
    search: `Search ${n.label.toLowerCase()}...`,
    create: `Add ${n.label.replace(/s$/, "")}`,
  };

  return {
    screenId,
    nav: n,
    title: meta.title,
    subtitle: meta.subtitle,
    searchPlaceholder: meta.search,
    showCreateButton: !!meta.create,
    createLabel: meta.create,
    filterLabels: moduleKey === "activityLogs" ? ["User", "Module", "Date"] : ["Status", "Date"],
    columns: [
      { header: "Name", key: "name" },
      { header: "Details", key: "details" },
      { header: "Status", key: "status" },
    ],
    rows: [
      { name: DUMMY.supplier.name, details: DUMMY.supplier.mobile, status: "Active" },
      { name: "Metro Upholstery", details: "98760 12345", status: "Active" },
    ],
    showRowActions: true,
  };
}

export function getFormConfig(screenId: string, moduleKey: string): GuideFormPageConfig {
  const n = nav(moduleKey);
  const isOrder = moduleKey === "orders";
  const isUser = moduleKey === "users";
  const isRole = moduleKey === "roles";
  const isPo = moduleKey === "purchaseOrders";

  return {
    screenId,
    nav: n,
    title: isOrder ? "Create Order" : isUser ? (screenId.includes("edit") ? "Edit User" : "Add User") : isRole ? "Role permissions" : isPo ? "Purchase order" : n.label,
    subtitle: isOrder ? "New sales order" : isUser ? "Staff account details" : "Fill the form and save",
    formTitle: isOrder ? "Customer & order details" : isUser ? "User information" : isRole ? "Permission matrix" : "Details",
    fields: isOrder
      ? [
          { label: "Customer name", value: DUMMY.order.customer },
          { label: "Mobile", value: DUMMY.order.mobile },
          { label: "Delivery address", value: "42, MG Road, Bengaluru", span: 2 },
          { label: "Product line items", value: "Premium Sofa Set 3+2 × 1", span: 2 },
        ]
      : isUser
        ? [
            { label: "Full Name", value: DUMMY.user },
            { label: "Mobile Number", value: "98765 43210" },
            { label: "Email (Optional)", value: "priya@mgrcasa.example" },
            { label: "Role", value: DUMMY.role },
            { label: "Branches", value: DUMMY.branchName, span: 2 },
          ]
        : isRole
          ? [
              { label: "Role name", value: "Sales Executive" },
              { label: "Orders · View / Add / Edit", value: "✓ ✓ ✓", span: 2 },
              { label: "Products · View only", value: "✓", span: 2 },
            ]
          : [
              { label: "Name", value: DUMMY.supplier.name },
              { label: "Contact person", value: DUMMY.supplier.contact },
              { label: "Mobile", value: DUMMY.supplier.mobile },
            ],
    showDeleteDialog: screenId.includes("delete"),
  };
}

export function getDetailConfig(screenId: string, moduleKey: string): GuideDetailPageConfig {
  const n = nav(moduleKey);
  const isOrder = moduleKey === "orders" || screenId.includes("orders");
  const isPo = moduleKey === "purchaseOrders";

  if (isOrder) {
    return {
      screenId,
      nav: nav("orders"),
      title: `Order ${DUMMY.order.id}`,
      subtitle: DUMMY.order.customer,
      badges: [DUMMY.order.status, DUMMY.order.payment],
      fields: [
        { label: "Customer", value: DUMMY.order.customer },
        { label: "Mobile", value: DUMMY.order.mobile },
        { label: "Total", value: DUMMY.order.total },
        { label: "Branch", value: DUMMY.branchName },
      ],
      sections: [
        {
          title: "Line items",
          lines: [`Premium Sofa Set 3+2 × 1 — ${DUMMY.order.total}`],
        },
      ],
      showEditButton: true,
    };
  }

  if (isPo) {
    return {
      screenId,
      nav: nav("purchaseOrders"),
      title: DUMMY.po.id,
      subtitle: DUMMY.po.supplier,
      badges: [DUMMY.po.status],
      fields: [
        { label: "Supplier", value: DUMMY.po.supplier },
        { label: "Total", value: DUMMY.po.total },
        { label: "Expected delivery", value: "20 Jun 2026" },
      ],
      showEditButton: true,
    };
  }

  return {
    screenId,
    nav: n,
    title: moduleKey === "complaints" ? DUMMY.complaint.id : DUMMY.product.name,
    subtitle: moduleKey === "complaints" ? DUMMY.complaint.subject : DUMMY.product.sku,
    badges: moduleKey === "complaints" ? [DUMMY.complaint.status] : ["Active"],
    fields: [
      { label: "Category", value: DUMMY.product.category },
      { label: "Price", value: DUMMY.product.price },
      { label: "Stock", value: String(DUMMY.product.stock) },
    ],
    showEditButton: screenId.includes("edit") || screenId.includes("update"),
  };
}

export { nav as guideNavItem };
