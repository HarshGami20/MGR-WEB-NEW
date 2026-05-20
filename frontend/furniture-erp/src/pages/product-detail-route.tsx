import { useAuth } from "@/lib/auth";
import { isPartnerPortalUser } from "@/lib/partner";
import PartnerProductDetailPage from "@/pages/partner/product-detail";
import ProductDetail from "@/pages/product-detail";

/** Staff product admin vs partner read-only product spec. */
export default function ProductDetailRoute() {
  const { user } = useAuth();
  if (isPartnerPortalUser(user)) return <PartnerProductDetailPage />;
  return <ProductDetail />;
}
