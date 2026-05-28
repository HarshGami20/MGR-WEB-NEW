import {
  categoryNodeById,
  loadCategoryNodes,
  mainCategoryName,
  resolveMainCategoryId,
  type CategoryNode,
} from "./category-filter";
import { toNumber } from "./prisma";

export type CategoryRevenueMatrixRow = {
  categoryId: number | null;
  categoryName: string;
  /** Revenue keyed by period column id (YYYY-MM-DD or YYYY-MM) */
  byPeriod: Record<string, number>;
  totalRevenue: number;
};

export type CategoryRevenueMatrix = {
  periodType: "day" | "month";
  periods: Array<{ key: string; label: string }>;
  rows: CategoryRevenueMatrixRow[];
};

type OrderForMatrix = {
  createdAt: Date;
  totalAmount: unknown;
  categoryId: number | null;
};

function periodKeyForOrder(
  dt: Date,
  periodType: "day" | "month",
): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  if (periodType === "month") return `${y}-${m}`;
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addToCell(
  matrix: Map<number | null, Map<string, number>>,
  mainId: number | null,
  periodKey: string,
  amount: number,
): void {
  if (!matrix.has(mainId)) matrix.set(mainId, new Map());
  const row = matrix.get(mainId)!;
  row.set(periodKey, (row.get(periodKey) ?? 0) + amount);
}

function allocateOrderToMatrix(
  order: OrderForMatrix,
  periodType: "day" | "month",
  singlePeriodKey: string | null,
  byId: Map<number, CategoryNode>,
  matrix: Map<number | null, Map<string, number>>,
): void {
  const periodKey =
    singlePeriodKey ?? periodKeyForOrder(new Date(order.createdAt), periodType);
  const orderMainId = resolveMainCategoryId(order.categoryId, byId);
  addToCell(matrix, orderMainId, periodKey, toNumber(order.totalAmount));
}

export async function buildCategoryRevenueMatrix(
  orders: OrderForMatrix[],
  opts: {
    periodType: "day" | "month";
    periodKeys: string[];
    periodLabels: Map<string, string>;
  },
): Promise<CategoryRevenueMatrix> {
  const nodes = await loadCategoryNodes();
  const byId = categoryNodeById(nodes);
  const mainCategories = nodes.filter((n) => n.parentId == null).sort((a, b) => a.name.localeCompare(b.name));

  const matrix = new Map<number | null, Map<string, number>>();
  for (const main of mainCategories) {
    matrix.set(main.id, new Map());
  }
  matrix.set(null, new Map());

  const singlePeriodKey =
    opts.periodKeys.length === 1 && opts.periodKeys[0] === "total" ? "total" : null;

  for (const order of orders) {
    allocateOrderToMatrix(order, opts.periodType, singlePeriodKey, byId, matrix);
  }

  const rowIds: Array<number | null> = [
    ...mainCategories.map((m) => m.id),
    ...(matrix.get(null) && Array.from(matrix.get(null)!.values()).some((v) => v > 0) ? [null] : []),
  ];

  const rows: CategoryRevenueMatrixRow[] = rowIds.map((categoryId) => {
    const cells = matrix.get(categoryId) ?? new Map();
    const byPeriod: Record<string, number> = {};
    let totalRevenue = 0;
    for (const key of opts.periodKeys) {
      const v = Number((cells.get(key) ?? 0).toFixed(2));
      byPeriod[key] = v;
      totalRevenue += v;
    }
    return {
      categoryId,
      categoryName: mainCategoryName(categoryId, byId),
      byPeriod,
      totalRevenue: Number(totalRevenue.toFixed(2)),
    };
  });

  const periods = opts.periodKeys.map((key) => ({
    key,
    label: opts.periodLabels.get(key) ?? key,
  }));

  return { periodType: opts.periodType, periods, rows };
}
