import { Router, IRouter, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { readBranchIdFromRequest, requireWriteBranchId } from "../lib/branch-scope";
import { assignedBranchIds } from "../lib/user-branches";
import {
  countOrdersInSlot,
  parseDeliveryDateInput,
  parseServicePincodes,
  slotServesPincode,
  utcDateOnly,
} from "../lib/delivery-slots";

const router: IRouter = Router();

async function resolveReadBranchId(
  req: Request,
  user: { branchId?: number | null; userBranches?: { branchId: number }[] },
): Promise<number | null> {
  const assigned = assignedBranchIds(user);
  const fromReq = readBranchIdFromRequest(req);
  if (assigned.length === 1) {
    return assigned[0]!;
  }
  if (assigned.length > 1) {
    if (fromReq != null && assigned.includes(fromReq)) return fromReq;
    return null;
  }
  if (fromReq != null) {
    const b = await prisma.branch.findFirst({ where: { id: fromReq, isActive: true }, select: { id: true } });
    return b ? fromReq : null;
  }
  return null;
}

/** JS weekday: 0 Sun … 6 Sat */
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const PRESET_DISPLAY: Record<"morning" | "afternoon" | "evening" | "full_day", string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  full_day: "Full day",
};

const PRESET_TIMES: Record<keyof typeof PRESET_DISPLAY, [string, string]> = {
  morning: ["09:00", "12:00"],
  afternoon: ["12:00", "15:00"],
  evening: ["16:00", "20:00"],
  full_day: ["10:00", "18:00"],
};

const BatchCreateSlotsBody = z
  .object({
    fromDate: z.string().min(1),
    toDate: z.string().min(1),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    timeMode: z.enum(["morning", "afternoon", "evening", "full_day", "custom"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    labelPrefix: z.string().optional(),
    maxOrders: z.coerce.number().int().min(1).max(500),
    servicePincodes: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.timeMode === "custom") {
      if (!data.startTime?.trim() || !data.endTime?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Custom time mode requires startTime and endTime (HH:mm)",
          path: ["startTime"],
        });
      } else if (data.startTime >= data.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time",
          path: ["endTime"],
        });
      }
    }
  });

const CreateSlotBody = z.object({
  slotDate: z.string().min(1),
  label: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxOrders: z.coerce.number().int().min(1).max(500),
  servicePincodes: z.array(z.string()).optional(),
});

const UpdateSlotBody = CreateSlotBody.partial().extend({
  slotDate: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  maxOrders: z.coerce.number().int().min(1).max(500).optional(),
});

router.get("/delivery-slots", requireAuth, requirePermission("deliveries", "read"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await resolveReadBranchId(req, user);
  if (branchId == null) {
    res.status(400).json({ error: "Select a branch (header X-Branch-Id or branchId query) to list delivery slots." });
    return;
  }
  const fromQ = typeof req.query.from === "string" ? req.query.from : "";
  const toQ = typeof req.query.to === "string" ? req.query.to : "";
  const from = parseDeliveryDateInput(fromQ);
  const to = parseDeliveryDateInput(toQ);
  const where: { branchId: number; slotDate?: { gte: Date; lte: Date } } = { branchId };
  if (from && to) {
    where.slotDate = { gte: from, lte: to };
  } else if (from) {
    where.slotDate = { gte: from, lte: from };
  }
  const slots = await prisma.deliverySlot.findMany({
    where,
    orderBy: [{ slotDate: "asc" }, { startTime: "asc" }, { id: "asc" }],
  });
  const withCounts = await Promise.all(
    slots.map(async (s) => {
      const booked = await countOrdersInSlot(prisma, s.id);
      return {
        ...s,
        bookedCount: booked,
        remaining: Math.max(0, s.maxOrders - booked),
        servicePincodes: parseServicePincodes(s.servicePincodes),
      };
    }),
  );
  res.json({ data: withCounts });
});

