import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  fetchAdminMe,
  loginAdmin,
  type AdminProfile,
} from '../utils/api.ts';

const TOKEN_STORAGE_KEY = 'arafa_admin_session_token';

interface AuthContextValue {
  admin: AdminProfile | null;
  loading: boolean;
  authError: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }

    fetchAdminMe(saved)
      .then((profile) => {
        setToken(saved);
        setAdmin(profile);
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const signIn = async (username: string, password: string) => {
    setAuthError(null);
    try {
      const result = await loginAdmin(username, password);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      setToken(result.token);
      setAdmin(result.admin);
    } catch (err: any) {
      const msg = err?.message || 'Sign-in failed.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setAdmin(null);
    setAuthError(null);
  };

  const getToken = async () => {
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        loading,
        authError,
        signIn,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
