export type OrderStaffCommentRow = {
  comment: string;
  authorName?: string;
  createdAt: string;
};

function commentKey(row: OrderStaffCommentRow): string {
  return `${row.createdAt}|${row.comment}`;
}

export function parseStaffCommentsJson(raw: string | null | undefined): OrderStaffCommentRow[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is OrderStaffCommentRow => x != null && typeof x === "object")
      .map((x) => ({
        comment: String((x as OrderStaffCommentRow).comment ?? "").trim(),
        authorName: (x as OrderStaffCommentRow).authorName?.trim() || undefined,
        createdAt: String((x as OrderStaffCommentRow).createdAt ?? ""),
      }))
      .filter((x) => x.comment.length > 0);
  } catch {
    return [];
  }
}

/** Comments present in `after` but not in `before`. */
export function findNewStaffComments(
  before: OrderStaffCommentRow[],
  after: OrderStaffCommentRow[],
): OrderStaffCommentRow[] {
  const keys = new Set(before.map(commentKey));
  return after.filter((row) => !keys.has(commentKey(row)));
}

export function normalizeStaffCommentsPayload(raw: unknown): OrderStaffCommentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is OrderStaffCommentRow => x != null && typeof x === "object")
    .map((x) => ({
      comment: String(x.comment ?? "").trim(),
      authorName: x.authorName?.trim() || undefined,
      createdAt: String(x.createdAt ?? new Date().toISOString()),
    }))
    .filter((x) => x.comment.length > 0);
}

/** View-only comment adds must preserve existing entries in order. */
export function staffCommentsAreAppendOnly(
  before: OrderStaffCommentRow[],
  after: OrderStaffCommentRow[],
): boolean {
  if (after.length < before.length) return false;
  for (let i = 0; i < before.length; i += 1) {
    if (commentKey(before[i]!) !== commentKey(after[i]!)) return false;
  }
  return true;
}
