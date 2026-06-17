import { Router, type IRouter } from "express";
import { z } from "zod";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import type { ComplaintKind, ComplaintStatus, Prisma } from "@prisma/client";
import { emitSafe } from "../lib/app-events";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requirePermissionAny } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { requireWriteBranchId } from "../lib/branch-scope";
import {
  assertActiveUserIdsExist,
  assertCanUpdateComplaintStatus,
  normalizeAssigneeUserIds,
  replaceComplaintAssignees,
} from "../lib/complaint-assignees";
import { enrichComplaint } from "../lib/complaint-enrich";
import {
  assertComplaintReadAccess,
  branchFilterForUser,
  partnerComplaintWhere,
} from "../lib/complaint-scope";
import { getPartnerScope, purchaseOrderMatchesScope } from "../lib/partner-scope";
import { assignedBranchIds } from "../lib/user-branches";
import { createdAtRangeFromQuery } from "../lib/created-at-filter";
import { complaintInCategories, resolveCategoryFilterIds } from "../lib/category-filter";
import { generateComplaintNumber } from "../lib/complaint-number";

const router: IRouter = Router();

const COMPLAINT_STATUSES = new Set<ComplaintStatus>(["open", "in_progress", "resolved"]);
const COMPLAINT_KINDS = new Set<ComplaintKind>(["sales_order", "purchase_order"]);

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

const CreateComplaintBody = z
  .object({
    kind: z.enum(["sales_order", "purchase_order"]).optional().default("sales_order"),
    orderId: z.coerce.number().int().positive().optional(),
    purchaseOrderId: z.coerce.number().int().positive().optional(),
    productId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
    subject: z.string().max(200).optional().nullable(),
    description: z.string().min(1, "Issue description is required"),
    imageUrls: z.array(z.string()).optional(),
    assigneeUserIds: z.array(z.coerce.number().int().positive()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "sales_order") {
      if (data.purchaseOrderId) {
        ctx.addIssue({ code: "custom", path: ["purchaseOrderId"], message: "not allowed for sales order complaints" });
      }
      if (!data.orderId && data.productId) {
        ctx.addIssue({
          code: "custom",
          path: ["productId"],
          message: "product can only be set when an order is linked",
        });
      }
    } else {
      if (!data.purchaseOrderId) {
        ctx.addIssue({ code: "custom", path: ["purchaseOrderId"], message: "purchaseOrderId is required" });
      }
      if (data.orderId) {
        ctx.addIssue({ code: "custom", path: ["orderId"], message: "not allowed for purchase order complaints" });
      }
    }
  });

const UpdateComplaintBody = z.object({
  productId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  subject: z.string().max(200).optional().nullable(),
  description: z.string().min(1).optional(),
  imageUrls: z.array(z.string()).optional(),
  assigneeUserIds: z.array(z.coerce.number().int().positive()).optional(),
});

const UpdateComplaintStatusBody = z.object({
  status: z.enum(["open", "in_progress", "resolved"]),
});

const CreateComplaintCommentBody = z.object({
  body: z.string().min(1, "Comment is required"),
});

function mergeAnd(where: Prisma.ComplaintWhereInput, clause: Prisma.ComplaintWhereInput) {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), clause];
}

