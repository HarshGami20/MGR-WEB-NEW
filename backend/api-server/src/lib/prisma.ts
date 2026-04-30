import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString(): string }).toString());
  }
  return Number(value);
}
