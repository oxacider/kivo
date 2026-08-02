import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';

/**
 * KIVO Firebase Configuration.
 * Initializes the client-side Firebase app for Auth and FCM.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
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

export const auth: Auth = getAuth(app);

export { app };

let firestore: Firestore | null = null;
let persistenceEnabled = false;

/**
 * Lazy Firestore instance (client-side chat layer — Phase 2).
 * Only call from the client (components / stores).
 *
 * Enables IndexedDB offline persistence on first call so cached data
 * loads instantly while realtime updates sync in the background.
 * Multi-tab persistence is deliberately left disabled — the single-tab
 * IndexedDB cache is faster and avoids the multi-tab sync overhead.
 */
export function getFirestoreInstance(): Firestore {
  if (!firestore) {
    firestore = getFirestore(app);
    // Enable offline persistence (IndexedDB cache) — fire-and-forget.
    // Deliberately NOT awaited: the Firebase SDK internally queues ops
    // and delivers cached snapshots to listeners registered before
    // persistence resolves. Awaiting would block the UI unnecessarily.
    if (typeof window !== 'undefined' && !persistenceEnabled) {
      persistenceEnabled = true;
      enableIndexedDbPersistence(firestore).catch((err) => {
        if (err.code === 'failed-precondition') {
          // Another tab already has persistence open — safe to ignore.
          console.info('[Firestore] Offline persistence unavailable (multi-tab).');
        } else if (err.code === 'unimplemented') {
          // Browser doesn't support IndexedDB (rare).
          console.warn('[Firestore] Offline persistence not supported in this browser.');
        } else {
          console.error('[Firestore] Offline persistence failed:', err);
        }
      });
    }
  }
  return firestore;
}

let database: Database | null = null;

/**
 * Lazy Realtime Database instance (client-side presence/typing — Phase 3).
 * Only call from the client (components / hooks).
 */
export function getDatabaseInstance(): Database {
  if (!database) database = getDatabase(app);
  return database;
}

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
