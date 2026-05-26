import { Router, IRouter } from "express";
import { LoginBody } from "../zod";
import { comparePassword, hashPassword, signToken } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { prisma } from "../lib/prisma";
import { loadUserPublicById } from "../lib/public-user";
import { normalizePermissionsForUi } from "../lib/permissions";

async function loadRoleForClient(roleId: number | null | undefined) {
  if (roleId == null) return null;
  const r = await prisma.role.findUnique({ where: { id: roleId } });
  if (!r) return null;
  return { ...r, permissions: normalizePermissionsForUi(JSON.parse(r.permissions)) };
}
import { z } from "zod";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

const router: IRouter = Router();
const avatarUploadDir = path.resolve(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(avatarUploadDir)) fs.mkdirSync(avatarUploadDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarUploadDir),
    filename: (req, file, cb) => {
      const user = (req as any).user;
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      cb(null, `user-${user?.id ?? "x"}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image uploads are allowed"));
  },
});
const UpdateMyProfileBody = z.object({
  name: z.string().min(1).optional(),
  mobile: z.string().min(1).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(""))
    .refine((value) => {
      if (!value) return true;
      if (value.startsWith("/uploads/")) return true;
      return z.string().url().safeParse(value).success;
    }, "Invalid avatar URL"),
});

const ChangeMyPasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(18, "New password must be at most 18 characters"),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { mobile, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { mobile } });
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
  const role = await loadRoleForClient(user.roleId);
  const publicUser = await loadUserPublicById(user.id);
  if (!publicUser) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ token, user: { ...publicUser, role } });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const role = await loadRoleForClient(user.roleId);
  const publicUser = await loadUserPublicById(user.id);
  if (!publicUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ ...publicUser, role });
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const payload = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.mobile !== undefined ? { mobile: data.mobile } : {}),
    ...(data.email !== undefined ? { email: data.email || null } : {}),
    ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl || null } : {}),
  };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: payload,
  }).catch((e: any) => {
    if (e?.code === "P2002") return "duplicate";
    return null;
  });

  if (updated === "duplicate") {
    res.status(409).json({ error: "Mobile or email already exists" });
    return;
  }
  if (!updated) {
    res.status(400).json({ error: "Failed to update profile" });
    return;
  }

  const publicUser = await loadUserPublicById(user.id);
  if (!publicUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const role = await loadRoleForClient(publicUser.roleId);
  res.json({ ...publicUser, role });
});

router.post("/auth/me/password", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const parsed = ChangeMyPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const passwordOk = await comparePassword(parsed.data.currentPassword, currentUser.passwordHash);
  if (!passwordOk) {
    res.status(403).json({ error: "Current password is incorrect" });
    return;
  }

  const samePassword = await comparePassword(parsed.data.newPassword, currentUser.passwordHash);
  if (samePassword) {
    res.status(400).json({ error: "New password must be different from current password" });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  res.json({ success: true });
});

router.post("/auth/me/avatar", requireAuth, avatarUpload.single("avatar"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!req.file) {
    res.status(400).json({ error: "Avatar file is required" });
    return;
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl },
  }).catch(() => null);
  if (!updated) {
    res.status(400).json({ error: "Failed to save avatar" });
    return;
  }
  res.json({ avatarUrl });
});

export default router;
