'use client';

import { useEffect, useCallback } from 'react';
import { useSafeArea } from '@/hooks/use-safe-area';
import { setStatusBarStyle, platform, isNative, hideSplash, onBackButton, exitApp } from '@/lib/capacitor';
import { navigateBack } from '@/lib/navigation';
import { useTheme } from 'next-themes';

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
    // Try to navigate back within the app first.
    // If we're at the root, exit the app.
    if (!navigateBack()) {
      exitApp();
    }
  }, []);

  useEffect(() => {
    const cleanup = onBackButton(handleBackButton);
    return cleanup;
  }, [handleBackButton]);

  return null;
}
