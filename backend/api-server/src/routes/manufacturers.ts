import { Router, IRouter } from "express";
import { prisma } from "../lib/prisma";
import { CreateManufacturerBody, GetManufacturerParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";

const router: IRouter = Router();

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
  const manufacturer = await prisma.manufacturer.create({ data: parsed.data });
  res.status(201).json(manufacturer);
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
  const manufacturer = await prisma.manufacturer.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json(manufacturer);
});

router.delete("/manufacturers/:id", requireAuth, requirePermission("manufacturers", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const manufacturer = await prisma.manufacturer.delete({ where: { id } }).catch(() => null);
  if (!manufacturer) { res.status(404).json({ error: "Manufacturer not found" }); return; }
  res.json({ success: true });
});

export default router;
