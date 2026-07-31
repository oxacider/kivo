'use client';

import { useEffect } from 'react';
import { useSafeArea } from '@/hooks/use-safe-area';
import { setStatusBarStyle, platform, isNative, hideSplash } from '@/lib/capacitor';
import { useTheme } from 'next-themes';

/**
 * Invisible bootstrapper that:
 * 1. Reads safe-area-inset-* from CSS env() and applies as CSS vars
 * 2. Sets `data-kivo-platform` on <body> for CSS scoping
 * 3. Sets the native StatusBar style to match the current theme
 * 4. Hides the native splash screen after mount
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

  return null;
}
