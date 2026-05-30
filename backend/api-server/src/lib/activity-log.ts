import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getActivityLogDelegate } from "./activity-log-client";

export type ActivityLogInput = {
  userId?: number | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  branchId?: number | null;
  summary: string;
  method?: string | null;
  path?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type AuditMeta = Partial<ActivityLogInput> & {
  skip?: boolean;
};

const SENSITIVE_KEYS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "passwordHash",
  "token",
  "refreshToken",
]);

type RouteRule = {
  test: RegExp;
  module: string;
  entityType: string;
  entityIdIndex?: number;
};

const ROUTE_RULES: RouteRule[] = [
  { test: /^\/auth\/login$/, module: "auth", entityType: "Session" },
  { test: /^\/auth\/me\/password$/, module: "auth", entityType: "User" },
  { test: /^\/auth\/me(?:\/|$)/, module: "auth", entityType: "User" },
  { test: /^\/users(?:\/(\d+))?/, module: "users", entityType: "User", entityIdIndex: 1 },
  { test: /^\/roles(?:\/(\d+))?/, module: "roles", entityType: "Role", entityIdIndex: 1 },
  { test: /^\/branches(?:\/(\d+))?/, module: "branches", entityType: "Branch", entityIdIndex: 1 },
  { test: /^\/categories(?:\/(\d+))?/, module: "categories", entityType: "Category", entityIdIndex: 1 },
  { test: /^\/products\/(\d+)\/variants(?:\/(\d+))?/, module: "products", entityType: "ProductVariant", entityIdIndex: 2 },
  { test: /^\/products(?:\/(\d+))?/, module: "products", entityType: "Product", entityIdIndex: 1 },
  { test: /^\/inventory\/adjust$/, module: "inventory", entityType: "Inventory" },
  { test: /^\/inventory(?:\/|$)/, module: "inventory", entityType: "Inventory" },
  { test: /^\/orders(?:\/(\d+))?/, module: "orders", entityType: "Order", entityIdIndex: 1 },
  { test: /^\/delivery-slots(?:\/(\d+))?/, module: "deliveries", entityType: "DeliverySlot", entityIdIndex: 1 },
  { test: /^\/drivers(?:\/(\d+))?/, module: "deliveries", entityType: "Driver", entityIdIndex: 1 },
  { test: /^\/driver-payments(?:\/(\d+))?/, module: "deliveries", entityType: "DriverPayment", entityIdIndex: 1 },
  { test: /^\/payments(?:\/(\d+))?/, module: "payments", entityType: "Payment", entityIdIndex: 1 },
  { test: /^\/payment-follow-ups(?:\/(\d+))?/, module: "payments", entityType: "PaymentFollowUp", entityIdIndex: 1 },
  { test: /^\/purchase-orders(?:\/(\d+))?/, module: "purchaseOrders", entityType: "PurchaseOrder", entityIdIndex: 1 },
  { test: /^\/suppliers(?:\/(\d+))?/, module: "suppliers", entityType: "Supplier", entityIdIndex: 1 },
  { test: /^\/manufacturers(?:\/(\d+))?/, module: "manufacturers", entityType: "Manufacturer", entityIdIndex: 1 },
  { test: /^\/complaints(?:\/(\d+))?/, module: "complaints", entityType: "Complaint", entityIdIndex: 1 },
  { test: /^\/settings$/, module: "settings", entityType: "Setting" },
  { test: /^\/attribute-catalog(?:\/|$)/, module: "categories", entityType: "AttributeCatalog" },
  { test: /^\/notifications\/broadcast$/, module: "settings", entityType: "NotificationBroadcast" },
];

/** Exact paths or prefixes that should never appear in the audit trail. */
const SKIP_PATH_PREFIXES = ["/healthz", "/activity-logs"];

/** Exact paths that should never appear in the audit trail. */
const SKIP_EXACT_PATHS = new Set([
  "/notifications/fcm-token",
  "/notifications/read-all",
  "/notifications/preferences",
  "/notifications/test-web-push",
  "/auth/logout",
]);

export async function logActivity(input: ActivityLogInput): Promise<void> {
  const activityLog = getActivityLogDelegate();
  if (!activityLog) return;

  try {
    await activityLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        branchId: input.branchId ?? null,
        summary: input.summary.slice(0, 500),
        method: input.method ?? null,
        path: input.path ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("[activity-log] failed to persist entry:", error);
  }
}

function sanitizeBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  if (Array.isArray(body)) return body.map(sanitizeBody);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = "[redacted]";
    } else if (value && typeof value === "object") {
      out[key] = sanitizeBody(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function actionFromMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

function normalizeApiPath(url: string | undefined): string {
  const raw = (url ?? "").split("?")[0] ?? "";
  return raw.replace(/^\/api/, "") || "/";
}

function matchRoute(path: string): { module: string; entityType: string; entityId: string | null } {
  for (const rule of ROUTE_RULES) {
    const match = rule.test.exec(path);
    if (!match) continue;
    const entityId =
      rule.entityIdIndex != null && match[rule.entityIdIndex]
        ? match[rule.entityIdIndex]!
        : null;
    return { module: rule.module, entityType: rule.entityType, entityId };
  }
  return { module: "system", entityType: "Request", entityId: null };
}

function extractEntityLabel(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = [
    "orderNumber",
    "complaintNumber",
    "poNumber",
    "name",
    "sku",
    "mobile",
    "label",
    "invoiceNumber",
    "customerName",
    "title",
  ];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof record.id === "number") return `#${record.id}`;
  if (typeof record.id === "string" && record.id.trim()) return `#${record.id.trim()}`;
  return null;
}

function formatEntityDisplay(entityType: string, entityId: string): string {
  switch (entityType) {
    case "Order":
      return `ORD-${entityId}`;
    case "Complaint":
      return `CMP-${entityId}`;
    case "PurchaseOrder":
      return `PO-${entityId}`;
    default:
      return `${entityType} ${entityId}`;
  }
}

function buildSummary(input: {
  action: string;
  entityType: string;
  entityLabel: string | null;
  entityId: string | null;
  path: string;
  userName?: string | null;
  override?: string | null;
}): string {
  if (input.override?.trim()) return input.override.trim();
  const who = input.userName?.trim() ? input.userName.trim() : "System";
  const target =
    input.entityLabel ??
    (input.entityId ? formatEntityDisplay(input.entityType, input.entityId) : input.entityType);
  const verb =
    input.action === "create"
      ? "created"
      : input.action === "update"
        ? "updated"
        : input.action === "delete"
          ? "deleted"
          : input.action.replace(/_/g, " ");
  return `${who} ${verb} ${target}`;
}

function requestUser(req: Request): { id: number; name: string; branchId: number | null } | null {
  const user = (req as Request & { user?: { id: number; name?: string; branchId?: number | null } }).user;
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name?.trim() || `User #${user.id}`,
    branchId: user.branchId ?? null,
  };
}

function shouldSkipPath(path: string, method: string): boolean {
  if (SKIP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }
  if (SKIP_EXACT_PATHS.has(path)) return true;
  if (method === "PATCH" && /^\/notifications\/[^/]+\/read$/.test(path)) return true;
  if (method === "DELETE" && /^\/notifications\/[^/]+$/.test(path) && path !== "/notifications/broadcast") {
    return true;
  }
  return false;
}

export async function persistAuditFromRequest(
  req: Request,
  res: { statusCode: number; locals: { auditMeta?: AuditMeta } },
  responseBody: unknown,
): Promise<void> {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
  if (res.statusCode < 200 || res.statusCode >= 300) return;

  const path = normalizeApiPath(req.originalUrl || req.url);
  if (shouldSkipPath(path, method)) return;

  const meta = res.locals.auditMeta;
  if (meta?.skip) return;

  const actor = requestUser(req);
  const route = matchRoute(path);
  const action = meta?.action ?? actionFromMethod(method);
  const module = meta?.module ?? route.module;
  const entityType = meta?.entityType ?? route.entityType;
  const entityId =
    meta?.entityId ??
    route.entityId ??
    (responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? String((responseBody as { id?: unknown }).id ?? "")
      : null);
  const normalizedEntityId = entityId && entityId !== "undefined" ? String(entityId) : null;
  const entityLabel = extractEntityLabel(responseBody);
  const summary = buildSummary({
    action,
    entityType,
    entityLabel,
    entityId: normalizedEntityId,
    path,
    userName: actor?.name ?? null,
    override: meta?.summary ?? null,
  });

  await logActivity({
    userId: meta?.userId ?? actor?.id ?? null,
    action,
    module,
    entityType,
    entityId: normalizedEntityId,
    branchId: meta?.branchId ?? actor?.branchId ?? null,
    summary,
    method,
    path,
    metadata: {
      requestBody: sanitizeBody(req.body) as Prisma.InputJsonValue,
      response: sanitizeBody(responseBody) as Prisma.InputJsonValue,
      ...(meta?.metadata && typeof meta.metadata === "object" ? meta.metadata : {}),
    },
  });
}

export const ACTIVITY_LOG_MODULES = [
  "auth",
  "users",
  "roles",
  "branches",
  "categories",
  "products",
  "inventory",
  "orders",
  "deliveries",
  "payments",
  "purchaseOrders",
  "suppliers",
  "manufacturers",
  "complaints",
  "settings",
  "system",
] as const;
