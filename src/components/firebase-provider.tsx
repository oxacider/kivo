'use client';

import { useEffect, useRef } from 'react';
import { onMessage, type MessagePayload } from 'firebase/messaging';
import { getMessagingInstance } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { isNative, hapticMedium } from '@/lib/capacitor';
import { initPushSystem, type KIVONotificationData } from '@/lib/notifications';
import { markConversationDelivered } from '@/lib/message-status';

/* ------------------------------------------------------------------ */
/*  Service Worker Registration (web only)                             */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (isNative) return;
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
/*  Foreground Notification Handler (web only)                        */
/* ------------------------------------------------------------------ */

function handleForegroundMessage(payload: MessagePayload) {
  const notification = payload.notification;
  const data = (payload.data || {}) as unknown as KIVONotificationData & { senderName?: string };

  const activeId = useChatStore.getState().activeConversationId;
  // Suppress notification if the user is already viewing this conversation
  if (activeId === data.conversationId) return;

  const senderName = data.senderName || 'KIVO';
  const title = data.conversationId ? senderName : (notification?.title || 'KIVO');
  const body = notification?.body || 'You have a new message';

  if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: data.conversationId ? `kivo-${data.conversationId}` : 'kivo-notification',
      silent: false,
      requireInteraction: false,
      data,
    });

    n.onclick = () => {
      window.focus();
      if (data.conversationId) {
        useChatStore.getState().setActiveConversationId(data.conversationId);
        // Ack delivery on notification click
        const meId = useAuthStore.getState().user?.id;
        if (meId) markConversationDelivered(data.conversationId, meId);
      }
      n.close();
    };

    // Auto-close foreground notifications after 5s (less intrusive)
    setTimeout(() => n.close(), 5000);
  }
}

/* ------------------------------------------------------------------ */
/*  Provider Component                                                */
/* ------------------------------------------------------------------ */

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = !!user;
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    registerServiceWorker();

    // Initialize native push listeners (sets up registration/tap handlers)
    initPushSystem();

    return () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  // Set up foreground message listener when user is logged in (web only)
  useEffect(() => {
    if (!isLoggedIn || isNative) {
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
