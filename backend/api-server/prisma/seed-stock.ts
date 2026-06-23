/**
 * Sets on-hand stock to a fixed quantity for every product and variant.
 *
 * Updates product/variant stock_qty AND writes branch inventory_logs so the
 * ERP UI (which reads branchStocks from logs) shows the new quantities.
 *
 * Prefer running the production-safe JS entrypoint instead:
 *     node --env-file=.env scripts/seed-stock.mjs --yes
 *     ./scripts/seed-stock.sh --yes
 *     npm run seed:stock -- --yes
 *
 * The `--yes` flag (or `CONFIRM=yes` env var) is required so this operation
 * cannot run by accident.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { syncProductStockFromVariants } from "../src/lib/product-stock";

const prisma = new PrismaClient();
const LOG_BATCH_SIZE = 500;

function isConfirmed(): boolean {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  const env = process.env.CONFIRM?.trim().toLowerCase();
  return env === "yes" || env === "y" || env === "true" || env === "1";
}

function parseTargetQty(): number {
  const qtyArg = process.argv.find((arg) => arg.startsWith("--qty="));
  if (qtyArg) {
    const parsed = Number.parseInt(qtyArg.slice("--qty=".length), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Invalid --qty value: ${qtyArg}`);
    }
    return parsed;
  }

  const qtyIndex = process.argv.indexOf("--qty");
  if (qtyIndex !== -1) {
    const parsed = Number.parseInt(process.argv[qtyIndex + 1] ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("Invalid --qty value. Example: --qty 1000");
    }
    return parsed;
  }

  const fromEnv = process.env.SEED_STOCK_QTY?.trim();
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Invalid SEED_STOCK_QTY: ${fromEnv}`);
    }
    return parsed;
  }

  return 1000;
}

type InventoryLogSeedRow = {
  productId: number;
  variantId: number | null;
  branchId: number | null;
  type: string;
  quantity: number;
  notes: string;
};

function buildInventoryLogRows(input: {
  targetQty: number;
  branchIds: Array<number | null>;
  variants: Array<{ id: number; productId: number }>;
  simpleProductIds: number[];
}): InventoryLogSeedRow[] {
  const notes = `Stock seed — set to ${input.targetQty}`;
  const rows: InventoryLogSeedRow[] = [];

  for (const branchId of input.branchIds) {
    for (const variant of input.variants) {
      rows.push({
        productId: variant.productId,
        variantId: variant.id,
        branchId,
        type: "adjustment",
        quantity: input.targetQty,
        notes,
      });
    }
    for (const productId of input.simpleProductIds) {
      rows.push({
        productId,
        variantId: null,
        branchId,
        type: "adjustment",
        quantity: input.targetQty,
        notes,
      });
    }
  }

  return rows;
}

async function createLogsInBatches(tx: Prisma.TransactionClient, rows: InventoryLogSeedRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += LOG_BATCH_SIZE) {
    await tx.inventoryLog.createMany({
      data: rows.slice(i, i + LOG_BATCH_SIZE),
    });
  }
}

async function main() {
  if (!isConfirmed()) {
    console.error(
      "Refusing to run without explicit confirmation.\n" +
        "Re-run with `--yes` or `CONFIRM=yes` to seed product and variant stock.",
    );
    process.exit(1);
  }

  const targetQty = parseTargetQty();
  const dbUrl = process.env.DATABASE_URL ?? "(unset)";
  const masked = dbUrl.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");

  console.log(`Seeding product and variant stock to ${targetQty}…`);
  console.log(`  DATABASE_URL: ${masked}\n`);

  const [productCount, variantCount, logCount, branchCount] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.inventoryLog.count(),
    prisma.branch.count({ where: { isActive: true } }),
  ]);

  console.log("Before:");
  console.log(`  products:         ${productCount}`);
  console.log(`  product_variants: ${variantCount}`);
  console.log(`  inventory_logs:   ${logCount}`);
  console.log(`  active branches:  ${branchCount}\n`);

  const result = await prisma.$transaction(async (tx) => {
    const deletedLogs = await tx.inventoryLog.deleteMany();

    const updatedVariants = await tx.productVariant.updateMany({
      data: { stockQty: targetQty },
    });

    const variants = await tx.productVariant.findMany({
      select: { id: true, productId: true },
    });
    const productIdsWithVariants = new Set(variants.map((row) => row.productId));

    const simpleProducts = await tx.product.findMany({
      where: { id: { notIn: [...productIdsWithVariants] } },
      select: { id: true },
    });
    const simpleProductIds = simpleProducts.map((row) => row.id);

    const updatedSimpleProducts = await tx.product.updateMany({
      where: { id: { in: simpleProductIds } },
      data: { stockQty: targetQty },
    });

    for (const productId of productIdsWithVariants) {
      await syncProductStockFromVariants(productId, tx);
    }

    const activeBranches = await tx.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    const branchIds: Array<number | null> =
      activeBranches.length > 0 ? activeBranches.map((branch) => branch.id) : [null];

    const inventoryLogRows = buildInventoryLogRows({
      targetQty,
      branchIds,
      variants,
      simpleProductIds,
    });
    await createLogsInBatches(tx, inventoryLogRows);

    return {
      deletedLogs,
      updatedVariants,
      updatedSimpleProducts,
      syncedProducts: productIdsWithVariants.size,
      branchesUsed: activeBranches.length,
      inventoryLogsCreated: inventoryLogRows.length,
    };
  });

  const [sampleVariant, sampleProduct] = await Promise.all([
    prisma.productVariant.findFirst({
      select: { id: true, sku: true, stockQty: true },
      orderBy: { id: "asc" },
    }),
    prisma.product.findFirst({
      where: { variants: { none: {} } },
      select: { id: true, sku: true, stockQty: true },
      orderBy: { id: "asc" },
    }),
  ]);

  console.log("Done:");
  console.log(`  target quantity:         ${targetQty}`);
  console.log(`  branches seeded:         ${result.branchesUsed || "unassigned (no active branches)"}`);
  console.log(`  inventory_logs deleted:  ${result.deletedLogs.count}`);
  console.log(`  inventory_logs created:  ${result.inventoryLogsCreated}`);
  console.log(`  variants updated:        ${result.updatedVariants.count}`);
  console.log(`  simple products updated: ${result.updatedSimpleProducts.count}`);
  console.log(`  variant parents synced:  ${result.syncedProducts}`);
  if (sampleVariant) {
    console.log(`  sample variant:          ${sampleVariant.sku} => stock_qty ${sampleVariant.stockQty}`);
  }
  if (sampleProduct) {
    console.log(`  sample product:          ${sampleProduct.sku} => stock_qty ${sampleProduct.stockQty}`);
  }
}

main()
  .catch((e) => {
    console.error("\nFailed to seed stock:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
