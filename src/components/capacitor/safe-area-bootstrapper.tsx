'use client';

import { useEffect, useCallback } from 'react';
import { useSafeArea } from '@/hooks/use-safe-area';
import { setStatusBarStyle, platform, isNative, hideSplash, onBackButton, exitApp } from '@/lib/capacitor';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';

/**
 * Invisible bootstrapper that:
 * 1. Reads safe-area-inset-* from CSS env() and applies as CSS vars
 * 2. Sets `data-kivo-platform` on <body> for CSS scoping
 * 3. Sets the native StatusBar style to match the current theme
 * 4. Hides the native splash screen after mount
 * 5. Registers Android hardware back button handler
 *
 * Renders nothing. Must be inside ThemeProvider.
 */
export function SafeAreaBootstrapper() {
  useSafeArea(); // reads + applies CSS vars as a side-effect
  const { resolvedTheme } = useTheme();

  // Set platform data attribute on body (for CSS scoping)
  useEffect(() => {
    if (isNative) {
      document.body.setAttribute('data-kivo-platform', platform);
    }
  }, []);

  // Sync native StatusBar with theme
  useEffect(() => {
    const isDark = resolvedTheme === 'dark';
    setStatusBarStyle(isDark);
  }, [resolvedTheme]);

  // Hide native splash after first render
  useEffect(() => {
    if (isNative) {
      // Small delay to let the web splash animation play
      const timer = setTimeout(() => hideSplash(), 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Android hardware back button
  const handleBackButton = useCallback(() => {
    const ui = useUIStore.getState();
    const chat = useChatStore.getState();

    // Priority 1: close search overlay
    if (ui.searchOpen) {
      ui.setSearchOpen(false);
      return;
    }

    // Priority 2: close notifications sheet
    if (ui.notificationsOpen) {
      ui.setNotificationsOpen(false);
      return;
    }

    // Priority 3: close settings sheet
    if (ui.settingsOpen) {
      ui.setSettingsOpen(false);
      return;
    }

    // Priority 4: close open conversation on mobile
    if (chat.activeConversationId) {
      chat.setActiveConversationId(null);
      return;
    }

    // Priority 5: auth screens → go back to welcome
    if (ui.currentView === 'signin' || ui.currentView === 'signup' || ui.currentView === 'forgot-password' || ui.currentView === 'verify-email') {
      ui.setView('welcome');
      return;
    }

    // Priority 6: secondary tabs → go to chat tab
    if (ui.mainTab !== 'chat' && ui.currentView === 'chat') {
      ui.setMainTab('chat');
      return;
    }

    // Priority 7: on main chat view → exit app
    exitApp();
  }, []);

  useEffect(() => {
    const cleanup = onBackButton(handleBackButton);
    return cleanup;
  }, [handleBackButton]);

  return null;
}
