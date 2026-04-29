import { Router, IRouter } from "express";
import { db, usersTable, rolesTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody, GetUserParams, ResetUserPasswordBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { hashPassword } from "../lib/auth";

const router: IRouter = Router();

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const { search, roleId, isActive, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let allUsers = await db.select().from(usersTable).offset(offset).limit(limitNum);

  if (search) {
    allUsers = allUsers.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.mobile.includes(search)
    );
  }
  if (roleId) allUsers = allUsers.filter(u => u.roleId === parseInt(roleId, 10));
  if (isActive !== undefined) allUsers = allUsers.filter(u => u.isActive === (isActive === "true"));

  const rolesMap: Record<number, any> = {};
  const roles = await db.select().from(rolesTable);
  for (const r of roles) rolesMap[r.id] = { ...r, permissions: JSON.parse(r.permissions) };

  const data = allUsers.map(u => ({
    ...u,
    passwordHash: undefined,
    role: u.roleId ? rolesMap[u.roleId] : null,
  }));

  res.json({ data, total: data.length, page: pageNum, limit: limitNum });
});

router.post("/users", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data as any;
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({ ...rest, passwordHash }).returning();
  res.status(201).json({ ...user, passwordHash: undefined });
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  let role = null;
  if (user.roleId) {
    const [r] = await db.select().from(rolesTable).where(eq(rolesTable.id, user.roleId));
    if (r) role = { ...r, permissions: JSON.parse(r.permissions) };
  }
  res.json({ ...user, passwordHash: undefined, role });
});

router.put("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, passwordHash: undefined });
});

router.delete("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

router.patch("/users/:id/toggle-active", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  const [user] = await db.update(usersTable).set({ isActive: !existing.isActive }).where(eq(usersTable.id, id)).returning();
  res.json({ ...user, passwordHash: undefined });
});

router.post("/users/:id/reset-password", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const [user] = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true });
});

export default router;
