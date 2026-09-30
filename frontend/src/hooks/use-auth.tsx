import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, AuthUser, getToken, setToken } from '@/api/auth';

export const GUEST_LIMIT = 2;

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  guestUsed: number;
  messagesLeft: number;
  canSend: boolean;
  consumeGuestMessage: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  loginWithGithub: (code: string) => Promise<void>;
  logout: () => void;
  setPlan: (plan: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  // sessionStorage → each tab gets its own guest quota and session
  const [guestUsed, setGuestUsed] = useState(() =>
    Number(sessionStorage.getItem('GenAiGuestUsed') || 0)
  );

  const messagesLeft = user ? Infinity : Math.max(0, GUEST_LIMIT - guestUsed);
  const canSend = !!user || guestUsed < GUEST_LIMIT;

  const consumeGuestMessage = useCallback(() => {
    setGuestUsed(prev => {
      const next = prev + 1;
      sessionStorage.setItem('GenAiGuestUsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    // Cross-tab handoff: landing → new /app tab carries the session via ?at=token
    // (sessionStorage keeps tabs independent; only an explicit link shares the login)
    const url = new URL(window.location.href);
    const at = url.searchParams.get('at');
    if (at) {
      setToken(at);
      url.searchParams.delete('at');
      window.history.replaceState({}, '', url.toString());
    }
    authApi.me()
      .then(u => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const finishAuth = (token: string, u: AuthUser) => {
    setToken(token);
    setUser(u);
    setAuthModalOpen(false);
  };

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await authApi.login(email, password);
    finishAuth(token, user);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await authApi.signup(name, email, password);
    finishAuth(token, user);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { token, user } = await authApi.google(credential);
    finishAuth(token, user);
  }, []);

  const loginWithGithub = useCallback(async (code: string) => {
    const { token, user } = await authApi.github(code);
    finishAuth(token, user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const setPlan = useCallback(async (plan: string) => {
    const { user } = await authApi.setPlan(plan);
    setUser(user);
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    const { user } = await authApi.updateProfile(name);
    setUser(user);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, authModalOpen, setAuthModalOpen, guestUsed, messagesLeft, canSend, consumeGuestMessage, login, signup, loginWithGoogle, loginWithGithub, logout, setPlan, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
