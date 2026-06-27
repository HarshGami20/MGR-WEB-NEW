import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { setBranchIdGetter } from "@/api-client/custom-fetch";
import { useAuth } from "@/lib/auth";

/** True when the signed-in user is the Super Admin role (full branch access, no assignments). */
export function isSuperAdminUser(
  user: { role?: { name?: string | null } | null } | null | undefined,
): boolean {
  return user?.role?.name === "Super Admin";
}

/** Admin or Super Admin — required for destructive bulk order delete. */
export function isAdminOrSuperAdminUser(
  user: { role?: { name?: string | null } | null } | null | undefined,
): boolean {
  if (isSuperAdminUser(user)) return true;
  return user?.role?.name === "Admin";
}

/** Branch ids the signed-in user may work in (from `/auth/me`: `branchIds`, `branches`, or legacy `branchId`). */
export function assignedUserBranchIds(
  user: {
    branchIds?: number[] | null;
    branches?: { id: number }[] | null;
    branchId?: number | null;
    role?: { name?: string | null } | null;
  } | null | undefined,
): number[] {
  if (!user || isSuperAdminUser(user)) return [];
  const raw = user.branchIds;
  if (Array.isArray(raw) && raw.length > 0) {
    return [...new Set(raw.filter((id) => Number.isFinite(id)))].sort((a, b) => a - b);
  }
  const fromBranches = user.branches;
  if (Array.isArray(fromBranches) && fromBranches.length > 0) {
    return [...new Set(fromBranches.map((b) => b.id).filter((id) => Number.isFinite(id)))].sort((a, b) => a - b);
  }
  if (user.branchId != null && Number.isFinite(user.branchId)) return [user.branchId];
  return [];
}

interface BranchContextType {
  selectedBranchId: number | null;
  setSelectedBranchId: (id: number | null) => void;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const STORAGE_KEY = "erp_selected_branch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedBranchId, setSelectedBranchIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const setSelectedBranchId = (id: number | null) => {
    setSelectedBranchIdState(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  };

  useEffect(() => {
    const assigned = assignedUserBranchIds(user);
    if (assigned.length === 1) {
      setSelectedBranchIdState(assigned[0]!);
      localStorage.setItem(STORAGE_KEY, String(assigned[0]));
      return;
    }
    if (assigned.length > 1) {
      setSelectedBranchIdState((prev) => {
        if (prev != null && !assigned.includes(prev)) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return prev;
      });
    }
  }, [user?.branchIds, user?.branchId, user?.branches, user?.role?.name]);

  useEffect(() => {
    setBranchIdGetter(() => {
      const assigned = assignedUserBranchIds(user);
      if (assigned.length === 1) return assigned[0]!;
      return selectedBranchId;
    });
    return () => setBranchIdGetter(null);
  }, [user?.branchIds, user?.branchId, user?.role?.name, selectedBranchId]);

  return (
    <BranchContext.Provider value={{ selectedBranchId, setSelectedBranchId }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
