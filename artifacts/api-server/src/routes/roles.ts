import { Router, IRouter } from "express";
import { db, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateRoleBody, GetRoleParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const parseRole = (r: any) => ({ ...r, permissions: JSON.parse(r.permissions) });

router.get("/roles", requireAuth, async (_req, res): Promise<void> => {
  const roles = await db.select().from(rolesTable);
  res.json(roles.map(parseRole));
});

router.post("/roles", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [role] = await db.insert(rolesTable).values({
    name: parsed.data.name,
    permissions: JSON.stringify(parsed.data.permissions),
  }).returning();
  res.status(201).json(parseRole(role));
});

router.get("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetRoleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, params.data.id));
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(parseRole(role));
});

router.put("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [role] = await db.update(rolesTable).set({
    name: parsed.data.name,
    permissions: JSON.stringify(parsed.data.permissions),
  }).where(eq(rolesTable.id, id)).returning();
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(parseRole(role));
});

router.delete("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [role] = await db.delete(rolesTable).where(eq(rolesTable.id, id)).returning();
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json({ success: true });
});

export default router;
