/**
 * Phase 3 — Firebase Realtime Database presence & typing layer.
 *
 * Data model (keyed by KIVO user id, consistent with Firestore participants):
 *   mapping/{firebaseUid}       → kivoId            (rules: only self can write)
 *   presence/{kivoId}           → { online, lastSeen }
 *   typing/{conversationId}/{kivoId} → { isTyping, user, updatedAt }
 *
 * The user-id mapping node lets the RTDB rules verify a writer owns their own
 * presence/typing nodes even though auth.uid is a Firebase uid, not a KIVO id.
 */
import { getDatabaseInstance } from '@/lib/firebase';
import {
  ref,
  set,
  onValue,
  onDisconnect,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/database';
import type { User } from '@/types';

export interface PresenceData {
  online: boolean;
  /** ISO string (converted from RTDB server timestamp). */
  lastSeen: string;
}

export interface TypingData {
  isTyping: boolean;
  user?: { id: string; displayName: string; avatar: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Timestamp helpers                                                  */
/* ------------------------------------------------------------------ */

function toIso(ts: number | null | undefined): string {
  if (!ts) return new Date().toISOString();
  return new Date(ts).toISOString();
}

/* ------------------------------------------------------------------ */
/*  Presence                                                           */
/* ------------------------------------------------------------------ */

/**
 * Bring the current user online in the Realtime Database.
 * - Writes mapping/{firebaseUid} → kivoId so rules can authorize the nodes.
 * - Writes presence/{kivoId} = online and registers an onDisconnect handler
 *   that flips it offline (with lastSeen) when the connection drops.
 *
 * Idempotent — safe to call on every session restore / reconnect.
 */
export async function connectPresence(kivoId: string, firebaseUid?: string | null): Promise<void> {
  try {
    const db = getDatabaseInstance();
    if (firebaseUid) {
      await set(ref(db, `mapping/${firebaseUid}`), kivoId).catch(() => {
        // Rules may reject if the uid doesn't match the current session — ignore.
      });
    }
    const presenceRef = ref(db, `presence/${kivoId}`);
    // Flip offline automatically when this client disconnects.
    onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });
    await set(presenceRef, { online: true, lastSeen: serverTimestamp() });
  } catch (err) {
    console.error('[presence] connectPresence failed', err);
  }
}

/**
 * Explicitly go offline (logout / app teardown).
 */
export async function disconnectPresence(kivoId: string): Promise<void> {
  try {
    const db = getDatabaseInstance();
    const presenceRef = ref(db, `presence/${kivoId}`);
    onDisconnect(presenceRef).cancel();
    await set(presenceRef, { online: false, lastSeen: serverTimestamp() });
  } catch (err) {
    console.error('[presence] disconnectPresence failed', err);
  }
}

/**
 * Subscribe to a user's live presence. Calls cb(null) when the node is gone.
 */
export function subscribePresence(kivoId: string, cb: (presence: PresenceData | null) => void): Unsubscribe {
  const db = getDatabaseInstance();
  return onValue(ref(db, `presence/${kivoId}`), (snap) => {
    const data = snap.val();
    if (!data) {
      cb(null);
      return;
    }
    cb({
      online: Boolean(data.online),
      lastSeen: toIso(data.lastSeen),
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Typing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Set typing state for the current user in a conversation.
 * onDisconnect clears it so a crashed tab doesn't leave a stuck indicator.
 */
export async function setTypingState(
  conversationId: string,
  kivoId: string,
  isTyping: boolean,
  user?: User
): Promise<void> {
  try {
    const db = getDatabaseInstance();
    const typingRef = ref(db, `typing/${conversationId}/${kivoId}`);
    if (isTyping) {
      onDisconnect(typingRef).set({ isTyping: false });
      await set(typingRef, {
        isTyping: true,
        user: user ? { id: user.id, displayName: user.displayName, avatar: user.avatar } : null,
        updatedAt: serverTimestamp(),
      });
    } else {
      await set(typingRef, { isTyping: false, updatedAt: serverTimestamp() });
    }
  } catch (err) {
    console.error('[presence] setTypingState failed', err);
  }
}

/**
 * Subscribe to all typing states within a conversation.
 * cb receives { kivoId: TypingData }.
 */
export function subscribeTyping(
  conversationId: string,
  cb: (typing: Record<string, TypingData>) => void
): Unsubscribe {
  const db = getDatabaseInstance();
  return onValue(ref(db, `typing/${conversationId}`), (snap) => {
    const data = snap.val();
    cb((data as Record<string, TypingData>) ?? {});
  });
}
