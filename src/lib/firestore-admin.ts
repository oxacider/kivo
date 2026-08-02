/**
 * Server-side Firestore helpers (Admin SDK).
 * Used by API routes to write conversation docs that the client can then
 * subscribe to. firebase-admin is server-only — always loaded via dynamic
 * imports so it is never bundled to the client.
 */
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

let adminFirestore: import('firebase-admin/firestore').Firestore | null = null;

async function getAdminFirestore() {
  if (adminFirestore) return adminFirestore;
  const app = await getFirebaseAdminApp();
  if (!app) return null;
  const { getFirestore } = await import('firebase-admin/firestore');
  adminFirestore = getFirestore(app);
  return adminFirestore;
}

/**
 * Create (or overwrite) the Firestore conversation doc for a 1:1 chat.
 * idempotent — safe to call on every conversation create/upsert.
 */
/**
 * Ensure users/{firebaseUid} → { kivoId } mapping exists.
 * Firestore security rules resolve participants via this doc
 * (get(users/{request.auth.uid}).data.kivoId), so it must exist for
 * conversation reads/writes to pass the rules.
 */
export async function ensureFirestoreUserMapping(
  firebaseUid: string,
  kivoId: string
): Promise<void> {
  try {
    const fs = await getAdminFirestore();
    if (!fs) {
      console.error('[firestore-admin] Admin Firestore unavailable — user mapping NOT created');
      return;
    }
    const docRef = fs.collection('users').doc(firebaseUid);
    const snap = await docRef.get();
    // Only write if the mapping is missing or stale — avoids unnecessary
    // writes on every session restore.
    if (!snap.exists || snap.data()?.kivoId !== kivoId) {
      await docRef.set({ kivoId }, { merge: true });
      console.info('[firestore-admin] User mapping upserted:', { firebaseUid, kivoId });
    }
  } catch (err) {
    console.error('[firestore-admin] ensureFirestoreUserMapping failed:', err);
  }
}

export async function upsertFirestoreConversation(
  convId: string,
  user1Id: string,
  user2Id: string
): Promise<void> {
  try {
    const fs = await getAdminFirestore();
    if (!fs) {
      console.error('[firestore-admin] Admin Firestore unavailable (missing service account?)');
      return;
    }
    const { FieldValue } = await import('firebase-admin/firestore');
    const docRef = fs.collection('conversations').doc(convId);
    const snap = await docRef.get();
    const now = FieldValue.serverTimestamp();

    if (snap.exists) {
      // Keep existing participants/preview — only refresh updatedAt.
      await docRef.update({ updatedAt: now });
    } else {
      await docRef.set({
        participants: [user1Id, user2Id],
        lastMessage: null,
        unreadCount: { [user1Id]: 0, [user2Id]: 0 },
        readReceipts: {},
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error('[firestore-admin] upsertFirestoreConversation failed', err);
  }
}
