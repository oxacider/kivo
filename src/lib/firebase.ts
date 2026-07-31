import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

/**
 * KIVO Firebase Configuration
 * Only FCM is initialized — no Firebase Auth or Firestore on the client.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

let app: FirebaseApp;
if (typeof window !== 'undefined' && !getApps().length) {
  app = initializeApp(firebaseConfig);
} else if (getApps().length) {
  app = getApps()[0];
} else {
  // SSR fallback — creates a no-op app that never resolves messaging
  app = initializeApp(firebaseConfig);
}

export { app };

/**
 * Async messaging instance.
 * Resolves to null on SSR or unsupported browsers.
 * Usage: const msg = await getMessagingInstance();
 */
let messagingPromise: Promise<Messaging | null> | null = null;

export function getMessagingInstance(): Promise<Messaging | null> {
  if (messagingPromise) return messagingPromise;

  if (typeof window === 'undefined') {
    messagingPromise = Promise.resolve(null);
    return messagingPromise;
  }

  messagingPromise = isSupported().then((supported) => {
    if (!supported) {
      console.warn('[KIVO FCM] Firebase Messaging is not supported in this browser.');
    }
    return supported ? getMessaging(app) : null;
  });

  return messagingPromise;
}

/** VAPID key from environment */
export const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || '';
