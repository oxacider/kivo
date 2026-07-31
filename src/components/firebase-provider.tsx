'use client';

import { useEffect, useRef } from 'react';
import { onMessage, type MessagePayload } from 'firebase/messaging';
import { getMessagingInstance } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useUIStore } from '@/stores/ui-store';
import type { KIVONotificationData } from '@/lib/notifications';

/* ------------------------------------------------------------------ */
/*  Service Worker Registration                                       */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((reg) => {
      console.info('[KIVO FCM] Service worker registered:', reg.scope);
    })
    .catch((err) => {
      console.warn('[KIVO FCM] Service worker registration failed:', err);
    });
}

/* ------------------------------------------------------------------ */
/*  Foreground Notification Handler                                   */
/* ------------------------------------------------------------------ */

function handleForegroundMessage(payload: MessagePayload) {
  const notification = payload.notification;
  const data = (payload.data || {}) as unknown as KIVONotificationData;

  // Don't show notification if user is already viewing this conversation
  const activeId = useChatStore.getState().activeConversationId;
  if (activeId === data.conversationId) return;

  const title = notification?.title || 'KIVO';
  const body = notification?.body || 'You have a new message';

  // Use the Browser Notification API for foreground messages
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.conversationId ? `kivo-${data.conversationId}` : 'kivo-notification',
      data,
    });

    // Click → navigate to chat
    n.onclick = () => {
      window.focus();
      if (data.conversationId) {
        useChatStore.getState().setActiveConversationId(data.conversationId);
      }
      n.close();
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Provider Component                                                */
/* ------------------------------------------------------------------ */

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isLoggedIn = !!user && !!token;
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Always register the service worker (needed for background notifications)
    registerServiceWorker();

    return () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  // Set up foreground message listener when user is logged in
  useEffect(() => {
    if (!isLoggedIn) {
      // Clean up listener on logout
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    getMessagingInstance().then((messaging) => {
      if (cancelled || !messaging) return;

      const unsubscribe = onMessage(messaging, (payload) => {
        handleForegroundMessage(payload);
      });

      listenerRef.current = unsubscribe;
    });

    return () => {
      cancelled = true;
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, [isLoggedIn]);

  return <>{children}</>;
}
