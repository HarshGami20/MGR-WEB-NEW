import { Router, IRouter } from "express";
import { CreateCategoryBody, UpdateCategoryParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();

router.get("/categories", requireAuth, requirePermission("categories", "read"), async (_req, res): Promise<void> => {
  const all = await prisma.category.findMany();
  const roots = all.filter(c => !c.parentId).map(c => ({
    ...c,
    children: all.filter(sub => sub.parentId === c.id),
  }));
  res.json(roots);
});

router.post("/categories", requireAuth, requirePermission("categories", "create"), async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const cat = await prisma.category.create({ data: parsed.data });
  res.status(201).json({ ...cat, children: [] });
});

router.put("/categories/:id", requireAuth, requirePermission("categories", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const cat = await prisma.category.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ...cat, children: [] });
});

router.delete("/categories/:id", requireAuth, requirePermission("categories", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const cat = await prisma.category.delete({ where: { id } }).catch(() => null);
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ success: true });
});

export default router;
