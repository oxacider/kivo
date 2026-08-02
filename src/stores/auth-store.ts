import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { enableNotifications, disableNotifications } from '@/lib/notifications';
import type { User } from '@/types';

/**
 * Auth store.
 *
 * The Firebase ID token is NEVER stored here (or in localStorage, React
 * state, or any cache). The token is a short-lived credential whose only
 * source of truth is Firebase Auth (`auth.currentUser.getIdToken()`), and it
 * is fetched fresh by the centralized `authFetch` helper in `@/lib/api` on
 * every authenticated request.
 *
 * This store only tracks:
 *  - `user`   → the hydrated KIVO profile (identity, not a credential)
 *  - `isDemo` → whether the session is the local demo account
 */
interface AuthState {
  user: User | null;
  isDemo: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  setIsDemo: (isDemo: boolean) => void;
  updateUser: (data: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isDemo: false,
      isLoading: false,

      setUser: (user) => set({ user }),
      setIsDemo: (isDemo) => set({ isDemo }),
      updateUser: (data) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        })),
      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        const { isDemo } = get();
        if (!isDemo) {
          // End the Firebase session (Firebase Auth is the source of truth).
          signOut(auth).catch(() => {});
          disableNotifications().catch(() => {});
        }
        set({ user: null, isDemo: false });
      },
    }),
    {
      name: 'kivo-auth',
      // Only persist the user profile + demo flag. NEVER the ID token.
      partialize: (state) => ({ user: state.user, isDemo: state.isDemo }),
      // v2: purge any legacy cached `token` / `setToken` remnants from older
      // persists so no Firebase ID token ever survives in localStorage.
      version: 2,
      migrate: (persisted: any) => {
        const { user = null, isDemo = false } = persisted ?? {};
        return { user, isDemo };
      },
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
  const { isDemo } = useAuthStore.getState();
  // Skip for demo accounts (no real backend to send pushes)
  if (isDemo) return;
  enableNotifications().catch(() => {});
}
