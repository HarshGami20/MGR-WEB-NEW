import { Router, IRouter } from "express";
import { CreateBranchBody, UpdateBranchBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, isSuperAdminRole } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { assignedBranchIds } from "../lib/user-branches";

const router: IRouter = Router();

router.get("/branches", requireAuth, requirePermission("branches", "read"), async (req, res): Promise<void> => {
  const { search, isActive, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let branches = await prisma.branch.findMany({ skip: offset, take: limitNum });
  if (search) branches = branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.code.toLowerCase().includes(search.toLowerCase()));
  if (isActive !== undefined) branches = branches.filter(b => b.isActive === (isActive === "true"));

  const authUser = (req as {
    user?: { branchId?: number | null; userBranches?: { branchId: number }[]; role?: { name?: string | null } | null };
  }).user;
  const allowed = authUser && !isSuperAdminRole(authUser) ? assignedBranchIds(authUser) : [];
  if (allowed.length > 0) {
    branches = branches.filter((b) => allowed.includes(b.id));
  }

  res.json({ data: branches, total: branches.length, page: pageNum, limit: limitNum });
});

const BRANCH_WRITE_FIELDS = ["name", "code", "address", "city", "state", "phone", "email"] as const;

function pickBranchWriteData(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BRANCH_WRITE_FIELDS) {
    if (key in raw) out[key] = raw[key];
  }
  return out;
}

function branchWriteErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  if (code === "P2002") return "Branch code already exists.";
  if (code === "P2003") return "Invalid branch reference.";
  if (code === "P2025") return "Branch not found.";
  return null;
}

router.post("/branches", requireAuth, requirePermission("branches", "create"), async (req, res): Promise<void> => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const name = typeof parsed.data?.name === "string" ? parsed.data.name.trim() : "";
  const code = typeof parsed.data?.code === "string" ? parsed.data.code.trim() : "";
  if (!name) { res.status(400).json({ error: "Branch name is required." }); return; }
  if (!code) { res.status(400).json({ error: "Branch code is required." }); return; }
  const optional = pickBranchWriteData(parsed.data as Record<string, unknown>);
  for (const key of ["address", "city", "state", "phone", "email"] as const) {
    if (typeof optional[key] === "string") {
      const trimmed = optional[key].trim();
      optional[key] = trimmed || null;
    } else if (optional[key] === "") {
      optional[key] = null;
    }
  }
  try {
    const branch = await prisma.branch.create({
      data: {
        name,
        code,
        address: (optional.address as string | null | undefined) ?? null,
        city: (optional.city as string | null | undefined) ?? null,
        state: (optional.state as string | null | undefined) ?? null,
        phone: (optional.phone as string | null | undefined) ?? null,
        email: (optional.email as string | null | undefined) ?? null,
      },
    });
    res.status(201).json(branch);
  } catch (err) {
    const message = branchWriteErrorMessage(err) ?? "Could not create branch.";
    const status = message === "Branch code already exists." ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

router.get("/branches/:id", requireAuth, requirePermission("branches", "read"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid branch id" }); return; }
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

router.put("/branches/:id", requireAuth, requirePermission("branches", "update"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid branch id" }); return; }
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = pickBranchWriteData(parsed.data as Record<string, unknown>);
  if (typeof data.name === "string") data.name = data.name.trim();
  if (typeof data.code === "string") data.code = data.code.trim();
  if (!data.name || typeof data.name !== "string") {
    res.status(400).json({ error: "Branch name is required." });
    return;
  }
  if (data.code === "" || data.code == null || typeof data.code !== "string") {
    res.status(400).json({ error: "Branch code is required." });
    return;
  }
  for (const key of ["address", "city", "state", "phone", "email"] as const) {
    if (typeof data[key] === "string") {
      const trimmed = data[key].trim();
      data[key] = trimmed || null;
    } else if (data[key] === "") {
      data[key] = null;
    }
  }
  try {
    const branch = await prisma.branch.update({ where: { id }, data });
    res.json(branch);
  } catch (err) {
    const message = branchWriteErrorMessage(err) ?? "Could not update branch.";
    const status =
      message === "Branch not found."
        ? 404
        : message === "Branch code already exists."
          ? 409
          : 400;
    res.status(status).json({ error: message });
  }
});

router.delete("/branches/:id", requireAuth, requirePermission("branches", "delete"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const branch = await prisma.branch.delete({ where: { id } }).catch(() => null);
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json({ success: true });
});

router.patch("/branches/:id/toggle-active", requireAuth, requirePermission("branches", "update"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const existing = await prisma.branch.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const branch = await prisma.branch.update({ where: { id }, data: { isActive: !existing.isActive } });
  res.json(branch);
});

export default router;
