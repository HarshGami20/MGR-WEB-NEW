import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe } from "@/api-client";
import type { User } from "@/api-client";
import { clearAuthToken, getAuthToken, setAuthToken as persistAuthToken } from "@/lib/auth-storage";

interface AuthContextType {
  user: User | null | undefined;
  isLoading: boolean;
  login: (token: string, rememberMe?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAuthToken());

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
      clearAuthToken();
    }
  }, [error]);

  const login = (newToken: string, rememberMe = true) => {
    persistAuthToken(newToken, rememberMe);
    setToken(newToken);
  };

  const logout = () => {
    clearAuthToken();
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
