import { Router, IRouter } from "express";
import { prisma } from "../lib/prisma";
import { CreateSupplierBody, GetSupplierParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { hashPassword } from "../lib/auth";
import { ensureSupplierPortalRoleId } from "../lib/portal-roles";

const router: IRouter = Router();

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPrismaCode(e: unknown, code: string): boolean {
  return !!(e && typeof e === "object" && "code" in e && String((e as { code?: string }).code) === code);
}

function prismaConflictField(e: unknown): "mobile" | "email" | null {
  if (!e || typeof e !== "object") return null;
  const meta = (e as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  const tokens = Array.isArray(target)
    ? target.map((t) => String(t).toLowerCase())
    : typeof target === "string"
    ? [target.toLowerCase()]
    : [];
  if (tokens.some((t) => t.includes("mobile"))) return "mobile";
  if (tokens.some((t) => t.includes("email"))) return "email";
  return null;
}

router.get("/suppliers", requireAuth, requirePermission("suppliers", "read"), async (req, res): Promise<void> => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let suppliers = await prisma.supplier.findMany({ skip: offset, take: limitNum });
  if (search) suppliers = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  res.json({ data: suppliers, total: suppliers.length, page: pageNum, limit: limitNum });
});

router.post("/suppliers", requireAuth, requirePermission("suppliers", "create"), async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const payload = parsed.data as Record<string, unknown>;
  const portalPassword = readOptionalString(payload.portalPassword);
  const mobile = readOptionalString(payload.mobile);
  const supplierName = readOptionalString(payload.name) ?? "Supplier";
  const email = readOptionalString(payload.email);

  if (portalPassword && !mobile) {
    res.status(400).json({
      error: "Mobile number is required when setting supplier portal password",
      field: "mobile",
    });
    return;
  }

  if (mobile && portalPassword) {
    const existing = await prisma.user.findUnique({ where: { mobile }, select: { id: true } });
    if (existing) {
      res.status(409).json({
        error: `A user with mobile ${mobile} already exists. Please use a different mobile number.`,
        field: "mobile",
      });
      return;
    }
  }

  const supplierData = { ...payload } as Record<string, unknown>;
  delete supplierData.portalPassword;

  try {
    const roleId = portalPassword && mobile ? await ensureSupplierPortalRoleId() : null;
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: supplierData as any });
      if (portalPassword && mobile && roleId) {
        await tx.user.create({
          data: {
            name: supplierName,
            mobile,
            email,
            passwordHash: await hashPassword(portalPassword),
            roleId,
            supplierId: created.id,
            manufacturerId: null,
            isActive: true,
          },
        });
      }
      return created;
    });
    res.status(201).json(supplier);
  } catch (e: unknown) {
    if (isPrismaCode(e, "P2002")) {
      const field = prismaConflictField(e) ?? "mobile";
      res.status(409).json({
        error:
          field === "email"
            ? "A user with this email already exists"
            : "A user with this mobile number already exists",
        field,
      });
      return;
    }
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not create supplier" });
  }
});

router.get("/suppliers/:id", requireAuth, requirePermission("suppliers", "read"), async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const supplier = await prisma.supplier.findUnique({ where: { id: params.data.id } });
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.put("/suppliers/:id", requireAuth, requirePermission("suppliers", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const payload = parsed.data as Record<string, unknown>;
  const portalPassword = readOptionalString(payload.portalPassword);
  const mobile = readOptionalString(payload.mobile);
  const supplierName = readOptionalString(payload.name) ?? "Supplier";
  const email = readOptionalString(payload.email);

  if (portalPassword && !mobile) {
    res.status(400).json({
      error: "Mobile number is required when resetting supplier portal password",
      field: "mobile",
    });
    return;
  }

  const linkedUserPre = await prisma.user.findFirst({
    where: { supplierId: id, manufacturerId: null },
    select: { id: true },
  });

  const roleId =
    portalPassword || linkedUserPre ? await ensureSupplierPortalRoleId() : null;

  if (mobile) {
    const conflict = await prisma.user.findFirst({
      where: {
        mobile,
        ...(linkedUserPre ? { NOT: { id: linkedUserPre.id } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      res.status(409).json({
        error: `A user with mobile ${mobile} already exists. Please use a different mobile number.`,
        field: "mobile",
      });
      return;
    }
  }

  const supplierData = { ...payload } as Record<string, unknown>;
  delete supplierData.portalPassword;

  try {
    const supplier = await prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id }, data: supplierData as any });

      const linkedUser = await tx.user.findFirst({
        where: { supplierId: id, manufacturerId: null },
        select: { id: true },
      });

      if (linkedUser && roleId) {
        const nextUserData: Record<string, unknown> = {
          name: supplierName,
          email,
          roleId,
          supplierId: id,
          manufacturerId: null,
          isActive: true,
        };
        if (mobile) nextUserData.mobile = mobile;
        if (portalPassword) nextUserData.passwordHash = await hashPassword(portalPassword);
        await tx.user.update({ where: { id: linkedUser.id }, data: nextUserData as any });
      } else if (portalPassword && mobile && roleId) {
        await tx.user.create({
          data: {
            name: supplierName,
            mobile,
            email,
            passwordHash: await hashPassword(portalPassword),
            roleId,
            supplierId: id,
            manufacturerId: null,
            isActive: true,
          },
        });
      }

      return updated;
    });
    res.json(supplier);
  } catch (e: unknown) {
    if (isPrismaCode(e, "P2025")) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }
    if (isPrismaCode(e, "P2002")) {
      const field = prismaConflictField(e) ?? "mobile";
      res.status(409).json({
        error:
          field === "email"
            ? "A user with this email already exists"
            : "A user with this mobile number already exists",
        field,
      });
      return;
    }
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not update supplier" });
  }
});

router.delete("/suppliers/:id", requireAuth, requirePermission("suppliers", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const supplier = await prisma.supplier.delete({ where: { id } }).catch(() => null);
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json({ success: true });
});

export default router;
