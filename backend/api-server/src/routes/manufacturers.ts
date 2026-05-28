import { Router, IRouter } from "express";
import { prisma } from "../lib/prisma";
import { CreateManufacturerBody, GetManufacturerParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { hashPassword } from "../lib/auth";
import { ensureManufacturerPortalRoleId } from "../lib/portal-roles";

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

router.get("/manufacturers", requireAuth, requirePermission("manufacturers", "read"), async (req, res): Promise<void> => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let manufacturers = await prisma.manufacturer.findMany({ skip: offset, take: limitNum });
  if (search) manufacturers = manufacturers.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  res.json({ data: manufacturers, total: manufacturers.length, page: pageNum, limit: limitNum });
});

router.post("/manufacturers", requireAuth, requirePermission("manufacturers", "create"), async (req, res): Promise<void> => {
  const parsed = CreateManufacturerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const payload = parsed.data as Record<string, unknown>;
  const portalPassword = readOptionalString(payload.portalPassword);
  const mobile = readOptionalString(payload.mobile);
  const manufacturerName = readOptionalString(payload.name) ?? "Manufacturer";
  const email = readOptionalString(payload.email);

  if (portalPassword && !mobile) {
    res.status(400).json({
      error: "Mobile number is required when setting manufacturer portal password",
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

  const manufacturerData = { ...payload } as Record<string, unknown>;
  delete manufacturerData.portalPassword;

  try {
    const roleId = portalPassword && mobile ? await ensureManufacturerPortalRoleId() : null;
    const manufacturer = await prisma.$transaction(async (tx) => {
      const created = await tx.manufacturer.create({ data: manufacturerData as any });
      if (portalPassword && mobile && roleId) {
        await tx.user.create({
          data: {
            name: manufacturerName,
            mobile,
            email,
            passwordHash: await hashPassword(portalPassword),
            roleId,
            supplierId: null,
            manufacturerId: created.id,
            isActive: true,
          },
        });
      }
      return created;
    });
    res.status(201).json(manufacturer);
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
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not create manufacturer" });
  }
});

router.get("/manufacturers/:id", requireAuth, requirePermission("manufacturers", "read"), async (req, res): Promise<void> => {
  const params = GetManufacturerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const manufacturer = await prisma.manufacturer.findUnique({ where: { id: params.data.id } });
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json(manufacturer);
});

router.put("/manufacturers/:id", requireAuth, requirePermission("manufacturers", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateManufacturerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const payload = parsed.data as Record<string, unknown>;
  const portalPassword = readOptionalString(payload.portalPassword);
  const mobile = readOptionalString(payload.mobile);
  const manufacturerName = readOptionalString(payload.name) ?? "Manufacturer";
  const email = readOptionalString(payload.email);

  if (portalPassword && !mobile) {
    res.status(400).json({
      error: "Mobile number is required when resetting manufacturer portal password",
      field: "mobile",
    });
    return;
  }

  const linkedUserPre = await prisma.user.findFirst({
    where: { manufacturerId: id, supplierId: null },
    select: { id: true },
  });

  const roleId =
    portalPassword || linkedUserPre ? await ensureManufacturerPortalRoleId() : null;

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

  const manufacturerData = { ...payload } as Record<string, unknown>;
  delete manufacturerData.portalPassword;

  try {
    const manufacturer = await prisma.$transaction(async (tx) => {
      const updated = await tx.manufacturer.update({ where: { id }, data: manufacturerData as any });

      const linkedUser = await tx.user.findFirst({
        where: { manufacturerId: id, supplierId: null },
        select: { id: true },
      });

      if (linkedUser && roleId) {
        const nextUserData: Record<string, unknown> = {
          name: manufacturerName,
          email,
          roleId,
          supplierId: null,
          manufacturerId: id,
          isActive: true,
        };
        if (mobile) nextUserData.mobile = mobile;
        if (portalPassword) nextUserData.passwordHash = await hashPassword(portalPassword);
        await tx.user.update({ where: { id: linkedUser.id }, data: nextUserData as any });
      } else if (portalPassword && mobile && roleId) {
        await tx.user.create({
          data: {
            name: manufacturerName,
            mobile,
            email,
            passwordHash: await hashPassword(portalPassword),
            roleId,
            supplierId: null,
            manufacturerId: id,
            isActive: true,
          },
        });
      }

      return updated;
    });
    res.json(manufacturer);
  } catch (e: unknown) {
    if (isPrismaCode(e, "P2025")) {
      res.status(404).json({ error: "Manufacturer not found" });
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
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not update manufacturer" });
  }
});

router.delete("/manufacturers/:id", requireAuth, requirePermission("manufacturers", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const manufacturer = await prisma.manufacturer.delete({ where: { id } }).catch(() => null);
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json({ success: true });
});

export default router;