/** Pick assignees on complaint forms — complaints create/update without users module read. */
router.get(
  "/complaints/assignable-users",
  requireAuth,
  requirePermissionAny([
    { module: "complaints", action: "create" },
    { module: "complaints", action: "update" },
  ]),
  async (req, res): Promise<void> => {
    const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const branchId = await requireWriteBranchId(req, res, user);
    if (branchId == null) return;

    const { search } = req.query as Record<string, string>;
    const limitRaw = (req.query as Record<string, string>).limit;
    const limitNum = Math.min(2000, Math.max(1, parseInt(limitRaw || "1000", 10) || 1000));
    const searchTrim = search?.trim() ?? "";

    const branchScope: Prisma.UserWhereInput = {
      OR: [
        { role: { name: "Super Admin" } },
        { userBranches: { some: { branchId } } },
        {
          AND: [{ userBranches: { none: {} } }, { branchId }],
        },
        {
          AND: [{ userBranches: { none: {} } }, { branchId: null }],
        },
      ],
    };

    const where: Prisma.UserWhereInput = {
      isActive: true,
      AND: [
        branchScope,
        ...(searchTrim
          ? [
              {
                OR: [
                  { name: { contains: searchTrim, mode: "insensitive" } },
                  { mobile: { contains: searchTrim } },
                ],
              } satisfies Prisma.UserWhereInput,
            ]
          : []),
      ],
    };

    const rows = await prisma.user.findMany({
      where,
      take: limitNum,
      select: {
        id: true,
        name: true,
        mobile: true,
        role: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    });

    res.json({ data: rows });
  },
);

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
  const { search, status, branchId, orderId, purchaseOrderId, kind, page = "1", limit = "20", createdFrom, createdTo, categoryId } =
    req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const user = (req as { user?: { branchId: number | null; userBranches?: { branchId: number }[] } }).user;
  const where: Prisma.ComplaintWhereInput = {};

  const partnerScope = await getPartnerScope(req);
  if (partnerScope) {
    Object.assign(where, partnerComplaintWhere(partnerScope));
  } else {
    if (kind && COMPLAINT_KINDS.has(kind as ComplaintKind)) {
      where.kind = kind as ComplaintKind;
    }
    if (user) {
      const branchScope = branchFilterForUser(user);
      if (branchScope) mergeAnd(where, branchScope);
    }
  }

  if (status && COMPLAINT_STATUSES.has(status as ComplaintStatus)) {
    where.status = status as ComplaintStatus;
  }
  if (branchId) where.branchId = parseInt(branchId, 10);
  if (orderId) where.orderId = parseInt(orderId, 10);
  if (purchaseOrderId) where.purchaseOrderId = parseInt(purchaseOrderId, 10);

  const createdAt = createdAtRangeFromQuery(createdFrom, createdTo);
  if (createdAt) where.createdAt = createdAt;

  const categoryIds = await resolveCategoryFilterIds(categoryId);
  if (categoryIds) mergeAnd(where, complaintInCategories(categoryIds));

  if (search?.trim()) {
    const q = search.trim();
    const searchClause: Prisma.ComplaintWhereInput = {
      OR: [
        { complaintNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { order: { orderNumber: { contains: q, mode: "insensitive" } } },
        { order: { customerName: { contains: q, mode: "insensitive" } } },
        { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } },
      ],
    };
    mergeAnd(where, searchClause);
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

  const access = await assertComplaintReadAccess(req, complaint);
  if (!access.ok) {
    res.status(access.status).json({ error: "Forbidden", message: access.message });
    return;
  }

  res.json(await enrichComplaint(complaint));
});

async function validateProductOnOrder(orderId: number, productId: number): Promise<boolean> {
  const item = await prisma.orderItem.findFirst({ where: { orderId, productId } });
  return item != null;
}

