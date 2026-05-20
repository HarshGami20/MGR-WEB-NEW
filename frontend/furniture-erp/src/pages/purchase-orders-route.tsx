import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";
import PartnerPurchaseOrdersListPage from "@/pages/partner/purchase-orders-list";
import PurchaseOrders from "@/pages/purchase-orders";

/** Staff catalog vs supplier/manufacturer order list. */
export default function PurchaseOrdersRoute() {
  const { user } = useAuth();
  if (isPartnerPortalUser(user)) return <PartnerPurchaseOrdersListPage />;
  return <PurchaseOrders />;
}
