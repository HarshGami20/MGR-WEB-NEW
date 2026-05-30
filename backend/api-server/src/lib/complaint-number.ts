import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const COMPLAINT_NUMBER_PREFIX = "CMP-";

/** Next sequential complaint number: CMP-1, CMP-2, … (ignores legacy long IDs). */
export async function generateComplaintNumber(
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const rows = await db.$queryRaw<Array<{ next: number | bigint | null }>>`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(complaint_number FROM 5) AS INTEGER)),
      0
    ) + 1 AS next
    FROM complaints
    WHERE complaint_number ~ '^CMP-[0-9]+$'
  `;
  const next = Number(rows[0]?.next ?? 1);
  return `${COMPLAINT_NUMBER_PREFIX}${next}`;
}
