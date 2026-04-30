import { Router, IRouter } from "express";
import { CreateBranchBody, UpdateBranchBody, GetBranchParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();

router.get("/branches", requireAuth, requirePermission("branches", "read"), async (req, res): Promise<void> => {
  const { search, isActive, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let branches = await prisma.branch.findMany({ skip: offset, take: limitNum });
  if (search) branches = branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.code.toLowerCase().includes(search.toLowerCase()));
  if (isActive !== undefined) branches = branches.filter(b => b.isActive === (isActive === "true"));

  res.json({ data: branches, total: branches.length, page: pageNum, limit: limitNum });
});

router.post("/branches", requireAuth, requirePermission("branches", "create"), async (req, res): Promise<void> => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const branch = await prisma.branch.create({ data: parsed.data });
  res.status(201).json(branch);
});

router.get("/branches/:id", requireAuth, requirePermission("branches", "read"), async (req, res): Promise<void> => {
  const params = GetBranchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const branch = await prisma.branch.findUnique({ where: { id: params.data.id } });
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

router.put("/branches/:id", requireAuth, requirePermission("branches", "update"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const branch = await prisma.branch.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
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
