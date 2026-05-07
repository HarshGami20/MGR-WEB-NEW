import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Upsert attribute keys and option values from variant attributes JSON (`{"Color":"Red"}`). */
export async function syncAttributeCatalogFromJson(
  attrsJson: string | null | undefined,
  db: Db = prisma,
): Promise<void> {
  if (!attrsJson || !String(attrsJson).trim()) return;
  let obj: Record<string, string>;
  try {
    obj = JSON.parse(attrsJson) as Record<string, string>;
  } catch {
    return;
  }
  for (const [rawKey, rawVal] of Object.entries(obj)) {
    const keyName = String(rawKey).trim();
    const val = String(rawVal).trim();
    if (!keyName || !val) continue;
    const key = await db.attributeKey.upsert({
      where: { name: keyName },
      create: { name: keyName },
      update: {},
    });
    await db.attributeOption.upsert({
      where: { keyId_value: { keyId: key.id, value: val } },
      create: { keyId: key.id, value: val },
      update: {},
    });
  }
}
