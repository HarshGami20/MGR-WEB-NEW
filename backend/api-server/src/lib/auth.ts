import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.SESSION_SECRET || "furniture-erp-secret-key";
const JWT_EXPIRES_IN = "7d";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: number; roleId: number | null }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: number; roleId: number | null } {
  return jwt.verify(token, JWT_SECRET) as { userId: number; roleId: number | null };
}

export function extractToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
