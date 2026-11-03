"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth";

type UserRole = "SUPER_ADMIN" | "PROJECT_ADMIN" | "QA_TESTER" | "VIEWER";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  canManageProject: (projectId: string) => boolean;
  canAccessProject: (projectId: string) => boolean;
  isSuperAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

AuthContext.displayName = "AuthContext";

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Initialize auth on mount
  useEffect(() => {
    async function initAuth() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setUser({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role,
          });
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  // Login function
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(errorBody.error || "Login failed");
      }

      const data = await res.json();
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
      router.push("/");
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Register function
  const register = async (name: string, email: string, password: string, role: UserRole) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(errorBody.error || "Registration failed");
      }

      const data = await res.json();
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
      router.push("/");
    } catch (error) {
      console.error("Registration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Permission checks - simplified to role-based only
  const canManageProject: (projectId: string) => boolean = (projectId: string) => {
    if (!user) return false;
    if (user.role === "SUPER_ADMIN") return true;
    if (user.role === "PROJECT_ADMIN") return true;
    return false;
  };

  const canAccessProject: (projectId: string) => boolean = (projectId: string) => {
    if (!user) return false;
    return user.role === "SUPER_ADMIN" || user.role === "PROJECT_ADMIN" || user.role === "QA_TESTER" || user.role === "VIEWER";
  };

  const isSuperAdmin: boolean = user?.role === "SUPER_ADMIN";

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, canManageProject, canAccessProject, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
