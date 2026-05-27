/**
 * Recomputes `totalAmount` on every existing order so it equals `subtotal + taxAmount`
 * (i.e. items + GST only — delivery charge is no longer rolled into the order total).
 *
 * This is needed once after switching the order create/update logic to stop adding
 * delivery charge to `totalAmount`. The script is idempotent: orders that already
 * match `subtotal + taxAmount` (within rounding) are skipped. Orders that look like
 * they include delivery (`totalAmount ≈ subtotal + taxAmount + deliveryCharge`) are
 * lowered to `subtotal + taxAmount`. Anything else is left alone and reported.
 *
 * Run from backend/api-server:
 *     bun run prisma/recalc-order-totals.ts --yes
 *     CONFIRM=yes bun run prisma/recalc-order-totals.ts
 *
 * Add --dry-run (or DRY_RUN=yes) to preview without writing.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function isConfirmed(): boolean {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  const env = process.env.CONFIRM?.trim().toLowerCase();
  return env === "yes" || env === "y" || env === "true" || env === "1";
}

function isDryRun(): boolean {
  if (process.argv.includes("--dry-run")) return true;
  const env = process.env.DRY_RUN?.trim().toLowerCase();
  return env === "yes" || env === "y" || env === "true" || env === "1";
}

function n(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
}

const EPSILON = 0.01;

async function main() {
  if (!isConfirmed() && !isDryRun()) {
    console.error(
      "Refusing to run without confirmation. Pass --yes (or CONFIRM=yes), or --dry-run to preview.",
    );
    process.exit(1);
  }
  const dry = isDryRun();
  if (dry) console.log("DRY RUN — no writes will be performed.");

  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      taxAmount: true,
      deliveryCharge: true,
      totalAmount: true,
      paidAmount: true,
    },
    orderBy: { id: "asc" },
  });

  let unchanged = 0;
  let lowered = 0;
  let skippedMismatch = 0;

  for (const o of orders) {
    const subtotal = n(o.subtotal);
    const taxAmount = n(o.taxAmount);
    const deliveryCharge = n(o.deliveryCharge);
    const totalAmount = n(o.totalAmount);
    const itemsPlusGst = subtotal + taxAmount;
    const itemsPlusGstPlusDelivery = itemsPlusGst + deliveryCharge;

    if (Math.abs(totalAmount - itemsPlusGst) < EPSILON) {
      unchanged += 1;
      continue;
    }
    if (Math.abs(totalAmount - itemsPlusGstPlusDelivery) < EPSILON) {
      lowered += 1;
      const next = itemsPlusGst.toFixed(2);
      console.log(
        `Order ${o.orderNumber} (#${o.id}): totalAmount ${totalAmount.toFixed(2)} -> ${next} (delivery ${deliveryCharge.toFixed(2)} excluded)`,
      );
      if (!dry) {
        await prisma.order.update({
          where: { id: o.id },
          data: { totalAmount: next },
        });
      }
      continue;
    }
    skippedMismatch += 1;
    console.warn(
      `Order ${o.orderNumber} (#${o.id}): totalAmount ${totalAmount.toFixed(2)} does not match items+GST (${itemsPlusGst.toFixed(2)}) nor items+GST+delivery (${itemsPlusGstPlusDelivery.toFixed(2)}). Skipped — review manually.`,
    );
  }

  console.log("---");
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Lowered  : ${lowered}${dry ? " (dry run, no writes)" : ""}`);
  console.log(`Skipped  : ${skippedMismatch}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
