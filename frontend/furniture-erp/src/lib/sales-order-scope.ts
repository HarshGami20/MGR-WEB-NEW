export type OrdersAssignmentScope = "all" | "created_by_me" | "assigned_to_me";

export type SalesScopeUser = {
  isSales?: boolean | null;
  ordersListScope?: string | null;
};

const SCOPE_LABELS: Record<OrdersAssignmentScope, string> = {
  all: "All orders",
  created_by_me: "Created by me",
  assigned_to_me: "Assigned to me",
};

export function ordersScopeLabel(scope: OrdersAssignmentScope | string | null | undefined): string {
  if (scope && scope in SCOPE_LABELS) return SCOPE_LABELS[scope as OrdersAssignmentScope];
  return "All orders";
}

export function getSalesOrderScopeConfig(user: SalesScopeUser | null | undefined) {
  const isSalesUser = user?.isSales === true;
  const configured = (user?.ordersListScope as OrdersAssignmentScope) || "all";

  if (!isSalesUser) {
    return {
      isSalesUser: false,
      showScopePicker: false,
      forcedScope: null as OrdersAssignmentScope | null,
      configuredScope: "all" as OrdersAssignmentScope,
      scopeLabel: SCOPE_LABELS.all,
    };
  }

  if (configured === "assigned_to_me" || configured === "created_by_me") {
    return {
      isSalesUser: true,
      showScopePicker: false,
      forcedScope: configured,
      configuredScope: configured,
      scopeLabel: SCOPE_LABELS[configured],
    };
  }

  return {
    isSalesUser: true,
    showScopePicker: true,
    forcedScope: null as OrdersAssignmentScope | null,
    configuredScope: "all" as OrdersAssignmentScope,
    scopeLabel: SCOPE_LABELS.all,
  };
}
