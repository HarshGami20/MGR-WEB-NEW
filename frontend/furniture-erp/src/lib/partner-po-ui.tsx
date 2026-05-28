import { Badge } from "@/components/ui/badge";
import { poStatusLabel } from "@/lib/partner-po-attributes";

export function poStatusChip(status: string) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="rounded-full border-yellow-200 bg-yellow-50 text-yellow-700">
          Pending
        </Badge>
      );
    case "confirmed":
      return (
        <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700">
          Confirmed
        </Badge>
      );
    case "in_production":
      return (
        <Badge variant="outline" className="rounded-full border-purple-200 bg-purple-50 text-purple-700">
          In production
        </Badge>
      );
    case "shipped":
      return (
        <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-700">
          Shipped
        </Badge>
      );
    case "delivered":
      return (
        <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">
          Delivered
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="rounded-full capitalize">
          {poStatusLabel(status)}
        </Badge>
      );
  }
}
