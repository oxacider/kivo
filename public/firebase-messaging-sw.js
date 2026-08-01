/* ------------------------------------------------------------------ */
/*  KIVO Firebase Cloud Messaging Service Worker                       */
/*  Handles background push notifications + click-to-chat routing.     */
/*  Uses Firebase compat SDK (required for Service Worker environment). */
/*                                                                      */
/*  ⚠  IMPORTANT: Replace the placeholder config below with your       */
/*     real Firebase project config before deploying.                   */
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
  // Only initialize if at least the projectId is set
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
/*  Background Message Handler                                        */
/* ------------------------------------------------------------------ */

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || 'KIVO';
    const body = notification.body || 'You have a new message';
    const conversationId = data.conversationId || '';

    // Unique tag per conversation so only the latest notification is shown
    const tag = conversationId ? `kivo-${conversationId}` : 'kivo-notification';

    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag,
      data: {
        conversationId,
        senderId: data.senderId || '',
        type: data.type || 'new_message',
        url: conversationId ? `/?chat=${conversationId}` : '/',
      },
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Notification Click → Open Correct Chat                             */
/* ------------------------------------------------------------------ */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/';

  // Focus existing KIVO window, or open a new one
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
});
