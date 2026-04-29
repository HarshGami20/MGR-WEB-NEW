import { Router, IRouter } from "express";
import { db, usersTable, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { comparePassword, signToken } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { mobile, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.mobile, mobile));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ userId: user.id, roleId: user.roleId });
  let role = null;
  if (user.roleId) {
    const [r] = await db.select().from(rolesTable).where(eq(rolesTable.id, user.roleId));
    if (r) role = { ...r, permissions: JSON.parse(r.permissions) };
  }
  res.json({ token, user: { ...user, passwordHash: undefined, role } });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  let role = null;
  if (user.roleId) {
    const [r] = await db.select().from(rolesTable).where(eq(rolesTable.id, user.roleId));
    if (r) role = { ...r, permissions: JSON.parse(r.permissions) };
  }
  res.json({ ...user, passwordHash: undefined, role });
});

export default router;
