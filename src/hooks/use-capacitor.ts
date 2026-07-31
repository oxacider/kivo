'use client';

import { useMemo } from 'react';
import {
  isNative,
  isAndroid,
  isIOS,
  isWeb,
  platform,
} from '@/lib/capacitor';

/**
 * React hook exposing Capacitor platform info.
 * Values are stable (derived from Capacitor singleton, not React state).
 */
export function useCapacitor() {
  return useMemo(
    () => ({ isNative, isAndroid, isIOS, isWeb, platform }),
    [],
  );
}
