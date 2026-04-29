import { Router, IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { CreateCategoryBody, UpdateCategoryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/categories", requireAuth, async (_req, res): Promise<void> => {
  const all = await db.select().from(categoriesTable);
  const roots = all.filter(c => !c.parentId).map(c => ({
    ...c,
    children: all.filter(sub => sub.parentId === c.id),
  }));
  res.json(roots);
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.insert(categoriesTable).values(parsed.data).returning();
  res.status(201).json({ ...cat, children: [] });
});

router.put("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ...cat, children: [] });
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [cat] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ success: true });
});

export default router;
