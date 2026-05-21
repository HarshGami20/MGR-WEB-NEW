import { prisma, toNumber } from "./prisma";

export async function getDefaultGstPercent(
  db: Pick<typeof prisma, "setting"> = prisma,
): Promise<number> {
  const settings = await db.setting.findFirst();
  return settings ? toNumber(settings.defaultGstPercent) : 18;
}
