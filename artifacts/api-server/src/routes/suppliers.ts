import { Router, IRouter } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateSupplierBody, GetSupplierParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let suppliers = await db.select().from(suppliersTable).offset(offset).limit(limitNum);
  if (search) suppliers = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  res.json({ data: suppliers, total: suppliers.length, page: pageNum, limit: limitNum });
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  res.status(201).json(supplier);
});

router.get("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.put("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [supplier] = await db.update(suppliersTable).set(parsed.data).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.delete("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [supplier] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json({ success: true });
});

export default router;
