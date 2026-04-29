import { Router, IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function parseSettings(s: any) {
  return { ...s, defaultGstPercent: parseFloat(s.defaultGstPercent) };
}

router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable);
  if (!settings) {
    const [s] = await db.insert(settingsTable).values({}).returning();
    res.json(parseSettings(s));
    return;
  }
  res.json(parseSettings(settings));
});

router.put("/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(settingsTable);
  if (!existing) {
    const updateData: any = { ...parsed.data };
    if (parsed.data.defaultGstPercent !== undefined) updateData.defaultGstPercent = String(parsed.data.defaultGstPercent);
    const [s] = await db.insert(settingsTable).values(updateData).returning();
    res.json(parseSettings(s));
    return;
  }

  const updateData: any = { ...parsed.data };
  if (parsed.data.defaultGstPercent !== undefined) updateData.defaultGstPercent = String(parsed.data.defaultGstPercent);

  const [settings] = await db.update(settingsTable).set(updateData).returning();
  res.json(parseSettings(settings));
});

export default router;
