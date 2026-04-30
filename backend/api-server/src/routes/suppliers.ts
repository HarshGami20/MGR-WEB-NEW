import { Router, IRouter } from "express";
import { prisma } from "../lib/prisma";
import { CreateSupplierBody, GetSupplierParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, requirePermission("suppliers", "read"), async (req, res): Promise<void> => {
  const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;
  let suppliers = await prisma.supplier.findMany({ skip: offset, take: limitNum });
  if (search) suppliers = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  res.json({ data: suppliers, total: suppliers.length, page: pageNum, limit: limitNum });
});

router.post("/suppliers", requireAuth, requirePermission("suppliers", "create"), async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const supplier = await prisma.supplier.create({ data: parsed.data });
  res.status(201).json(supplier);
});

router.get("/suppliers/:id", requireAuth, requirePermission("suppliers", "read"), async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const supplier = await prisma.supplier.findUnique({ where: { id: params.data.id } });
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.put("/suppliers/:id", requireAuth, requirePermission("suppliers", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(supplier);
});

router.delete("/suppliers/:id", requireAuth, requirePermission("suppliers", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const supplier = await prisma.supplier.delete({ where: { id } }).catch(() => null);
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json({ success: true });
});

export default router;
