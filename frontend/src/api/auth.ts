const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'GenAiWorkspaceToken';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  provider: string;
  plan: 'free' | 'plus' | 'pro';
  created_at: string;
  usage?: { used: number; limit: number | null };
}

// sessionStorage → each browser tab is an independent session (login doesn't leak across tabs)
export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
};

async function post<T>(path: string, body: object, auth = false): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || `Request failed (${res.status})`);
  return data as T;
}

export const authApi = {
  signup: (name: string, email: string, password: string) =>
    post<{ token: string; user: AuthUser }>('/auth/signup', { name, email, password }),

  login: (email: string, password: string) =>
    post<{ token: string; user: AuthUser }>('/auth/login', { email, password }),

  google: (credential: string) =>
    post<{ token: string; user: AuthUser }>('/auth/google', { credential }),

  github: (code: string) =>
    post<{ token: string; user: AuthUser }>('/auth/github', { code }),

  setPlan: (plan: string) =>
    post<{ user: AuthUser }>('/auth/plan', { plan }, true),

  updateProfile: (name: string) =>
    post<{ user: AuthUser }>('/auth/profile', { name }, true),

  changePassword: (current_password: string | null, new_password: string) =>
    post<{ ok: boolean }>('/auth/password', { current_password, new_password }, true),

  forgotPassword: (email: string) =>
    post<{ ok: boolean; emailed?: boolean; dev_link?: string }>('/auth/forgot', { email }),

  resetPassword: (token: string, new_password: string) =>
    post<{ ok: boolean }>('/auth/reset', { token, new_password }),

  checkout: (plan: 'plus' | 'pro') =>
    post<{ checkout_url: string | null; unavailable?: boolean; message?: string }>(
      '/billing/checkout', { plan }, true
    ),

  deleteAccount: async () => {
    const res = await fetch(`${API_BASE_URL}/auth/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Delete failed');
    return res.json();
  },

  getChats: () =>
    fetch(`${API_BASE_URL}/auth/chats`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => (r.ok ? r.json() : { chats: [] }))
      .then(d => (d as { chats: any[] }).chats)
      .catch(() => []),

  saveChats: (chats: any[]) =>
    fetch(`${API_BASE_URL}/auth/chats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ chats }),
    }).catch(() => {}),

  me: async (): Promise<AuthUser | null> => {
    if (!getToken()) return null;
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as AuthUser;
  },

  config: async (): Promise<{ google_client_id: string | null; github_client_id: string | null }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/config`);
      return await res.json();
    } catch {
      return { google_client_id: null, github_client_id: null };
    }
  },
};
