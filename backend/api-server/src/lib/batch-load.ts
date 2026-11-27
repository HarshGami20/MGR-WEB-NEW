/** Helpers for loading related rows in one query per table instead of one query per row (N+1). */

/** Distinct positive ids, ignoring null/undefined. */
export function uniqueIds(values: Array<number | null | undefined>): number[] {
  const out = new Set<number>();
  for (const v of values) {
    if (v != null && Number.isFinite(v) && v > 0) out.add(v);
  }
  return [...out];
}

/** Run `load` only when there are ids; skips a pointless query for an empty `IN ()`. */
export async function loadByIds<T>(ids: number[], load: (ids: number[]) => Promise<T[]>): Promise<T[]> {
  return ids.length > 0 ? load(ids) : [];
}

export function mapById<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export function groupByKey<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
