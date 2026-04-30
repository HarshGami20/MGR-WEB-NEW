import { Router, IRouter } from "express";
import { UpdateSettingsBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { toNumber } from "../lib/prisma";

const router: IRouter = Router();

function parseSettings(s: any) {
  return { ...s, defaultGstPercent: toNumber(s.defaultGstPercent) };
}

router.get("/settings", requireAuth, requirePermission("settings", "read"), async (_req, res): Promise<void> => {
  const settings = await prisma.setting.findFirst();
  if (!settings) {
    const s = await prisma.setting.create({ data: {} });
    res.json(parseSettings(s));
    return;
  }
  res.json(parseSettings(settings));
});

router.put("/settings", requireAuth, requirePermission("settings", "update"), async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await prisma.setting.findFirst();
  if (!existing) {
    const updateData: any = { ...parsed.data };
    if (parsed.data.defaultGstPercent !== undefined) updateData.defaultGstPercent = String(parsed.data.defaultGstPercent);
    const s = await prisma.setting.create({ data: updateData });
    res.json(parseSettings(s));
    return;
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.defaultGstPercent !== undefined) updateData.defaultGstPercent = String(parsed.data.defaultGstPercent);

  const settings = await prisma.setting.update({ where: { id: existing.id }, data: updateData });
  res.json(parseSettings(settings));
});

export default router;
