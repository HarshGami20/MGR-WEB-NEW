import type { ComplaintKind, ComplaintStatus, Prisma } from "@prisma/client";
import { loadComplaintAssignees } from "./complaint-assignees";
import { prisma, toNumber } from "./prisma";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function enrichProduct(product: {
  id: number;
  name: string;
  sku: string;
  imageUrl: string | null;
  price: Prisma.Decimal;
  gstPercent: Prisma.Decimal;
  description: string | null;
}) {
  return {
    ...product,
    price: toNumber(product.price),
    gstPercent: toNumber(product.gstPercent),
  };
}

export async function enrichOrderItems(orderId: number) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  return Promise.all(
    items.map(async (item) => {
      const product =
        item.productId != null
          ? await prisma.product.findUnique({ where: { id: item.productId } })
          : null;
      return {
        ...item,
        unitPrice: toNumber(item.unitPrice),
        gstPercent: toNumber(item.gstPercent),
        totalPrice: toNumber(item.totalPrice),
        product: product ? await enrichProduct(product) : null,
      };
    }),
  );
}

export async function enrichPurchaseOrderItems(purchaseOrderId: number) {
  const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
  return Promise.all(
    items.map(async (item) => {
      const product =
        item.productId != null ? await prisma.product.findUnique({ where: { id: item.productId } }) : null;
      return {
        id: item.id,
        productId: item.productId,
        isCustom: item.isCustom,
        customName: item.customName,
        quantity: item.quantity,
        unitPrice: toNumber(item.unitPrice),
        product: product ? await enrichProduct(product) : null,
      };
    }),
  );
}

export async function enrichComplaint(complaint: {
  id: number;
  complaintNumber: string;
  kind: ComplaintKind;
  orderId: number | null;
  purchaseOrderId: number | null;
  productId: number | null;
  branchId: number | null;
  createdById: number | null;
  subject: string | null;
  description: string;
  status: ComplaintStatus;
  imageUrls: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  let product: Awaited<ReturnType<typeof enrichProduct>> | null = null;
  if (complaint.productId) {
    const p = await prisma.product.findUnique({ where: { id: complaint.productId } });
    if (p) product = await enrichProduct(p);
  }

  let branch: Awaited<ReturnType<typeof prisma.branch.findUnique>> = null;
  if (complaint.branchId) {
    branch = await prisma.branch.findUnique({ where: { id: complaint.branchId } });
  }

  let createdBy: { id: number; name: string; mobile: string; avatarUrl: string | null } | null = null;
  if (complaint.createdById) {
    createdBy = await prisma.user.findUnique({
      where: { id: complaint.createdById },
      select: { id: true, name: true, mobile: true, avatarUrl: true },
    });
  }

  const comments = await prisma.complaintComment.findMany({
    where: { complaintId: complaint.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, mobile: true, avatarUrl: true } } },
  });

  let order: {
    id: number;
    orderNumber: string;
    customerName: string;
    customerMobile: string | null;
    customerAddress: string | null;
    status: string;
    paymentStatus: string;
    totalAmount: number;
    createdAt: Date;
    items: Awaited<ReturnType<typeof enrichOrderItems>>;
  } | null = null;

  if (complaint.kind === "sales_order" && complaint.orderId) {
    const row = await prisma.order.findUnique({ where: { id: complaint.orderId } });
    if (row) {
      order = {
        id: row.id,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        customerMobile: row.customerMobile,
        customerAddress: row.customerAddress,
        status: row.status,
        paymentStatus: row.paymentStatus,
        totalAmount: toNumber(row.totalAmount),
        createdAt: row.createdAt,
        items: await enrichOrderItems(row.id),
      };
    }
  }

  let purchaseOrder: {
    id: number;
    poNumber: string;
    status: string;
    type: string;
    totalAmount: number;
    branch: { id: number; name: string; code: string } | null;
    items: Awaited<ReturnType<typeof enrichPurchaseOrderItems>>;
  } | null = null;

  if (complaint.kind === "purchase_order" && complaint.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: complaint.purchaseOrderId },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    if (po) {
      purchaseOrder = {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        type: po.type,
        totalAmount: toNumber(po.totalAmount),
        branch: po.branch,
        items: await enrichPurchaseOrderItems(po.id),
      };
    }
  }

  const assignees = await loadComplaintAssignees(complaint.id);

  return {
    ...complaint,
    imageUrls: safeJsonParse<string[]>(complaint.imageUrls, []),
    assignees,
    order,
    purchaseOrder,
    product,
    branch,
    createdBy,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
    })),
  };
}
