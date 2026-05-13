import { Request, Response, NextFunction } from "express";
import { verifyToken, extractToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { normalizeRolePermissions } from "../lib/permissions";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true, userBranches: { select: { branchId: true } } },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as any).user = user;
    (req as any).permissionMatrix = normalizeRolePermissions(user.role?.permissions);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
