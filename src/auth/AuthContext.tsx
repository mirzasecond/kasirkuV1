import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  hasPermission: (menuId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Validasi sesi ke server saat aplikasi dibuka. User & permission SELALU
  // diambil dari database lewat /api/auth/me — data di localStorage hanya
  // dipakai untuk menampilkan nama, bukan sumber kebenaran role/permission
  // (mencegah eskalasi privilaseg dengan mengedit localStorage di DevTools).
  useEffect(() => {
    const token = localStorage.getItem('kasirku_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('http://localhost:3000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Sesi tidak valid');

        const data = await response.json();
        if (cancelled) return;

        const fresh: User = {
          ...data.user,
          permissions: Array.isArray(data.user.permissions) ? data.user.permissions : [],
        };
        localStorage.setItem('kasirku_user', JSON.stringify(fresh));
        setUser(fresh);
      } catch {
        // Token kedaluwarsa, ditandatangani palsu, user dihapus/dinonaktifkan.
        if (cancelled) return;
        localStorage.removeItem('kasirku_token');
        localStorage.removeItem('kasirku_user');
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Login failed');
      }

      const result = await response.json();
      const userData: User = {
        ...result.user,
        permissions: Array.isArray(result.user.permissions) ? result.user.permissions : [],
      };
      
      // Store token and user
      localStorage.setItem('kasirku_token', result.token);
      localStorage.setItem('kasirku_user', JSON.stringify(userData));
      
      setUser(userData);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('kasirku_token');
    localStorage.removeItem('kasirku_user');
    setUser(null);
  };

  // admin role always has every menu; otherwise check the permissions list.
  const hasPermission = (menuId: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!Array.isArray(user.permissions)) return false;
    return user.permissions.includes(menuId) || user.permissions.includes('__ALL__');
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isLoading,
    error,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
