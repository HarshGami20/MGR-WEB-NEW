import { Router, IRouter } from "express";
import { CreateUserBody, UpdateUserBody, GetUserParams, ResetUserPasswordBody, DeleteUserBody } from "../zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { comparePassword, hashPassword } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { loadUserPublicById } from "../lib/public-user";
import { salesUserFieldsFromBody } from "../lib/sales-order-scope";
import { assignedBranchIds } from "../lib/user-branches";

const router: IRouter = Router();

async function isSuperAdminRoleId(roleId: unknown): Promise<boolean> {
  const id = typeof roleId === "number" ? roleId : roleId != null && roleId !== "" ? parseInt(String(roleId), 10) : NaN;
  if (!Number.isFinite(id)) return false;
  const r = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  return r?.name === "Super Admin";
}

function normalizeBranchIds(branchIdsRaw: unknown, legacyBranchId: unknown): number[] {
  const ids = new Set<number>();
  if (Array.isArray(branchIdsRaw)) {
    for (const x of branchIdsRaw) {
      const n = typeof x === "number" ? x : parseInt(String(x), 10);
      if (Number.isFinite(n)) ids.add(n);
    }
  }
  if (ids.size === 0 && legacyBranchId != null && legacyBranchId !== "") {
    const n = typeof legacyBranchId === "number" ? legacyBranchId : parseInt(String(legacyBranchId), 10);
    if (Number.isFinite(n)) ids.add(n);
  }
  return [...ids].sort((a, b) => a - b);
}

async function assertBranchesExist(branchIds: number[]): Promise<string | null> {
  if (branchIds.length === 0) return null;
  const rows = await prisma.branch.findMany({
    where: { id: { in: branchIds }, isActive: true },
    select: { id: true },
  });
  if (rows.length !== branchIds.length) return "One or more branches are invalid or inactive";
  return null;
}

router.get("/users", requireAuth, requirePermission("users", "read"), async (req, res): Promise<void> => {
  const { search, roleId, branchId, isActive, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let allUsers = await prisma.user.findMany({
    skip: offset,
    take: limitNum,
    include: {
      userBranches: { select: { branchId: true } },
      role: { select: { name: true } },
    },
  });

  if (search) {
    allUsers = allUsers.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.mobile.includes(search)
    );
  }
  if (roleId) allUsers = allUsers.filter(u => u.roleId === parseInt(roleId, 10));
  if (branchId) {
    const bid = parseInt(branchId, 10);
    allUsers = allUsers.filter((u) => {
      const assigned = assignedBranchIds(u);
      return assigned.length === 0 || assigned.includes(bid);
    });
  }
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

  const data = allUsers.map(u => {
    const role = u.roleId ? rolesMap[u.roleId] : null;
    const uWithRole = { ...u, role };
    const branchIds = assignedBranchIds(uWithRole);
    const branchList = branchIds.map((id) => branchesMap[id]).filter(Boolean);
    return {
      ...u,
      passwordHash: undefined,
      role,
      branchIds,
      branches: branchList,
      branch: branchList[0] ?? null,
      supplier: u.supplierId ? supplierMap[u.supplierId] ?? null : null,
      manufacturer: u.manufacturerId ? manufacturerMap[u.manufacturerId] ?? null : null,
    };
  });

  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/users", requireAuth, requirePermission("users", "create"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const b = parsed.data as Record<string, unknown> & { password?: string };
  const password = b.password;
  let branchIds = normalizeBranchIds(b.branchIds, b.branchId);
  const roleId = b.roleId as number | undefined;
  if (await isSuperAdminRoleId(roleId)) {
    branchIds = []; 
  } else {
    const branchErr = await assertBranchesExist(branchIds);
    if (branchErr) {
      res.status(400).json({ error: branchErr });
      return;
    }
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const userFields = { ...b } as Record<string, unknown>;
  delete userFields.password;
  delete userFields.branchIds;
  delete userFields.branchId;
  delete userFields.userBranches;
  const salesFields = salesUserFieldsFromBody(userFields);
  delete userFields.isSales;
  delete userFields.ordersListScope;
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          ...userFields,
          ...salesFields,
          passwordHash,
          branchId: branchIds[0] ?? null,
          ...(branchIds.length > 0
            ? {
                userBranches: {
                  create: branchIds.map((branchId: number) => ({ branchId })),
                },
              }
            : {}),
        } as any,
      });
      return u;
    });
    const publicUser = await loadUserPublicById(user.id);
    res.status(201).json(publicUser ?? { ...user, passwordHash: undefined });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.get("/users/:id", requireAuth, requirePermission("users", "read"), async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const publicUser = await loadUserPublicById(params.data.id);
  if (!publicUser) { res.status(404).json({ error: "User not found" }); return; }
  let role: (NonNullable<Awaited<ReturnType<typeof prisma.role.findUnique>>> & { permissions: unknown }) | null = null;
  if (publicUser.roleId) {
    const r = await prisma.role.findUnique({ where: { id: publicUser.roleId } });
    if (r) role = { ...r, permissions: JSON.parse(r.permissions) };
  }
  res.json({ ...publicUser, role });
});

router.put("/users/:id", requireAuth, requirePermission("users", "update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await prisma.user.findUnique({ where: { id }, select: { roleId: true } });
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const body = parsed.data as any;
  const { password, branchIds: bidRaw, branchId: legacyBid, ...rest } = body;
  const nextRoleId = rest.roleId !== undefined ? rest.roleId : existing.roleId;
  const superAdmin = await isSuperAdminRoleId(nextRoleId);

  let branchIdsUpdate = bidRaw !== undefined ? normalizeBranchIds(bidRaw, legacyBid ?? rest.branchId) : null;
  if (superAdmin) {
    branchIdsUpdate = [];
  }

  if (branchIdsUpdate !== null && branchIdsUpdate.length > 0) {
    const branchErr = await assertBranchesExist(branchIdsUpdate);
    if (branchErr) {
      res.status(400).json({ error: branchErr });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...rest };
  if (rest.isSales !== undefined || rest.ordersListScope !== undefined) {
    Object.assign(updateData, salesUserFieldsFromBody(rest as Record<string, unknown>));
  }
  if (password) {
    updateData.passwordHash = await hashPassword(password);
  }
  delete updateData.branchId;
  delete updateData.branchIds;
  delete updateData.userBranches;

  if (superAdmin) {
    updateData.branchId = null;
  } else if (branchIdsUpdate !== null) {
    updateData.branchId = branchIdsUpdate[0] ?? null;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: updateData as any,
      });
      if (superAdmin) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
      } else if (branchIdsUpdate !== null) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (branchIdsUpdate.length > 0) {
          await tx.userBranch.createMany({
            data: branchIdsUpdate.map((branchId) => ({ userId: id, branchId })),
            skipDuplicates: true,
          });
        }
      }
    });
  } catch {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const publicUser = await loadUserPublicById(id);
  res.json(publicUser ?? { success: true });
});

router.delete("/users/:id", requireAuth, requirePermission("users", "delete"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const parsed = DeleteUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Your password is required to delete a user" });
    return;
  }

  const actorId = (req as { user?: { id: number } }).user?.id;
  if (!actorId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (actorId === id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { passwordHash: true },
  });
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const passwordOk = await comparePassword(parsed.data.password, actor.passwordHash);
  if (!passwordOk) {
    res.status(403).json({ error: "Incorrect password" });
    return;
  }

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