router.get("/delivery-slots/available", requireAuth, requirePermission("orders", "read"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await resolveReadBranchId(req, user);
  if (branchId == null) {
    res.status(400).json({ error: "Select a branch to load available delivery slots." });
    return;
  }
  const dateStr = typeof req.query.date === "string" ? req.query.date : "";
  const day = parseDeliveryDateInput(dateStr);
  if (!day) {
    res.status(400).json({ error: "Query ?date=YYYY-MM-DD is required" });
    return;
  }
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.trim() : "";
  const excludeOrderId =
    typeof req.query.excludeOrderId === "string" && req.query.excludeOrderId
      ? parseInt(req.query.excludeOrderId, 10)
      : undefined;

  const slots = await prisma.deliverySlot.findMany({
    where: { branchId, slotDate: utcDateOnly(day) },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  const out: Array<{
    id: number;
    label: string;
    startTime: string;
    endTime: string;
    maxOrders: number;
    bookedCount: number;
    remaining: number;
    servicePincodes: string[];
  }> = [];
  for (const s of slots) {
    if (!slotServesPincode(s.servicePincodes, pincode || null)) continue;
    const booked = await countOrdersInSlot(prisma, s.id, Number.isFinite(excludeOrderId) ? excludeOrderId : undefined);
    const remaining = Math.max(0, s.maxOrders - booked);
    out.push({
      id: s.id,
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime,
      maxOrders: s.maxOrders,
      bookedCount: booked,
      remaining,
      servicePincodes: parseServicePincodes(s.servicePincodes),
    });
  }
  res.json({ data: out });
});

router.post("/delivery-slots/batch", requireAuth, requirePermission("deliveries", "create"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await requireWriteBranchId(req, res, user);
  if (branchId == null) return;
  const parsed = BatchCreateSlotsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = parseDeliveryDateInput(parsed.data.fromDate);
  const to = parseDeliveryDateInput(parsed.data.toDate);
  if (!from || !to || from.getTime() > to.getTime()) {
    res.status(400).json({ error: "Invalid fromDate / toDate range" });
    return;
  }
  const maxSpanMs = 186 * 86400000;
  if (to.getTime() - from.getTime() > maxSpanMs) {
    res.status(400).json({ error: "Date range cannot exceed ~6 months" });
    return;
  }

  let startTime: string;
  let endTime: string;
  if (parsed.data.timeMode === "custom") {
    startTime = String(parsed.data.startTime).trim();
    endTime = String(parsed.data.endTime).trim();
  } else {
    const pair = PRESET_TIMES[parsed.data.timeMode];
    startTime = pair[0];
    endTime = pair[1];
  }

  const weekdaySet = new Set(parsed.data.weekdays);
  const pinsJson = JSON.stringify(parsed.data.servicePincodes ?? []);
  const labelPrefix = (parsed.data.labelPrefix ?? "").trim();

  const presetLabel =
    parsed.data.timeMode === "custom"
      ? `${startTime}–${endTime}`
      : PRESET_DISPLAY[parsed.data.timeMode];

  const existing = await prisma.deliverySlot.findMany({
    where: { branchId, slotDate: { gte: from, lte: to } },
    select: { slotDate: true, startTime: true, endTime: true },
  });
  const existingKeys = new Set(
    existing.map((e) => {
      const d = utcDateOnly(e.slotDate);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}|${e.startTime}|${e.endTime}`;
    }),
  );

  type Row = {
    branchId: number;
    slotDate: Date;
    label: string;
    startTime: string;
    endTime: string;
    maxOrders: number;
    servicePincodes: string;
  };
  const rows: Row[] = [];
  let skippedDuplicates = 0;
  let cur = utcDateOnly(from);
  const endDay = utcDateOnly(to);

  while (cur.getTime() <= endDay.getTime()) {
    const dayUtc = cur;
    const dow = dayUtc.getUTCDay();
    if (weekdaySet.has(dow)) {
      const y = dayUtc.getUTCFullYear();
      const m = String(dayUtc.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dayUtc.getUTCDate()).padStart(2, "0");
      const ymd = `${y}-${m}-${d}`;
      const key = `${ymd}|${startTime}|${endTime}`;
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
      } else {
        existingKeys.add(key);
        const dayName = WEEKDAY_SHORT[dow];
        const base = labelPrefix || presetLabel;
        const label = `${base} · ${dayName} ${ymd}`;
        rows.push({
          branchId,
          slotDate: dayUtc,
          label,
          startTime,
          endTime,
          maxOrders: parsed.data.maxOrders,
          servicePincodes: pinsJson,
        });
      }
    }
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
  }

  const maxCreate = 500;
  const toInsert = rows.slice(0, maxCreate);
  const overflow = rows.length - toInsert.length;

  if (toInsert.length === 0) {
    res.status(200).json({ created: 0, skippedDuplicates, skippedOverflow: overflow, message: "No new slots to add" });
    return;
  }

  await prisma.deliverySlot.createMany({ data: toInsert });
  res.status(201).json({
    created: toInsert.length,
    skippedDuplicates,
    skippedOverflow: overflow,
  });
});

router.post("/delivery-slots", requireAuth, requirePermission("deliveries", "create"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const branchId = await requireWriteBranchId(req, res, user);
  if (branchId == null) return;
  const parsed = CreateSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const day = parseDeliveryDateInput(parsed.data.slotDate);
  if (!day) {
    res.status(400).json({ error: "Invalid slotDate" });
    return;
  }
  const pins = parsed.data.servicePincodes ?? [];
  const slot = await prisma.deliverySlot.create({
    data: {
      branchId,
      slotDate: day,
      label: parsed.data.label,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      maxOrders: parsed.data.maxOrders,
      servicePincodes: JSON.stringify(pins),
    },
  });
  res.status(201).json({ ...slot, servicePincodes: pins, bookedCount: 0, remaining: slot.maxOrders });
});

router.put("/delivery-slots/:id", requireAuth, requirePermission("deliveries", "update"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await prisma.deliverySlot.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }
  const assigned = assignedBranchIds(user);
  if (assigned.length > 0 && !assigned.includes(existing.branchId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdateSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: {
    slotDate?: Date;
    label?: string;
    startTime?: string;
    endTime?: string;
    maxOrders?: number;
    servicePincodes?: string;
  } = {};
  if (parsed.data.slotDate != null) {
    const d = parseDeliveryDateInput(parsed.data.slotDate);
    if (!d) {
      res.status(400).json({ error: "Invalid slotDate" });
      return;
    }
    data.slotDate = d;
  }
  if (parsed.data.label != null) data.label = parsed.data.label;
  if (parsed.data.startTime != null) data.startTime = parsed.data.startTime;
  if (parsed.data.endTime != null) data.endTime = parsed.data.endTime;
  if (parsed.data.maxOrders != null) data.maxOrders = parsed.data.maxOrders;
  if (parsed.data.servicePincodes != null) data.servicePincodes = JSON.stringify(parsed.data.servicePincodes);

  const updated = await prisma.deliverySlot.update({ where: { id }, data });
  const booked = await countOrdersInSlot(prisma, id);
  res.json({
    ...updated,
    servicePincodes: parseServicePincodes(updated.servicePincodes),
    bookedCount: booked,
    remaining: Math.max(0, updated.maxOrders - booked),
  });
});

router.delete("/delivery-slots/:id", requireAuth, requirePermission("deliveries", "delete"), async (req, res): Promise<void> => {
  const user = (req as { user?: { branchId?: number | null; userBranches?: { branchId: number }[] } }).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await prisma.deliverySlot.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }
  const assigned = assignedBranchIds(user);
  if (assigned.length > 0 && !assigned.includes(existing.branchId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.deliverySlot.delete({ where: { id } });
  res.json({ success: true });
});

export default router;
