'use client';

import { useCallback } from 'react';
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticError, hapticWarning, isNative } from '@/lib/capacitor';

/**
 * React hook for haptic feedback.
 * All functions are no-ops on web.
 */
export function useHaptics() {
  const light = useCallback(() => void hapticLight(), []);
  const medium = useCallback(() => void hapticMedium(), []);
  const heavy = useCallback(() => void hapticHeavy(), []);
  const success = useCallback(() => void hapticSuccess(), []);
  const error = useCallback(() => void hapticError(), []);
  const warning = useCallback(() => void hapticWarning(), []);

  return { light, medium, heavy, success, error, warning, isNative };
}
