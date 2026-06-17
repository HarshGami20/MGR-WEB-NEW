export type PaginationPageItem = number | "ellipsis";

const EDGE_PAGE_COUNT = 3;

function range(start: number, end: number): number[] {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/**
 * Compact pagination items:
 * - Start: 1 2 3 … 20
 * - Middle: 1 … 9 10 11 … 20
 * - End: 1 … 18 19 20
 */
export function getPaginationPageItems(
  currentPage: number,
  totalPages: number,
): PaginationPageItem[] {
  if (totalPages < 1) return [];
  if (totalPages === 1) return [1];

  if (totalPages <= EDGE_PAGE_COUNT * 2 + 1) {
    return range(1, totalPages);
  }

  const nearStart = currentPage <= EDGE_PAGE_COUNT;
  const nearEnd = currentPage > totalPages - EDGE_PAGE_COUNT;

  if (nearStart) {
    return [...range(1, EDGE_PAGE_COUNT), "ellipsis", totalPages];
  }

  if (nearEnd) {
    return [1, "ellipsis", ...range(totalPages - EDGE_PAGE_COUNT + 1, totalPages)];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}
