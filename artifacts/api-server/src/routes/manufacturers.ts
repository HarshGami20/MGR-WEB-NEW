import { Router, IRouter } from "express";
import { db, manufacturersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateManufacturerBody, GetManufacturerParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/manufacturers", requireAuth, async (req, res): Promise<void> => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let manufacturers = await db.select().from(manufacturersTable).offset(offset).limit(limitNum);
  if (search) manufacturers = manufacturers.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  res.json({ data: manufacturers, total: manufacturers.length, page: pageNum, limit: limitNum });
});

router.post("/manufacturers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateManufacturerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [manufacturer] = await db.insert(manufacturersTable).values(parsed.data).returning();
  res.status(201).json(manufacturer);
});

router.get("/manufacturers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetManufacturerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [manufacturer] = await db.select().from(manufacturersTable).where(eq(manufacturersTable.id, params.data.id));
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json(manufacturer);
});

router.put("/manufacturers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateManufacturerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [manufacturer] = await db.update(manufacturersTable).set(parsed.data).where(eq(manufacturersTable.id, id)).returning();
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json(manufacturer);
});

router.delete("/manufacturers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [manufacturer] = await db.delete(manufacturersTable).where(eq(manufacturersTable.id, id)).returning();
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json({ success: true });
});

export default router;
