import { Request, Response, NextFunction } from "express";
import { verifyToken, extractToken } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
