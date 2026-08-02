/**
 * KIVO Message Delivery Status Engine (foundation).
 *
 * Lifecycle:  sending → sent → connected → seen
 *
 *   sending    Local optimistic state while the message uploads to the KIVO
 *              server. Never persisted — the Firestore doc is created as
 *              `sent` the moment the batch write commits.
 *   sent       The message reached the KIVO server and is stored. Works even
 *              when the receiver is offline. Persisted as `sent` + `sentAt`.
 *   connected  The receiver is online in KIVO (presence) or their device has
 *              synced the message. Persisted as `delivered` + `deliveredAt`
 *              (the UI renders this state as "Connected").
 *   seen       The receiver opened the conversation and the message entered
 *              the visible chat area. Persisted as `seen` + `seenAt`, and
 *              implies delivered.
 *
 * All transitions are MONOTONIC (never downgrade). This is enforced
 * client-side here AND server-side in firestore.rules.
 *
 * Framework-agnostic (no React) so the same primitives can be reused from
 * push-notification handlers, Capacitor background tasks, or future
 * server-side jobs.
 */
import { doc, getDoc, updateDoc, writeBatch, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { getFirestoreInstance } from '@/lib/firebase';
import { getPresence } from '@/lib/presence';

/** The four states of the KIVO message lifecycle. */
export type MessageLifecycleStatus = 'sending' | 'sent' | 'delivered' | 'seen';

/** Ordinal rank per status — used for monotonicity checks. */
const STATUS_ORDER: Record<MessageLifecycleStatus, number> = {
  sending: 0,
  sent: 1,
  delivered: 2, // "Connected"
  seen: 3,
};

/**
 * True when `to` is a forward (or identical) transition from `from`.
 * Downgrades (e.g. seen → delivered) return false and are ignored.
 */
export function isForwardStatusTransition(from: string, to: MessageLifecycleStatus): boolean {
  const f = STATUS_ORDER[from as MessageLifecycleStatus];
  const t = STATUS_ORDER[to];
  if (f === undefined || t === undefined) return false;
  return t >= f;
}

/* ------------------------------------------------------------------ */
/*  Single-message transitions                                         */
/* ------------------------------------------------------------------ */

export interface UpdateMessageStatusOptions {
  /** Explicit timestamp (defaults to serverTimestamp()). */
  at?: unknown;
}

/**
 * Advance a single message to the given lifecycle status.
 *
 * - Monotonic: no-op (returns false) when the target is not forward of the
 *   message's current status, so stale acks can never downgrade a message.
 * - Writes the matching receipt timestamp (`sentAt`/`deliveredAt`/`seenAt`);
 *   `seen` also writes `deliveredAt` since seen implies connected.
 * - Returns true when a write actually happened.
 *
 * Safe to call from either participant's device — firestore.rules enforces
 * the same monotonicity server-side.
 */
export async function updateMessageStatus(
  conversationId: string,
  messageId: string,
  status: MessageLifecycleStatus,
  options: UpdateMessageStatusOptions = {}
): Promise<boolean> {
  const db = getFirestoreInstance();
  const ref = doc(db, 'conversations', conversationId, 'messages', messageId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const current = String(snap.data().status ?? 'sent');
    if (!isForwardStatusTransition(current, status)) return false;

    const at = options.at ?? serverTimestamp();
    const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (status === 'sent') patch.sentAt = at;
    else if (status === 'delivered') patch.deliveredAt = at;
    else if (status === 'seen') {
      patch.deliveredAt = at;
      patch.seenAt = at;
    }
    await updateDoc(ref, patch);
    // Keep the conversation preview in sync when the transitioned message is
    // the conversation's last message (the list renders ticks from the
    // preview). Fire-and-forget — a sync failure never fails the ack itself.
    void syncLastMessagePreview(conversationId, messageId, status, at);
    return true;
  } catch (err) {
    console.error('[message-status] updateMessageStatus failed', err);
    return false;
  }
}

/** Advance a message to `sent` (usually redundant — writes persist as sent). */
export function markMessageSent(conversationId: string, messageId: string): Promise<boolean> {
  return updateMessageStatus(conversationId, messageId, 'sent');
}

/** Advance a message to `connected` (persisted as `delivered`). */
export function markMessageConnected(conversationId: string, messageId: string): Promise<boolean> {
  return updateMessageStatus(conversationId, messageId, 'delivered');
}

/** Advance a message to `seen` (implies connected). */
export function markMessageSeen(conversationId: string, messageId: string): Promise<boolean> {
  return updateMessageStatus(conversationId, messageId, 'seen');
}

/**
 * Presence-driven promotion: if the receiver's presence is `online`, advance
 * the message to `connected` immediately — no need to wait for the receiver's
 * device to ack the snapshot. Returns true when the promotion was applied.
 */
export async function markMessageConnectedIfOnline(
  conversationId: string,
  messageId: string,
  receiverId: string
): Promise<boolean> {
  try {
    const presence = await getPresence(receiverId);
    if (!presence?.online) return false;
    return updateMessageStatus(conversationId, messageId, 'delivered');
  } catch (err) {
    console.error('[message-status] markMessageConnectedIfOnline failed', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Batch acks (receiver device sync)                                  */
/* ------------------------------------------------------------------ */

/**
 * Receiver-side ack: mark a set of messages `delivered` with `deliveredAt`
 * in one batched write. Called when the receiver's device syncs incoming
 * messages while online — the chat does not need to be open.
 */
export async function markMessagesDelivered(conversationId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const db = getFirestoreInstance();
  const batch = writeBatch(db);
  for (const id of messageIds) {
    batch.update(doc(db, 'conversations', conversationId, 'messages', id), {
      status: 'delivered',
      deliveredAt: serverTimestamp(),
    });
  }
  await batch.commit();
  // Receiver-device acks are the primary path that drives the sender's
  // conversation-list ticks — sync the preview if the last message was acked.
  void syncBatchPreviewIfAcked(conversationId, messageIds, 'delivered');
}

/**
 * Receiver-side ack: mark all undelivered incoming messages in a
 * conversation as `delivered`. Called from push notification handlers
 * (foreground + tap) so the sender sees the double-tick even before the
 * Firestore snapshot listener fires.
 *
 * Scoped to messages the receiver has NOT sent (senderId !== receiverId)
 * that are still in `sent` status. Batched in chunks of 500 (Firestore
 * limit) and capped at the 30 most recent to keep writes bounded.
 */
export async function markConversationDelivered(
  conversationId: string,
  receiverId: string
): Promise<void> {
  const db = getFirestoreInstance();
  try {
    const snap = await getDocs(
      query(
        collection(db, 'conversations', conversationId, 'messages'),
        where('status', '==', 'sent'),
        limit(30)
      )
    );
    const ids: string[] = [];
    snap.forEach((d) => {
      if (d.data().senderId !== receiverId && !d.data().deleted) {
        ids.push(d.id);
      }
    });
    if (ids.length > 0) {
      await markMessagesDelivered(conversationId, ids);
    }
  } catch (err) {
    console.error('[message-status] markConversationDelivered failed', err);
  }
}

/**
 * Receiver-side ack: mark a set of messages `seen` with `seenAt` in one
 * batched write. Called when the receiver opens the conversation and the
 * messages enter the visible chat area. Seen implies delivered, so
 * `deliveredAt` is set alongside in case the delivered ack was skipped.
 */
export async function markMessagesSeen(conversationId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const db = getFirestoreInstance();
  const batch = writeBatch(db);
  for (const id of messageIds) {
    batch.update(doc(db, 'conversations', conversationId, 'messages', id), {
      status: 'seen',
      deliveredAt: serverTimestamp(),
      seenAt: serverTimestamp(),
    });
  }
  await batch.commit();
  void syncBatchPreviewIfAcked(conversationId, messageIds, 'seen');
}

/* ------------------------------------------------------------------ */
/*  Conversation preview sync                                          */
/* ------------------------------------------------------------------ */

/**
 * Write the status receipt fields onto the conversation's `lastMessage`
 * preview. The conversation list renders its status tick from this preview,
 * so without this the sender's list would show a stale `sent` tick forever.
 * Participants may update these fields (firestore.rules only pins the
 * participant list), so either side can keep the preview in sync.
 */
async function updateLastMessagePreview(
  conversationId: string,
  status: MessageLifecycleStatus,
  at: unknown
): Promise<void> {
  const patch: Record<string, unknown> = { 'lastMessage.status': status };
  if (status === 'sent') patch['lastMessage.sentAt'] = at;
  else if (status === 'delivered') patch['lastMessage.deliveredAt'] = at;
  else if (status === 'seen') {
    patch['lastMessage.deliveredAt'] = at;
    patch['lastMessage.seenAt'] = at;
  }
  await updateDoc(doc(getFirestoreInstance(), 'conversations', conversationId), patch);
}

/**
 * Single-message variant: sync the preview only when the transitioned
 * message IS the conversation's last message. Errors are swallowed so the
 * caller's ack result is never affected.
 */
async function syncLastMessagePreview(
  conversationId: string,
  messageId: string,
  status: MessageLifecycleStatus,
  at: unknown
): Promise<void> {
  try {
    const convSnap = await getDoc(doc(getFirestoreInstance(), 'conversations', conversationId));
    if (!convSnap.exists()) return;
    const last = convSnap.data().lastMessage;
    if (!last || last.id !== messageId) return;
    await updateLastMessagePreview(conversationId, status, at);
  } catch (err) {
    console.error('[message-status] syncLastMessagePreview failed', err);
  }
}

/**
 * Batch-ack variant: sync the preview when the acked set includes the
 * conversation's last message. Receiver-device acks are the primary path
 * that drives the sender's conversation-list ticks.
 */
async function syncBatchPreviewIfAcked(
  conversationId: string,
  messageIds: string[],
  status: Extract<MessageLifecycleStatus, 'delivered' | 'seen'>
): Promise<void> {
  try {
    const convSnap = await getDoc(doc(getFirestoreInstance(), 'conversations', conversationId));
    if (!convSnap.exists()) return;
    const last = convSnap.data().lastMessage;
    if (!last || !messageIds.includes(last.id)) return;
    await updateLastMessagePreview(conversationId, status, serverTimestamp());
  } catch (err) {
    console.error('[message-status] syncBatchPreviewIfAcked failed', err);
  }
}