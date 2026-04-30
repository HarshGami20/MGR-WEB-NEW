import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe } from "@/api-client";
import type { User } from "@/api-client";

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("erp_token"));

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: ["me", token],
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (error) {
      setToken(null);
      localStorage.removeItem("erp_token");
    }
  }, [error]);

  const login = (newToken: string) => {
    localStorage.setItem("erp_token", newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("erp_token");
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: isLoading && !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
