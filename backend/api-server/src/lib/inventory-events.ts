import { emitSafe } from "./app-events";
import { prisma } from "./prisma";

export type InventoryUpdatedEmitInput = {
  productId: number;
  variantId?: number | null;
  type: "in" | "out" | "adjustment";
  quantity: number;
  newStockQty: number;
  notes?: string | null;
  branchId?: number | null;
  updatedById?: number | null;
};

/** Emit after stock changes (inventory adjust, product/variant stock edit). */
export async function emitInventoryUpdated(input: InventoryUpdatedEmitInput): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { name: true, sku: true },
  });
  if (!product) return;

  let variantName: string | null = null;
  if (input.variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      select: { name: true },
    });
    variantName = variant?.name?.trim() || null;
  }

  emitSafe("INVENTORY_UPDATED", {
    productId: input.productId,
    variantId: input.variantId ?? null,
    productName: product.name,
    productSku: product.sku,
    variantName,
    adjustmentType: input.type,
    quantity: input.quantity,
    newStockQty: input.newStockQty,
    notes: input.notes?.trim() || null,
    branchId: input.branchId ?? null,
    updatedById: input.updatedById ?? null,
  });
}
