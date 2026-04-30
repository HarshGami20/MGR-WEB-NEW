import { Router, IRouter } from "express";
import { CreateUserBody, UpdateUserBody, GetUserParams, ResetUserPasswordBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { loadUserPublicById } from "../lib/public-user";

const router: IRouter = Router();

router.get("/users", requireAuth, requirePermission("users", "read"), async (req, res): Promise<void> => {
  const { search, roleId, branchId, isActive, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let allUsers = await prisma.user.findMany({ skip: offset, take: limitNum });

  if (search) {
    allUsers = allUsers.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.mobile.includes(search)
    );
  }
  if (roleId) allUsers = allUsers.filter(u => u.roleId === parseInt(roleId, 10));
  if (branchId) allUsers = allUsers.filter(u => u.branchId === parseInt(branchId, 10));
  if (isActive !== undefined) allUsers = allUsers.filter(u => u.isActive === (isActive === "true"));

  const rolesMap: Record<number, any> = {};
  const roles = await prisma.role.findMany();
  for (const r of roles) rolesMap[r.id] = { ...r, permissions: JSON.parse(r.permissions) };

  const branchesMap: Record<number, any> = {};
  const branches = await prisma.branch.findMany();
  for (const b of branches) branchesMap[b.id] = b;

  const supplierIds = [...new Set(allUsers.map(u => u.supplierId).filter((x): x is number => x != null))];
  const manufacturerIds = [...new Set(allUsers.map(u => u.manufacturerId).filter((x): x is number => x != null))];
  const [suppliersList, manufacturersList] = await Promise.all([
    supplierIds.length ? prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } }) : [],
    manufacturerIds.length ? prisma.manufacturer.findMany({ where: { id: { in: manufacturerIds } }, select: { id: true, name: true } }) : [],
  ]);
  const supplierMap = Object.fromEntries(suppliersList.map(s => [s.id, s]));
  const manufacturerMap = Object.fromEntries(manufacturersList.map(m => [m.id, m]));

  const data = allUsers.map(u => ({
    ...u,
    passwordHash: undefined,
    role: u.roleId ? rolesMap[u.roleId] : null,
    branch: u.branchId ? branchesMap[u.branchId] ?? null : null,
    supplier: u.supplierId ? supplierMap[u.supplierId] ?? null : null,
    manufacturer: u.manufacturerId ? manufacturerMap[u.manufacturerId] ?? null : null,
  }));

  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/users", requireAuth, requirePermission("users", "create"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data as any;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { ...rest, passwordHash } });
  const publicUser = await loadUserPublicById(user.id);
  res.status(201).json(publicUser ?? { ...user, passwordHash: undefined });
});

router.get("/users/:id", requireAuth, requirePermission("users", "read"), async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const publicUser = await loadUserPublicById(params.data.id);
  if (!publicUser) { res.status(404).json({ error: "User not found" }); return; }
  let role = null;
  if (publicUser.roleId) {
    const r = await prisma.role.findUnique({ where: { id: publicUser.roleId } });
    if (r) role = { ...r, permissions: JSON.parse(r.permissions) };
  }
  let branch = null;
  if (publicUser.branchId) {
    const b = await prisma.branch.findUnique({ where: { id: publicUser.branchId } });
    if (b) branch = b;
  }
  res.json({ ...publicUser, role, branch });
});

router.put("/users/:id", requireAuth, requirePermission("users", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await prisma.user.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const publicUser = await loadUserPublicById(user.id);
  res.json(publicUser ?? { ...user, passwordHash: undefined });
});

router.delete("/users/:id", requireAuth, requirePermission("users", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const user = await prisma.user.delete({ where: { id } }).catch(() => null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

router.patch("/users/:id/toggle-active", requireAuth, requirePermission("users", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  const user = await prisma.user.update({ where: { id }, data: { isActive: !existing.isActive } });
  res.json({ ...user, passwordHash: undefined });
});

router.post("/users/:id/reset-password", requireAuth, requirePermission("users", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const user = await prisma.user.update({ where: { id }, data: { passwordHash } }).catch(() => null);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

export default router;
