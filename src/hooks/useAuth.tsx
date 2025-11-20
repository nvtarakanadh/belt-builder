import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_BASE } from "@/lib/config";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { username: string } | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ username: string } | null>(null);

  useEffect(() => {
    // Check if user is authenticated (check for session cookie)
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/auth/user/`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.username) {
            setIsAuthenticated(true);
            setUser({ username: data.username || "User" });
            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        // Not authenticated - silently fail
      }
      // Not authenticated
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const data = await response.json();
      setIsAuthenticated(true);
      setUser({ username: data.user?.username || username });
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Invalid credentials");
    }
  };

  const logout = async () => {
    await fetch(`${API_BASE}/api/auth/logout/`, {
      method: "POST",
      credentials: "include",
    });
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

