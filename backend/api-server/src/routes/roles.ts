import { Router, IRouter } from "express";
import { CreateRoleBody, GetRoleParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";

const router: IRouter = Router();

const parseRole = (r: any) => ({ ...r, permissions: JSON.parse(r.permissions) });

router.get("/roles", requireAuth, requirePermission("roles", "read"), async (_req, res): Promise<void> => {
  const roles = await prisma.role.findMany();
  res.json(roles.map(parseRole));
});

router.post("/roles", requireAuth, requirePermission("roles", "create"), async (req, res): Promise<void> => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const role = await prisma.role.create({ data: {
    name: parsed.data.name,
    permissions: JSON.stringify(parsed.data.permissions),
  }});
  res.status(201).json(parseRole(role));
});

router.get("/roles/:id", requireAuth, requirePermission("roles", "read"), async (req, res): Promise<void> => {
  const params = GetRoleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const role = await prisma.role.findUnique({ where: { id: params.data.id } });
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(parseRole(role));
});

router.put("/roles/:id", requireAuth, requirePermission("roles", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const role = await prisma.role.update({ where: { id }, data: {
    name: parsed.data.name,
    permissions: JSON.stringify(parsed.data.permissions),
  }}).catch(() => null);
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json(parseRole(role));
});

router.delete("/roles/:id", requireAuth, requirePermission("roles", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const role = await prisma.role.delete({ where: { id } }).catch(() => null);
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  res.json({ success: true });
});

export default router;
