import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewType } from '@/types';

export type MainTab = 'chat' | 'friends' | 'profile';

interface UIState {
  currentView: ViewType;
  splashDone: boolean;
  mainTab: MainTab;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  // Overlay states
  searchOpen: boolean;
  notificationsOpen: boolean;
  settingsOpen: boolean;
  // Setters
  setView: (view: ViewType) => void;
  setSplashDone: (done: boolean) => void;
  setMainTab: (tab: MainTab) => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'splash',
      splashDone: false,
      mainTab: 'chat',
      sidebarOpen: true,
      mobileSidebarOpen: false,
      searchOpen: false,
      notificationsOpen: false,
      settingsOpen: false,
      setView: (currentView) => set({ currentView }),
      setSplashDone: (splashDone) => set({ splashDone }),
      setMainTab: (mainTab) => set({ mainTab }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleMobileSidebar: () =>
        set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    {
      name: 'kivo-ui',
      partialize: (state) => ({
        splashDone: state.splashDone,
      }),
    }
  )
);