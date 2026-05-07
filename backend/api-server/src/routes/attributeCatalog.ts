import { Router, IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();

const CreateKeyBody = z.object({ name: z.string().min(1).max(120) });
const CreateOptionBody = z.object({ value: z.string().min(1).max(200) });

router.get("/attribute-catalog", requireAuth, requirePermission("products", "read"), async (_req, res): Promise<void> => {
  const keys = await prisma.attributeKey.findMany({
    orderBy: { name: "asc" },
    include: { options: { orderBy: { value: "asc" } } },
  });
  res.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      values: k.options.map((o) => o.value),
    })),
  });
});

router.post("/attribute-catalog/keys", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const parsed = CreateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  try {
    const row = await prisma.attributeKey.create({ data: { name } });
    res.status(201).json({ id: row.id, name: row.name, values: [] as string[] });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const existing = await prisma.attributeKey.findUnique({ where: { name } });
      if (existing) {
        const withOpts = await prisma.attributeKey.findUnique({
          where: { id: existing.id },
          include: { options: { orderBy: { value: "asc" } } },
        });
        res.status(200).json({
          id: existing.id,
          name: existing.name,
          values: withOpts?.options.map((o) => o.value) ?? [],
        });
        return;
      }
    }
    throw e;
  }
});

router.post("/attribute-catalog/keys/:keyId/options", requireAuth, requirePermission("products", "create"), async (req, res): Promise<void> => {
  const keyId = parseInt(String(req.params.keyId), 10);
  if (Number.isNaN(keyId)) {
    res.status(400).json({ error: "Invalid keyId" });
    return;
  }
  const parsed = CreateOptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const value = parsed.data.value.trim();
  const key = await prisma.attributeKey.findUnique({ where: { id: keyId } });
  if (!key) {
    res.status(404).json({ error: "Attribute key not found" });
    return;
  }
  try {
    await prisma.attributeOption.create({ data: { keyId, value } });
    const options = await prisma.attributeOption.findMany({
      where: { keyId },
      orderBy: { value: "asc" },
    });
    res.status(201).json({ keyId, values: options.map((o) => o.value) });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const options = await prisma.attributeOption.findMany({
        where: { keyId },
        orderBy: { value: "asc" },
      });
      res.status(200).json({ keyId, values: options.map((o) => o.value) });
      return;
    }
    throw e;
  }
});

export default router;
