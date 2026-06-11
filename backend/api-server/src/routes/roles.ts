import { Router, IRouter } from "express";
import { CreateRoleBody, GetRoleParams } from "../zod";
import { requireAuth } from "../middlewares/auth";
import {
  ensureFullUiPermissionsMatrix,
  normalizePermissionsForUi,
  requirePermission,
} from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { isPortalSystemRoleName } from "../lib/portal-roles";

const router: IRouter = Router();

function parseRolePermissionsField(permissions: unknown) {
  if (typeof permissions === "string") {
    try {
      return normalizePermissionsForUi(JSON.parse(permissions));
    } catch {
      return normalizePermissionsForUi({});
    }
  }
  return normalizePermissionsForUi(permissions);
}

const parseRole = (r: { permissions: unknown; [key: string]: unknown }) => ({
  ...r,
  permissions: parseRolePermissionsField(r.permissions),
});

function parseRoleIdParam(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function serializePermissions(body: { permissions?: Record<string, unknown> }): string {
  const merged = ensureFullUiPermissionsMatrix(
    body.permissions as Record<string, import("../lib/permissions").UiPermissionSet> | undefined,
  );
  return JSON.stringify(merged);
}

router.get("/roles", requireAuth, requirePermission("roles", "read"), async (_req, res): Promise<void> => {
  const roles = await prisma.role.findMany();
  res.json(roles.filter((r) => !isPortalSystemRoleName(r.name)).map(parseRole));
});

router.post("/roles", requireAuth, requirePermission("roles", "create"), async (req, res): Promise<void> => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const role = await prisma.role.create({ data: {
    name: parsed.data.name,
    permissions: serializePermissions(parsed.data),
  }});
  res.status(201).json(parseRole(role));
});

router.get("/roles/:id", requireAuth, requirePermission("roles", "read"), async (req, res): Promise<void> => {
  const params = GetRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const role = await prisma.role.findUnique({ where: { id: params.data.id } });
  if (!role || isPortalSystemRoleName(role.name)) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json(parseRole(role));
});

router.put("/roles/:id", requireAuth, requirePermission("roles", "update"), async (req, res): Promise<void> => {
  const id = parseRoleIdParam(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid role id" });
    return;
  }
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  if (!existing || isPortalSystemRoleName(existing.name)) {
    res.status(403).json({
      error: "Supplier and manufacturer portal roles are system roles and cannot be edited here.",
    });
    return;
  }
  const role = await prisma.role
    .update({
      where: { id },
      data: {
        name: parsed.data.name,
        permissions: serializePermissions(parsed.data),
      },
    })
    .catch(() => null);
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json(parseRole(role));
});

router.delete("/roles/:id", requireAuth, requirePermission("roles", "delete"), async (req, res): Promise<void> => {
  const id = parseRoleIdParam(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid role id" });
    return;
  }
  const existing = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  if (isPortalSystemRoleName(existing.name)) {
    res.status(403).json({
      error: "Supplier and manufacturer portal roles are system roles and cannot be deleted.",
    });
    return;
  }
  const role = await prisma.role.delete({ where: { id } }).catch(() => null);
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
