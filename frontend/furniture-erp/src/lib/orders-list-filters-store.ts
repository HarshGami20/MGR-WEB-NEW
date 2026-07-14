import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { DateRangeValue } from "@/lib/list-date-filter";

export type OrdersListPaymentStatus = "all" | "due" | "partially_paid" | "paid";
export type OrdersListGstFilter = "all" | "true" | "false";
export type OrdersListSort = "newest" | "oldest";
export type OrdersListAssignmentScope = "all" | "created_by_me" | "assigned_to_me" | "own";

export type OrdersListFiltersState = {
  searchDraft: string;
  appliedSearch: string;
  status: string;
  isGst: OrdersListGstFilter;
  paymentStatus: OrdersListPaymentStatus;
  sort: OrdersListSort;
  assignmentScope: OrdersListAssignmentScope;
  createdDateRange: DateRangeValue;
  categoryId: number | undefined;
  page: number;
};

const DEFAULT_FILTERS: OrdersListFiltersState = {
  searchDraft: "",
  appliedSearch: "",
  status: "all",
  isGst: "all",
  paymentStatus: "all",
  sort: "newest",
  assignmentScope: "all",
  createdDateRange: {},
  categoryId: undefined,
  page: 1,
};

/** In-memory session store — survives SPA navigation, clears on browser refresh. */
let filtersState: OrdersListFiltersState = { ...DEFAULT_FILTERS };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return filtersState;
}

export function patchOrdersListFilters(
  patch: Partial<OrdersListFiltersState>,
  opts?: { resetPage?: boolean },
) {
  const resetPage = opts?.resetPage ?? true;
  const next: OrdersListFiltersState = {
    ...filtersState,
    ...patch,
    ...(resetPage && patch.page === undefined ? { page: 1 } : {}),
  };
  // Keep same reference if nothing meaningful changed
  if (
    next.searchDraft === filtersState.searchDraft &&
    next.appliedSearch === filtersState.appliedSearch &&
    next.status === filtersState.status &&
    next.isGst === filtersState.isGst &&
    next.paymentStatus === filtersState.paymentStatus &&
    next.sort === filtersState.sort &&
    next.assignmentScope === filtersState.assignmentScope &&
    next.categoryId === filtersState.categoryId &&
    next.page === filtersState.page &&
    next.createdDateRange.from === filtersState.createdDateRange.from &&
    next.createdDateRange.to === filtersState.createdDateRange.to
  ) {
    return;
  }
  filtersState = next;
  emit();
}

export function useOrdersListFilters() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSearchDraft = useCallback((searchDraft: string) => {
    patchOrdersListFilters({ searchDraft }, { resetPage: false });
  }, []);

  const setAppliedSearch = useCallback((appliedSearch: string) => {
    patchOrdersListFilters({ appliedSearch });
  }, []);

  const setStatus = useCallback((status: string) => {
    patchOrdersListFilters({ status });
  }, []);

  const setIsGst = useCallback((isGst: OrdersListGstFilter) => {
    patchOrdersListFilters({ isGst });
  }, []);

  const setPaymentStatus = useCallback((paymentStatus: OrdersListPaymentStatus) => {
    patchOrdersListFilters({ paymentStatus });
  }, []);

  const setSort = useCallback((sort: OrdersListSort) => {
    patchOrdersListFilters({ sort });
  }, []);

  const setAssignmentScope = useCallback((assignmentScope: OrdersListAssignmentScope) => {
    patchOrdersListFilters({ assignmentScope });
  }, []);

  const setCreatedDateRange = useCallback((createdDateRange: DateRangeValue) => {
    patchOrdersListFilters({ createdDateRange });
  }, []);

  const setCategoryId = useCallback((categoryId: number | undefined) => {
    patchOrdersListFilters({ categoryId });
  }, []);

  const setPage = useCallback((updater: (prev: number) => number) => {
    patchOrdersListFilters({ page: updater(getSnapshot().page) }, { resetPage: false });
  }, []);

  return useMemo(
    () => ({
      ...state,
      setSearchDraft,
      setAppliedSearch,
      setStatus,
      setIsGst,
      setPaymentStatus,
      setSort,
      setAssignmentScope,
      setCreatedDateRange,
      setCategoryId,
      setPage,
    }),
    [
      state,
      setSearchDraft,
      setAppliedSearch,
      setStatus,
      setIsGst,
      setPaymentStatus,
      setSort,
      setAssignmentScope,
      setCreatedDateRange,
      setCategoryId,
      setPage,
    ],
  );
}
