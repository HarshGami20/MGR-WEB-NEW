import { Router, IRouter } from "express";
import { CreateCategoryBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import {
  assertCategoryCanDelete,
  assertCategoryCanUpdate,
  assertUniqueCategoryName,
  assertValidCategoryParent,
  buildCategoryTree,
  parseCategoryBody,
} from "../lib/category-handling";

const router: IRouter = Router();

function categoryError(res: import("express").Response, e: unknown, fallback: string): void {
  const msg = e instanceof Error ? e.message : String(e);
  res.status(400).json({ error: msg || fallback });
}

router.get("/categories", requireAuth, requirePermission("categories", "read"), async (_req, res): Promise<void> => {
  const all = await prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { name: "asc" }] });
  res.json(buildCategoryTree(all));
});

router.post("/categories", requireAuth, requirePermission("categories", "create"), async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const input = parseCategoryBody(parsed.data);
    await assertValidCategoryParent(input.parentId);
    await assertUniqueCategoryName(input.name, input.parentId);
    const cat = await prisma.category.create({ data: input });
    res.status(201).json({ ...cat, children: [] });
  } catch (e: unknown) {
    categoryError(res, e, "Failed to create category");
  }
});

router.put("/categories/:id", requireAuth, requirePermission("categories", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid category id" });
    return;
  }

  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  try {
    const input = parseCategoryBody(parsed.data);
    await assertValidCategoryParent(input.parentId, id);
    await assertCategoryCanUpdate(id, input.parentId);
    await assertUniqueCategoryName(input.name, input.parentId, id);
    const cat = await prisma.category.update({ where: { id }, data: input });
    const children = await prisma.category.findMany({ where: { parentId: id }, orderBy: { name: "asc" } });
    res.json({ ...cat, children });
  } catch (e: unknown) {
    categoryError(res, e, "Failed to update category");
  }
});

router.delete("/categories/:id", requireAuth, requirePermission("categories", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid category id" });
    return;
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  try {
    await assertCategoryCanDelete(id);
    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: unknown) {
    categoryError(res, e, "Failed to delete category");
  }
});

export default router;
