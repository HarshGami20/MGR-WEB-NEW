import { prisma } from "./prisma";

export function parseDeliveryCharge(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function resolveDriverIdForOrder(
  driverId: unknown,
  branchId: number | null,
): Promise<number | null> {
  if (driverId == null || driverId === "") return null;
  const id = Number(driverId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid driver");
  const driver = await prisma.driver.findFirst({
    where: {
      id,
      isActive: true,
      ...(branchId != null
        ? { OR: [{ branchId }, { branchId: null }] }
        : {}),
    },
    select: { id: true },
  });
  if (!driver) throw new Error("Driver not found or inactive for this branch");
  return id;
}

export function enrichDriverRow(driver: {
  id: number;
  branchId: number | null;
  name: string;
  mobile: string | null;
  vehicleInfo: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: { id: number; name: string; code: string } | null;
  _count?: { orders: number; payments: number };
}) {
  return {
    id: driver.id,
    branchId: driver.branchId,
    name: driver.name,
    mobile: driver.mobile,
    vehicleInfo: driver.vehicleInfo,
    isActive: driver.isActive,
    notes: driver.notes,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
    branch: driver.branch ?? null,
    deliveryCount: driver._count?.orders ?? 0,
    paymentCount: driver._count?.payments ?? 0,
  };
}
