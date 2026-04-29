import { Router, IRouter } from "express";
import { db, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateBranchBody, UpdateBranchBody, GetBranchParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/branches", requireAuth, async (req, res): Promise<void> => {
  const { search, isActive, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let branches = await db.select().from(branchesTable).offset(offset).limit(limitNum);
  if (search) branches = branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.code.toLowerCase().includes(search.toLowerCase()));
  if (isActive !== undefined) branches = branches.filter(b => b.isActive === (isActive === "true"));

  res.json({ data: branches, total: branches.length, page: pageNum, limit: limitNum });
});

router.post("/branches", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [branch] = await db.insert(branchesTable).values(parsed.data).returning();
  res.status(201).json(branch);
});

router.get("/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBranchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id));
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

router.put("/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [branch] = await db.update(branchesTable).set(parsed.data).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

router.delete("/branches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [branch] = await db.delete(branchesTable).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json({ success: true });
});

router.patch("/branches/:id/toggle-active", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const [branch] = await db.update(branchesTable).set({ isActive: !existing.isActive }).where(eq(branchesTable.id, id)).returning();
  res.json(branch);
});

export default router;
