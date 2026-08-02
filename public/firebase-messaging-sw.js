/* ------------------------------------------------------------------ */
/*  KIVO Firebase Cloud Messaging Service Worker                       */
/*  Handles background push notifications + click-to-chat routing.     */
/*  Uses Firebase compat SDK (required for Service Worker environment). */
/*                                                                      */
/*  Designed to mirror WhatsApp Web PWA notification behavior:          */
/*    - Tag-based grouping per conversation (renotify=true)             */
/*    - Vibration pattern on supported devices                         */
/*    - Notification stays visible until user acts (requireInteraction) */
/*    - Image preview for photo messages                               */
/*    - App badge counter updates                                      */
/*    - notificationclose cleanup                                      */
/* ------------------------------------------------------------------ */

importScripts(
  'https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js'
);

// ── Firebase Config (kivo-96303) ────────────────────────────────
const firebaseConfig = {
  apiKey: 'AIzaSyDhfEzocXb2A0OrBgprGV8FDYUuJm6AI_E',
  authDomain: 'kivo-96303.firebaseapp.com',
  projectId: 'kivo-96303',
  storageBucket: 'kivo-96303.firebasestorage.app',
  messagingSenderId: '392138763047',
  appId: '1:392138763047:web:589d38035cadc2c42dd702',
};

let messaging = null;

try {
  if (firebaseConfig.projectId) {
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
  } else {
    console.warn('[KIVO SW] Firebase config is empty. Background messaging is disabled until configured.');
  }
} catch (err) {
  console.error('[KIVO SW] Firebase initialization failed:', err);
}

/* ------------------------------------------------------------------ */
/*  Global unread counter (simple in-memory — reset on SW restart)     */
/* ------------------------------------------------------------------ */

let unreadCount = 0;

/**
 * Update the app badge with the current unread count.
 * Uses the Badging API when available (Chromium-based PWA installs).
 */
async function updateBadge() {
  if ('setAppBadge' in navigator) {
    try {
      if (unreadCount > 0) {
        await navigator.setAppBadge(unreadCount);
      } else {
        await navigator.clearAppBadge();
      }
    } catch {
      // Badging API may not be supported in this context
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Background Message Handler                                         */
/* ------------------------------------------------------------------ */

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};

    const senderName = data.senderName || notification.title || 'KIVO';
    const body = notification.body || 'You have a new message';
    const conversationId = data.conversationId || '';
    const isImage = data.hasImage === 'true' || (notification.imageUrl && notification.imageUrl.length > 0);
    const imageUrl = notification.imageUrl || data.imageUrl || undefined;

    // WhatsApp-style: title = sender name, body = message preview
    const title = conversationId
      ? senderName
      : 'KIVO';

    // Unique tag per conversation so only the latest is shown,
    // but renotify=true ensures each new message re-alerts.
    const tag = conversationId ? `kivo-${conversationId}` : 'kivo-notification';

    // Increment unread badge
    unreadCount++;
    updateBadge();

    const options = {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      // TODO: plumb imageUrl through server-side push pipeline so
      // photo-message notifications display a rich image preview.
      image: imageUrl || undefined,
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200],
      data: {
        conversationId,
        senderId: data.senderId || '',
        type: data.type || 'new_message',
        url: conversationId ? `/?chat=${conversationId}` : '/',
      },

    };

    self.registration.showNotification(title, options);
  });
}

/* ------------------------------------------------------------------ */
/*  Notification Click → Open Correct Chat                             */
/* ------------------------------------------------------------------ */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/';

  // Decrement unread on interaction
  if (unreadCount > 0) {
    unreadCount--;
    updateBadge();
  }

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Prefer a client already showing KIVO
          for (const client of clientList) {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              client.navigate(url);
              return client.focus();
            }
          }
          // No KIVO window open — create one
          return self.clients.openWindow(url);
        })
    );
  }
});

/* ------------------------------------------------------------------ */
/*  Notification Close → Cleanup badge                                 */
/* ------------------------------------------------------------------ */

self.addEventListener('notificationclose', (event) => {
  // User dismissed notification — decrement unread
  if (unreadCount > 0) {
    unreadCount--;
    updateBadge();
  }
});

/* ------------------------------------------------------------------ */
/*  Push event (raw — fallback if Firebase SDK doesn't handle it)     */
/* ------------------------------------------------------------------ */

self.addEventListener('push', (event) => {
  // Firebase SDK should handle push events via onBackgroundMessage.
  // This handler is a safety net — if Firebase isn't ready yet,
  // we still show a basic notification so nothing is lost.
  if (!messaging) {
    let payload = {};
    try {
      if (event.data) payload = event.data.json();
    } catch {
      // Not JSON — use empty payload
    }

    const data = payload.data || {};
    const notification = payload.notification || {};

    const title = notification.title || 'KIVO';
    const body = notification.body || 'You have a new message';
    const conversationId = data.conversationId || '';
    const tag = conversationId ? `kivo-${conversationId}` : 'kivo-notification';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/logo.png',
        badge: '/logo.png',
        tag,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        vibrate: [200, 100, 200],
        data: {
          conversationId,
          senderId: data.senderId || '',
          type: data.type || 'new_message',
          url: conversationId ? `/?chat=${conversationId}` : '/',
        },
      })
    );
  }
});
