import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewType } from '@/types';

interface UIState {
  currentView: ViewType;
  splashDone: boolean;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  setView: (view: ViewType) => void;
  setSplashDone: (done: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'splash',
      splashDone: false,
      sidebarOpen: true,
      mobileSidebarOpen: false,
      setView: (currentView) => set({ currentView }),
      setSplashDone: (splashDone) => set({ splashDone }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleMobileSidebar: () =>
        set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
    }),
    {
      name: 'kivo-ui',
      partialize: (state) => ({
        splashDone: state.splashDone,
      }),
    }
  )
);
