import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
    (set) => ({
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
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'kivo-auth',
    }
  )
);
