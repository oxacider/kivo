'client';

import { useEffect, useSyncExternalStore } from 'react';
import { isNative } from '@/lib/capacitor';

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function readInsetsFromCSS(): SafeAreaInsets {
  if (typeof document === 'undefined') return ZERO_INSETS;
  const style = getComputedStyle(document.documentElement);
  const get = (prop: string) => parseInt(style.getPropertyValue(prop), 10) || 0;
  return {
    top: get('env(safe-area-inset-top)'),
    right: get('env(safe-area-inset-right)'),
    bottom: get('env(safe-area-inset-bottom)'),
    left: get('env(safe-area-inset-left)'),
  };
}

function applyCSSVars(insets: SafeAreaInsets) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--kivo-safe-top', `${insets.top}px`);
  root.style.setProperty('--kivo-safe-right', `${insets.right}px`);
  root.style.setProperty('--kivo-safe-bottom', `${insets.bottom}px`);
  root.style.setProperty('--kivo-safe-left', `${insets.left}px`);
}

let listeners: Array<() => void> = [];
let cachedInsets: SafeAreaInsets = ZERO_INSETS;

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): SafeAreaInsets {
  return cachedInsets;
}

function getServerSnapshot(): SafeAreaInsets {
  return ZERO_INSETS;
}

function notifyListeners() {
  listeners.forEach((l) => l());
}

/**
 * Returns safe area insets for the current device.
 *
 * - On native Android/iOS: uses CSS env() variables (driven by the
 *   system status bar, gesture nav, notch, etc.).
 * - On web: returns zeros (browsers don't have safe areas unless
 *   using the Web App Manifest with `display: standalone`).
 *
 * The hook also applies CSS custom properties to :root so that
 * Tailwind utility classes can reference them.
 */
export function useSafeArea(): SafeAreaInsets {
  const insets = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Read once on mount
    cachedInsets = readInsetsFromCSS();
    applyCSSVars(cachedInsets);
    notifyListeners();

    if (!isNative) return;

    function onResize() {
      cachedInsets = readInsetsFromCSS();
      applyCSSVars(cachedInsets);
      notifyListeners();
    }

    window.addEventListener('resize', onResize);
    screen.orientation?.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      screen.orientation?.removeEventListener('change', onResize);
    };
  }, []);

  return insets;
}
