/**
 * Clears all stock and inventory data from the database.
 *
 *   - Deletes every row in `inventory_logs`.
 *   - Resets `stock_qty` to 0 on every Product and ProductVariant.
 *
 * Products, variants, categories, orders, etc. are left intact – only the
 * on-hand stock numbers and the movement history are wiped.
 *
 * Run from backend/api-server:
 *     npm run clear:stock -- --yes
 *     CONFIRM=yes npm run clear:stock
 *
 * The `--yes` flag (or `CONFIRM=yes` env var) is required so this destructive
 * operation can never run by accident.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function isConfirmed(): boolean {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  const env = process.env.CONFIRM?.trim().toLowerCase();
  return env === "yes" || env === "y" || env === "true" || env === "1";
}

async function main() {
  if (!isConfirmed()) {
    console.error(
      "Refusing to run without explicit confirmation.\n" +
        "Re-run with `--yes` or `CONFIRM=yes` to clear all stock and inventory.",
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? "(unset)";
  const masked = dbUrl.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
  console.log("Clearing stock and inventory…");
  console.log(`  DATABASE_URL: ${masked}\n`);

  const [productCount, variantCount, logCount] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.inventoryLog.count(),
  ]);

  console.log("Before:");
  console.log(`  products:        ${productCount}`);
  console.log(`  product_variants:${variantCount}`);
  console.log(`  inventory_logs:  ${logCount}\n`);

  const result = await prisma.$transaction(async (tx) => {
    const deletedLogs = await tx.inventoryLog.deleteMany();
    const updatedProducts = await tx.product.updateMany({
      where: { stockQty: { not: 0 } },
      data: { stockQty: 0 },
    });
    const updatedVariants = await tx.productVariant.updateMany({
      where: { stockQty: { not: 0 } },
      data: { stockQty: 0 },
    });
    return { deletedLogs, updatedProducts, updatedVariants };
  });

  console.log("Done:");
  console.log(`  inventory_logs deleted: ${result.deletedLogs.count}`);
  console.log(`  products zeroed:        ${result.updatedProducts.count}`);
  console.log(`  variants zeroed:        ${result.updatedVariants.count}`);
}

main()
  .catch((e) => {
    console.error("\nFailed to clear stock/inventory:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
