'use client';

import { useEffect, useState, useCallback } from 'react';
import { Network } from '@capacitor/network';
import type { ConnectionStatus } from '@capacitor/network';
import { isNative } from '@/lib/capacitor';

interface NetworkState {
  connected: boolean;
  connectionType: string;
}

const WEB_DEFAULT: NetworkState = { connected: true, connectionType: 'wifi' };

/**
 * Monitors network connectivity.
 * - On native: uses @capacitor/network plugin (real-time updates).
 * - On web: navigator.onLine + online/offline events (browser fallback).
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkState>(WEB_DEFAULT);

  useEffect(() => {
    if (isNative) {
      // Native: use Capacitor Network plugin
      let cancelled = false;
      let listenerHandle: Awaited<ReturnType<typeof Network.addListener>> | null = null;
      Network.getStatus().then((s) => {
        if (!cancelled) setStatus({ connected: s.connected, connectionType: s.connectionType });
      });
      Network.addListener('networkStatusChange', (s: ConnectionStatus) => {
        if (!cancelled) setStatus({ connected: s.connected, connectionType: s.connectionType });
      }).then((handle) => {
        listenerHandle = handle;
      });
      return () => {
        cancelled = true;
        listenerHandle?.remove();
      };
    }

    // Web: use navigator.onLine
    const update = () => setStatus({ connected: navigator.onLine, connectionType: navigator.onLine ? 'wifi' : 'none' });
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const isOffline = !status.connected;

  return { ...status, isOffline };
}

/**
 * Returns a stable function that checks connectivity once.
 * Useful for guard checks before API calls.
 */
export function useIsOnline(): () => boolean {
  const getStatus = useCallback(() => {
    if (isNative) {
      // Synchronous check not available; assume connected (Capacitor handles reconnection)
      return true;
    }
    return navigator.onLine;
  }, []);
  return getStatus;
}
