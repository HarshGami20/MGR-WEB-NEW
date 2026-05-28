export type OrdersAssignmentScope = "all" | "created_by_me" | "assigned_to_me" | "own";

export type SalesScopeUser = {
  isSales?: boolean | null;
  ordersListScope?: string | null;
};

const SCOPE_LABELS: Record<OrdersAssignmentScope, string> = {
  all: "All orders",
  own: "Created by or assigned to me",
  created_by_me: "Created by me",
  assigned_to_me: "Assigned to me",
};

export function ordersScopeLabel(scope: OrdersAssignmentScope | string | null | undefined): string {
  if (scope === "assigned_to_me" || scope === "created_by_me") return SCOPE_LABELS.own;
  if (scope && scope in SCOPE_LABELS) return SCOPE_LABELS[scope as OrdersAssignmentScope];
  return SCOPE_LABELS.all;
}

export function getSalesOrderScopeConfig(user: SalesScopeUser | null | undefined) {
  const isSalesUser = user?.isSales === true;
  const raw = user?.ordersListScope;
  const configured: OrdersAssignmentScope =
    raw === "all"
      ? "all"
      : raw === "assigned_to_me" || raw === "created_by_me" || raw === "own"
        ? "own"
        : isSalesUser
          ? "own"
          : "all";

  if (!isSalesUser) {
    return {
      isSalesUser: false,
      showScopePicker: false,
      forcedScope: null as OrdersAssignmentScope | null,
      configuredScope: "all" as OrdersAssignmentScope,
      scopeLabel: SCOPE_LABELS.all,
    };
  }

  if (configured === "own") {
    return {
      isSalesUser: true,
      showScopePicker: false,
      forcedScope: "own" as OrdersAssignmentScope,
      configuredScope: "own",
      scopeLabel: SCOPE_LABELS.own,
    };
  }

  return {
    isSalesUser: true,
    showScopePicker: true,
    forcedScope: null as OrdersAssignmentScope | null,
    configuredScope: "all",
    scopeLabel: SCOPE_LABELS.all,
  };
}
