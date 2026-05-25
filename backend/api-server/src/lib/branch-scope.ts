import type { Request, Response } from "express";
import { prisma } from "./prisma";
import { assignedBranchIds } from "./user-branches";

export type UserWithBranchAccess = {
  branchId?: number | null;
  userBranches?: { branchId: number }[];
};

/** Reads branch id from `X-Branch-Id` header, query `branchId`, or JSON body `branchId`. */
export function readBranchIdFromRequest(req: Request): number | null {
  const h = req.headers["x-branch-id"];
  const rawHeader = (typeof h === "string" ? h : Array.isArray(h) ? h[0] : "")?.trim();
  if (rawHeader) {
    const n = parseInt(rawHeader, 10);
    if (Number.isFinite(n)) return n;
  }
  const q = req.query?.branchId;
  if (typeof q === "string" && q.trim()) {
    const n = parseInt(q.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  const body = req.body as Record<string, unknown> | undefined;
  const b = body?.branchId;
  if (typeof b === "number" && Number.isFinite(b)) return b;
  if (typeof b === "string" && b.trim()) {
    const n = parseInt(b.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Branch used for writes (orders, POs, inventory logs, product stock changes).
 * - Exactly one assigned branch → always that branch.
 * - Multiple assigned branches → request must specify a branch in that set (header/body/query).
 * - No assignments → any active branch from request (admin-style).
 */
export async function resolveWriteBranchId(req: Request, user: UserWithBranchAccess): Promise<number | null> {
  const assigned = assignedBranchIds(user);
  if (assigned.length === 1) {
    const ok = await prisma.branch.findFirst({
      where: { id: assigned[0], isActive: true },
      select: { id: true },
    });
    return ok ? assigned[0] : null;
  }
  if (assigned.length > 1) {
    const fromRequest = readBranchIdFromRequest(req);
    if (fromRequest == null || !assigned.includes(fromRequest)) return null;
    const branch = await prisma.branch.findFirst({
      where: { id: fromRequest, isActive: true },
      select: { id: true },
    });
    return branch ? fromRequest : null;
  }
  const fromRequest = readBranchIdFromRequest(req);
  if (fromRequest == null) return null;
  const branch = await prisma.branch.findFirst({
    where: { id: fromRequest, isActive: true },
    select: { id: true },
  });
  return branch ? fromRequest : null;
}

export async function requireWriteBranchId(
  req: Request,
  res: Response,
  user: UserWithBranchAccess,
): Promise<number | null> {
  const id = await resolveWriteBranchId(req, user);
  if (id != null) return id;
  const assigned = assignedBranchIds(user);
  let msg: string;
  if (assigned.length === 1) {
    msg = "Your assigned branch is not available. Please contact an administrator.";
  } else if (assigned.length > 1) {
    msg = "Please select one of your assigned branches.";
  } else {
    msg = "Please select a working branch.";
  }
  res.status(400).json({ error: msg });
  return null;
}

/** For inventory logs when updating existing orders/POs that already have a branch. */
export async function resolveLogBranchId(
  req: Request,
  user: UserWithBranchAccess,
  existingBranchId: number | null,
): Promise<number | null> {
  if (existingBranchId != null) {
    const ok = await prisma.branch.findFirst({
      where: { id: existingBranchId, isActive: true },
      select: { id: true },
    });
    if (ok) return existingBranchId;
  }
  return resolveWriteBranchId(req, user);
}
