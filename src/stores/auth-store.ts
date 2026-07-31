import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { enableNotifications, disableNotifications } from '@/lib/notifications';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  updateUser: (data: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        const { token } = get();
        // Server-side: invalidate JWT + mark offline
        if (token && !token.startsWith('demo-')) {
          api('/auth/logout', { token, method: 'POST', body: {} }).catch(() => {});
        }
        // Client-side: remove FCM token
        disableNotifications().catch(() => {});
        set({ user: null, token: null });
      },
    }),
    {
      name: 'kivo-auth',
    }
  )
);

/* ------------------------------------------------------------------ */
/*  Notification trigger — call after confirmed login/signup         */
/* ------------------------------------------------------------------ */

/**
 * Enable push notifications for the authenticated user.
 * Call this ONLY from login/signup success handlers — NOT from
 * session restore / page refresh.
 */
export function triggerNotifications() {
  const { token } = get();
  // Skip for demo tokens (no real backend to send pushes)
  if (!token || token.startsWith('demo-')) return;
  enableNotifications().catch(() => {});
}
