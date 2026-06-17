/**
 * Recomputes `totalAmount` on every existing order so it equals
 * `subtotal + taxAmount + deliveryCharge`.
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
  let updated = 0;
  let skippedMismatch = 0;

  for (const o of orders) {
    const subtotal = n(o.subtotal);
    const taxAmount = n(o.taxAmount);
    const deliveryCharge = n(o.deliveryCharge);
    const totalAmount = n(o.totalAmount);
    const expectedTotal = subtotal + taxAmount + deliveryCharge;

    if (Math.abs(totalAmount - expectedTotal) < EPSILON) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    const next = expectedTotal.toFixed(2);
    console.log(
      `Order ${o.orderNumber} (#${o.id}): totalAmount ${totalAmount.toFixed(2)} -> ${next} (delivery ${deliveryCharge.toFixed(2)} included)`,
    );
    if (!dry) {
      await prisma.order.update({
        where: { id: o.id },
        data: { totalAmount: next },
      });
    }
  }

  console.log("---");
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Updated  : ${updated}${dry ? " (dry run, no writes)" : ""}`);
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
