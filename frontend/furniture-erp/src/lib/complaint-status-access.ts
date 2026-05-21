import { isSuperAdminUser } from "@/lib/branch-context";
import type { Complaint } from "@/lib/complaint-api";

export function canUpdateComplaintStatus(
  user: { id?: number; role?: { name?: string | null } | null } | null | undefined,
  complaint: Pick<Complaint, "assignees">,
): boolean {
  if (!user?.id) return false;
  if (isSuperAdminUser(user)) return true;
  const assignees = complaint.assignees ?? [];
  return assignees.some((a) => a.id === user.id);
}
