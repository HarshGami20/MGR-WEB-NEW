import { Router, type IRouter } from "express";
import { z } from "zod";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type { ComplaintStatus, Prisma } from "@prisma/client";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import { prisma, toNumber } from "../lib/prisma";
import { requireWriteBranchId } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";

const router: IRouter = Router();

const COMPLAINT_STATUSES = new Set<ComplaintStatus>(["open", "in_progress", "resolved"]);

const complaintImageUploadDir = path.resolve(process.cwd(), "uploads", "complaints");
if (!fs.existsSync(complaintImageUploadDir)) fs.mkdirSync(complaintImageUploadDir, { recursive: true });

const complaintImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, complaintImageUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function generateComplaintNumber() {
  return `CMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const CreateComplaintBody = z.object({
  orderId: z.coerce.number().int().positive(),
  productId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  subject: z.string().max(200).optional().nullable(),
  description: z.string().min(1, "Issue description is required"),
  imageUrls: z.array(z.string()).optional(),
});

const UpdateComplaintBody = z.object({
  productId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  subject: z.string().max(200).optional().nullable(),
  description: z.string().min(1).optional(),
  imageUrls: z.array(z.string()).optional(),
});

const UpdateComplaintStatusBody = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
});

const CreateComplaintCommentBody = z.object({
  body: z.string().min(1, "Comment is required"),
});

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

async function enrichOrderItems(orderId: number) {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  return Promise.all(
    items.map(async (item) => {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
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

async function enrichComplaint(complaint: {
  id: number;
  complaintNumber: string;
  orderId: number;
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
  const order = await prisma.order.findUnique({ where: { id: complaint.orderId } });
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
    include: {
      user: { select: { id: true, name: true, mobile: true, avatarUrl: true } },
    },
  });

  const orderItems = order ? await enrichOrderItems(order.id) : [];

  return {
    ...complaint,
    imageUrls: safeJsonParse<string[]>(complaint.imageUrls, []),
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          customerAddress: order.customerAddress,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: toNumber(order.totalAmount),
          createdAt: order.createdAt,
          items: orderItems,
        }
      : null,
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

function branchFilterForUser(user: {
  branchId?: number | null;
  userBranches?: { branchId: number }[];
}): Prisma.ComplaintWhereInput | null {
  const assigned = assignedBranchIds(user);
  if (assigned.length === 0) return null;
  return { branchId: { in: assigned } };
}

router.post(
  "/complaints/upload-image",
  requireAuth,
  requirePermissionAny([
    { module: "complaints", action: "create" },
    { module: "complaints", action: "update" },
  ]),
  complaintImageUpload.single("image"),
  (req, res): void => {
    if (!(req as { file?: Express.Multer.File }).file) {
      res.status(400).json({ error: "Image file is required (field name: image)" });
      return;
    }
    const filename = (req as { file: Express.Multer.File }).file.filename;
    res.json({ imageUrl: `/uploads/complaints/${filename}` });
  },
);

router.get("/complaints", requireAuth, requirePermission("complaints", "read"), async (req, res): Promise<void> => {
  const { search, status, branchId, orderId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  const where: Prisma.ComplaintWhereInput = {};

  if (status && COMPLAINT_STATUSES.has(status as ComplaintStatus)) {
    where.status = status as ComplaintStatus;
  }
  if (branchId) where.branchId = parseInt(branchId, 10);
  if (orderId) where.orderId = parseInt(orderId, 10);

  if (user) {
    const branchScope = branchFilterForUser(user);
    if (branchScope) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), branchScope];
    }
  }

  if (search?.trim()) {
    const q = search.trim();
    const searchClause: Prisma.ComplaintWhereInput = {
      OR: [
        { complaintNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { order: { orderNumber: { contains: q, mode: "insensitive" } } },
        { order: { customerName: { contains: q, mode: "insensitive" } } },
      ],
    };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchClause];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      skip: offset,
      take: limitNum,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const data = await Promise.all(rows.map(enrichComplaint));
  res.json({ data, total, page: pageNum, limit: limitNum });
});

router.get("/complaints/:id", requireAuth, requirePermission("complaints", "read"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid complaint id" });
    return;
  }

  const complaint = await prisma.complaint.findUnique({ where: { id } });
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  if (user) {
    const branchScope = branchFilterForUser(user);
    if (branchScope && complaint.branchId != null) {
      const allowed = assignedBranchIds(user);
      if (!allowed.includes(complaint.branchId)) {
        res.status(403).json({ error: "Forbidden", message: "Complaint is outside your branch access" });
        return;
      }
    }
  }

  res.json(await enrichComplaint(complaint));
});

router.post("/complaints", requireAuth, requirePermission("complaints", "create"), async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authUser = (req as { user?: { id: number; branchId: number | null; userBranches?: { branchId: number }[] } })
    .user;
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order) {
    res.status(400).json({ error: "Order not found" });
    return;
  }

  const branchScope = branchFilterForUser(authUser);
  if (branchScope && order.branchId != null) {
    const allowed = assignedBranchIds(authUser);
    if (!allowed.includes(order.branchId)) {
      res.status(403).json({ error: "Forbidden", message: "Order is outside your branch access" });
      return;
    }
  }

  if (parsed.data.productId) {
    const item = await prisma.orderItem.findFirst({
      where: { orderId: order.id, productId: parsed.data.productId },
    });
    if (!item) {
      res.status(400).json({ error: "Selected product is not part of this order" });
      return;
    }
  }

  const branchId = order.branchId ?? (await requireWriteBranchId(req, res, authUser));
  if (order.branchId == null && branchId == null) return;

  const imageUrls =
    parsed.data.imageUrls && parsed.data.imageUrls.length > 0 ? JSON.stringify(parsed.data.imageUrls) : null;

  const created = await prisma.complaint.create({
    data: {
      complaintNumber: generateComplaintNumber(),
      orderId: order.id,
      productId: parsed.data.productId ?? null,
      branchId: order.branchId ?? branchId,
      createdById: authUser.id,
      subject: parsed.data.subject?.trim() || null,
      description: parsed.data.description.trim(),
      imageUrls,
    },
  });

  res.status(201).json(await enrichComplaint(created));
});

router.put("/complaints/:id", requireAuth, requirePermission("complaints", "update"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid complaint id" });
    return;
  }

  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  if (parsed.data.productId !== undefined && parsed.data.productId != null) {
    const item = await prisma.orderItem.findFirst({
      where: { orderId: existing.orderId, productId: parsed.data.productId },
    });
    if (!item) {
      res.status(400).json({ error: "Selected product is not part of this order" });
      return;
    }
  }

  const data: Prisma.ComplaintUpdateInput = {};
  if (parsed.data.productId !== undefined) {
    data.product =
      parsed.data.productId == null
        ? { disconnect: true }
        : { connect: { id: parsed.data.productId } };
  }
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject?.trim() || null;
  if (parsed.data.description !== undefined) data.description = parsed.data.description.trim();
  if (parsed.data.imageUrls !== undefined) {
    data.imageUrls = parsed.data.imageUrls.length > 0 ? JSON.stringify(parsed.data.imageUrls) : null;
  }

  const updated = await prisma.complaint.update({ where: { id }, data });
  res.json(await enrichComplaint(updated));
});

router.patch(
  "/complaints/:id/status",
  requireAuth,
  requirePermission("complaints", "update"),
  async (req, res): Promise<void> => {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid complaint id" });
      return;
    }

    const parsed = UpdateComplaintStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const updated = await prisma.complaint.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
      },
    });

    res.json(await enrichComplaint(updated));
  },
);

router.post(
  "/complaints/:id/comments",
  requireAuth,
  requirePermission("complaints", "update"),
  async (req, res): Promise<void> => {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid complaint id" });
      return;
    }

    const parsed = CreateComplaintCommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const authUser = (req as { user?: { id: number } }).user;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const comment = await prisma.complaintComment.create({
      data: {
        complaintId: id,
        userId: authUser.id,
        body: parsed.data.body.trim(),
      },
      include: {
        user: { select: { id: true, name: true, mobile: true, avatarUrl: true } },
      },
    });

    res.status(201).json({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      user: comment.user,
    });
  },
);

router.delete("/complaints/:id", requireAuth, requirePermission("complaints", "delete"), async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid complaint id" });
    return;
  }

  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  await prisma.complaint.delete({ where: { id } });
  res.status(204).send();
});

export default router;