async function validateProductOnPurchaseOrder(purchaseOrderId: number, productId: number): Promise<boolean> {
  const item = await prisma.purchaseOrderItem.findFirst({
    where: { purchaseOrderId, productId, isCustom: false },
  });
  return item != null;
}

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

  const partnerScope = await getPartnerScope(req);
  if (partnerScope) {
    res.status(403).json({
      error: "Forbidden",
      message: "Supplier and manufacturer portal users cannot raise complaints",
    });
    return;
  }

  let kind = parsed.data.kind;

  const imageUrls =
    parsed.data.imageUrls && parsed.data.imageUrls.length > 0 ? JSON.stringify(parsed.data.imageUrls) : null;

  if (kind === "sales_order") {
    const assigneeIds = normalizeAssigneeUserIds(parsed.data.assigneeUserIds);
    try {
      await assertActiveUserIdsExist(assigneeIds);
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }

    let orderId: number | null = null;
    let branchId: number | null = null;

    if (parsed.data.orderId) {
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
        if (!(await validateProductOnOrder(order.id, parsed.data.productId))) {
          res.status(400).json({ error: "Selected product is not part of this order" });
          return;
        }
      }

      orderId = order.id;
      branchId = order.branchId ?? (await requireWriteBranchId(req, res, authUser));
      if (order.branchId == null && branchId == null) return;
    } else {
      branchId = await requireWriteBranchId(req, res, authUser);
      if (branchId == null) return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.complaint.create({
        data: {
          complaintNumber: await generateComplaintNumber(tx),
          kind: "sales_order",
          orderId,
          productId: parsed.data.productId ?? null,
          branchId,
          createdById: authUser.id,
          subject: parsed.data.subject?.trim() || null,
          description: parsed.data.description.trim(),
          imageUrls,
        },
      });
      await replaceComplaintAssignees(tx, row.id, assigneeIds);
      return row;
    });

    emitSafe("COMPLAINT_CREATED", {
      complaintId: created.id,
      complaintNumber: created.complaintNumber,
      kind: "sales_order",
      orderId,
      purchaseOrderId: null,
      branchId: created.branchId,
      createdById: authUser.id,
    });

    res.status(201).json(await enrichComplaint(created));
    return;
  }

  const po = await prisma.purchaseOrder.findUnique({ where: { id: parsed.data.purchaseOrderId! } });
  if (!po) {
    res.status(400).json({ error: "Purchase order not found" });
    return;
  }

  if (partnerScope && !purchaseOrderMatchesScope(po, partnerScope)) {
    res.status(403).json({ error: "Forbidden", message: "Purchase order is outside your portal access" });
    return;
  }

  if (!partnerScope) {
    const branchScope = branchFilterForUser(authUser);
    if (branchScope && po.branchId != null) {
      const allowed = assignedBranchIds(authUser);
      if (!allowed.includes(po.branchId)) {
        res.status(403).json({ error: "Forbidden", message: "Purchase order is outside your branch access" });
        return;
      }
    }
  }

  if (parsed.data.productId) {
    if (!(await validateProductOnPurchaseOrder(po.id, parsed.data.productId))) {
      res.status(400).json({ error: "Selected product is not part of this purchase order" });
      return;
    }
  }

  const branchId = po.branchId ?? (partnerScope ? null : await requireWriteBranchId(req, res, authUser));
  if (!partnerScope && po.branchId == null && branchId == null) return;

  const assigneeIds = normalizeAssigneeUserIds(parsed.data.assigneeUserIds);
  try {
    await assertActiveUserIdsExist(assigneeIds);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.complaint.create({
      data: {
        complaintNumber: await generateComplaintNumber(tx),
        kind: "purchase_order",
        purchaseOrderId: po.id,
        productId: parsed.data.productId ?? null,
        branchId: po.branchId ?? branchId,
        createdById: authUser.id,
        subject: parsed.data.subject?.trim() || null,
        description: parsed.data.description.trim(),
        imageUrls,
      },
    });
    await replaceComplaintAssignees(tx, row.id, assigneeIds);
    return row;
  });

  emitSafe("COMPLAINT_CREATED", {
    complaintId: created.id,
    complaintNumber: created.complaintNumber,
    kind: "purchase_order",
    orderId: null,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    branchId: created.branchId,
    createdById: authUser.id,
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

  const access = await assertComplaintReadAccess(req, existing);
  if (!access.ok) {
    res.status(access.status).json({ error: "Forbidden", message: access.message });
    return;
  }

  if (parsed.data.productId !== undefined && parsed.data.productId != null) {
    const valid =
      existing.kind === "purchase_order" && existing.purchaseOrderId
        ? await validateProductOnPurchaseOrder(existing.purchaseOrderId, parsed.data.productId)
        : existing.orderId
          ? await validateProductOnOrder(existing.orderId, parsed.data.productId)
          : false;
    if (!valid) {
      res.status(400).json({ error: "Selected product is not part of this order" });
      return;
    }
  }

  const data: Prisma.ComplaintUpdateInput = {};
  if (parsed.data.productId !== undefined) {
    data.product =
      parsed.data.productId == null ? { disconnect: true } : { connect: { id: parsed.data.productId } };
  }
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject?.trim() || null;
  if (parsed.data.description !== undefined) data.description = parsed.data.description.trim();
  if (parsed.data.imageUrls !== undefined) {
    data.imageUrls = parsed.data.imageUrls.length > 0 ? JSON.stringify(parsed.data.imageUrls) : null;
  }

  if (parsed.data.assigneeUserIds !== undefined) {
    const assigneeIds = normalizeAssigneeUserIds(parsed.data.assigneeUserIds);
    try {
      await assertActiveUserIdsExist(assigneeIds);
    } catch (e: unknown) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await replaceComplaintAssignees(tx, id, assigneeIds);
      if (Object.keys(data).length > 0) {
        return tx.complaint.update({ where: { id }, data });
      }
      return tx.complaint.findUniqueOrThrow({ where: { id } });
    });
    res.json(await enrichComplaint(updated));
    return;
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

    const access = await assertComplaintReadAccess(req, existing);
    if (!access.ok) {
      res.status(access.status).json({ error: "Forbidden", message: access.message });
      return;
    }

    const authUser = (req as { user?: { id: number; role?: { name?: string | null } | null } }).user;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const statusAccess = await assertCanUpdateComplaintStatus(authUser, id);
    if (!statusAccess.ok) {
      res.status(statusAccess.status).json({ error: statusAccess.message });
      return;
    }

    const updated = await prisma.complaint.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
      },
    });

    const actorId = authUser.id;
    if (existing.status !== updated.status) {
      emitSafe("COMPLAINT_STATUS_CHANGED", {
        complaintId: updated.id,
        complaintNumber: updated.complaintNumber,
        kind: updated.kind,
        orderId: updated.orderId,
        purchaseOrderId: updated.purchaseOrderId,
        branchId: updated.branchId,
        previousStatus: existing.status,
        nextStatus: updated.status,
        changedById: actorId,
      });
    }

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

    const access = await assertComplaintReadAccess(req, existing);
    if (!access.ok) {
      res.status(access.status).json({ error: "Forbidden", message: access.message });
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

    emitSafe("COMPLAINT_COMMENT_ADDED", {
      complaintId: existing.id,
      complaintNumber: existing.complaintNumber,
      kind: existing.kind,
      orderId: existing.orderId,
      purchaseOrderId: existing.purchaseOrderId,
      branchId: existing.branchId,
      commentId: comment.id,
      authorId: authUser.id,
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

  const partnerScope = await getPartnerScope(req);
  if (partnerScope) {
    res.status(403).json({ error: "Forbidden", message: "Portal users cannot delete complaints" });
    return;
  }

  await prisma.complaint.delete({ where: { id } });
  res.status(204).send();
});

export default router;
