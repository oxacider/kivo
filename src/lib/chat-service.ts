import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreInstance } from '@/lib/firebase';
import { authFetch } from '@/lib/api';
import { getPresence } from '@/lib/presence';
import { markMessageConnectedIfOnline } from '@/lib/message-status';
import type { Conversation, MediaAttachment, Message, Reaction, User } from '@/types';

/* ------------------------------------------------------------------ */
/*  Firestore document shapes                                          */
/* ------------------------------------------------------------------ */

export interface FSLastMessage {
  id: string;
  content: string;
  type: string;
  senderId: string;
  createdAt: string;
  deleted: boolean;
  /** KIVO status of the previewed message (sent/delivered/seen). */
  status?: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  seenAt?: string | null;
}

export interface FSConversationDoc {
  id: string;
  participants: string[];
  lastMessage: FSLastMessage | null;
  /** kivoUserId → unread count */
  unreadCount: Record<string, number>;
  /** kivoUserId → ISO timestamp of last read */
  readReceipts: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface FSMessageDoc {
  id: string;
  tempId?: string | null;
  senderId: string;
  sender?: { id: string; displayName: string; username: string; avatar: string } | null;
  content: string;
  type: string;
  /** KIVO lifecycle: sent → delivered → seen (written by sender/receiver devices). */
  status: 'sent' | 'delivered' | 'seen' | 'deleted';
  /** Server timestamp when the message reached Firestore. */
  sentAt?: string | null;
  /** Server timestamp when the receiver's device synced the message. */
  deliveredAt?: string | null;
  /** Server timestamp when the receiver opened the chat and saw the message. */
  seenAt?: string | null;
  replyToId: string | null;
  replyTo?: { id: string; content: string; senderId: string; deleted: boolean } | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: Record<string, Record<string, { createdAt: string; displayName: string; avatar: string }>>;
  attachments: MediaAttachment[];
}

export const MESSAGE_PAGE_SIZE = 30;

/**
 * Client-side conversation creation (Phase 4).
 *
 * Legacy API routes created conversations server-side and mirrored them to
 * Firestore. Now that friendships live in Firestore, accepting a request or
 * starting a chat from the friends UI creates the conversation doc directly
 * with a deterministic ID from the sorted participant pair, so both sides
 * derive the same ID and the doc is idempotent. Rules require an accepted
 * friendship for the pair before a client may create a conversation.
 *
 * Before creating a new conversation, validates that both users still exist
 * in Prisma. If the other user has been deleted, throws an error so the
 * caller can abort gracefully instead of creating an orphan conversation.
 */
export async function getOrCreateConversation(meId: string, otherId: string): Promise<string> {
  const db = getFirestoreInstance();
  const sorted = [meId, otherId].sort();
  const convId = `dm_${sorted[0]}_${sorted[1]}`;
  const ref = doc(db, 'conversations', convId);
  const snap = await getDoc(ref);
  if (snap.exists()) return convId;

  // Validate that the other user still exists before creating a new
  // conversation. Skips this check for legacy conversations that already
  // exist (above) — those will be filtered client-side if the user was
  // later deleted.
  try {
    const check = await authFetch(`/api/users/${otherId}`, {}, { autoSignOut: false });
    if (!check.ok) {
      if (check.status === 404) {
        throw new Error('This user account no longer exists.');
      }
      // Other errors (500 etc.) — allow creation to proceed; the user
      // probably exists and the API is just temporarily unavailable.
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'This user account no longer exists.') {
      throw err;
    }
    // Network error or auth fetch failed — proceed anyway.
  }

  // Backward compatibility: reuse a legacy server-created conversation doc for
  // the same pair (created via the old API routes with Prisma cuid ids).
  const legacy = await getDocs(
    query(collection(db, 'conversations'), where('participants', '==', sorted))
  );
  if (!legacy.empty) return legacy.docs[0].id;

  await setDoc(ref, {
    participants: sorted,
    lastMessage: null,
    unreadCount: { [sorted[0]]: 0, [sorted[1]]: 0 },
    readReceipts: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return convId;
}

/* ------------------------------------------------------------------ */
/*  Timestamp helpers                                                  */
/* ------------------------------------------------------------------ */

function toIso(ts: Timestamp | Date | string | null | undefined): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return String(ts);
}

/* ------------------------------------------------------------------ */
/*  Snapshot mappers                                                   */
/* ------------------------------------------------------------------ */

function fsConvFromSnap(doc: QueryDocumentSnapshot<DocumentData>): FSConversationDoc {
  const d = doc.data();
  return {
    id: doc.id,
    participants: d.participants ?? [],
    lastMessage: d.lastMessage
      ? {
          id: d.lastMessage.id,
          content: d.lastMessage.content ?? '',
          type: d.lastMessage.type ?? 'text',
          senderId: d.lastMessage.senderId ?? '',
          createdAt: toIso(d.lastMessage.createdAt),
          deleted: d.lastMessage.deleted ?? false,
          status: d.lastMessage.status ?? 'sent',
          sentAt: d.lastMessage.sentAt ? toIso(d.lastMessage.sentAt) : null,
          deliveredAt: d.lastMessage.deliveredAt ? toIso(d.lastMessage.deliveredAt) : null,
          seenAt: d.lastMessage.seenAt ? toIso(d.lastMessage.seenAt) : null,
        }
      : null,
    unreadCount: d.unreadCount ?? {},
    readReceipts: Object.fromEntries(
      Object.entries(d.readReceipts ?? {}).map(([k, v]) => [k, toIso(v as Timestamp | Date | string | null)])
    ),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function fsMsgFromSnap(convId: string, doc: QueryDocumentSnapshot<DocumentData>): FSMessageDoc {
  const d = doc.data();
  return {
    id: doc.id,
    tempId: d.tempId ?? null,
    senderId: d.senderId ?? '',
    sender: d.sender ?? null,
    content: d.content ?? '',
    type: d.type ?? 'text',
    status: (d.status ?? 'sent') as FSMessageDoc['status'],
    sentAt: d.sentAt ? toIso(d.sentAt) : null,
    deliveredAt: d.deliveredAt ? toIso(d.deliveredAt) : null,
    seenAt: d.seenAt ? toIso(d.seenAt) : null,
    replyToId: d.replyToId ?? null,
    replyTo: d.replyTo ?? null,
    edited: d.edited ?? false,
    deleted: d.deleted ?? false,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    reactions: d.reactions ?? {},
    attachments: d.attachments ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  App-type mappers (keep UI shape unchanged)                         */
/* ------------------------------------------------------------------ */

export function fsMessageToMessage(fs: FSMessageDoc, conversationId: string): Message {
  const reactions: Reaction[] = Object.entries(fs.reactions ?? {}).flatMap(([emoji, users]) =>
    Object.entries(users).map(([uid, entry]) => ({
      id: `${fs.id}-${emoji}-${uid}`,
      messageId: fs.id,
      userId: uid,
      emoji,
      createdAt: entry.createdAt,
      user: { id: uid, displayName: entry.displayName, avatar: entry.avatar },
    }))
  );

  return {
    id: fs.id,
    conversationId,
    senderId: fs.senderId,
    content: fs.content,
    type: (fs.type as Message['type']) ?? 'text',
    status: fs.deleted ? 'deleted' : fs.status,
    sentAt: fs.sentAt ?? undefined,
    deliveredAt: fs.deliveredAt ?? null,
    seenAt: fs.seenAt ?? null,
    replyToId: fs.replyToId,
    replyTo: fs.replyTo
      ? {
          id: fs.replyTo.id,
          conversationId,
          senderId: fs.replyTo.senderId,
          content: fs.replyTo.content,
          type: 'text',
          status: 'sent',
          replyToId: null,
          edited: false,
          deleted: fs.replyTo.deleted,
          createdAt: fs.createdAt,
          updatedAt: fs.createdAt,
        }
      : null,
    edited: fs.edited,
    deleted: fs.deleted,
    createdAt: fs.createdAt,
    updatedAt: fs.updatedAt,
    sender: fs.sender
      ? ({
          id: fs.sender.id,
          displayName: fs.sender.displayName,
          username: fs.sender.username,
          avatar: fs.sender.avatar,
          email: '',
          bio: '',
          status: '',
          online: false,
          lastSeen: '',
          theme: 'dark',
          emailVerified: true,
          showOnline: true,
          showLastSeen: true,
          showReadReceipts: true,
          createdAt: '',
          updatedAt: '',
        } as User)
      : undefined,
    reactions,
    attachments: fs.attachments ?? [],
  };
}

export function fsConversationToConversation(fs: FSConversationDoc, meId: string, otherUser?: User): Conversation {
  const otherId = fs.participants.find((p) => p !== meId) ?? '';
  return {
    id: fs.id,
    user1Id: fs.participants[0] ?? '',
    user2Id: fs.participants[1] ?? '',
    createdAt: fs.createdAt,
    updatedAt: fs.updatedAt,
    lastMessage: fs.lastMessage
      ? {
          id: fs.lastMessage.id,
          conversationId: fs.id,
          senderId: fs.lastMessage.senderId,
          content: fs.lastMessage.content,
          type: fs.lastMessage.type as Message['type'],
          status: (fs.lastMessage.status as Message['status']) ?? 'sent',
          sentAt: fs.lastMessage.sentAt ?? undefined,
          deliveredAt: fs.lastMessage.deliveredAt ?? null,
          seenAt: fs.lastMessage.seenAt ?? null,
          replyToId: null,
          edited: false,
          deleted: fs.lastMessage.deleted,
          createdAt: fs.lastMessage.createdAt,
          updatedAt: fs.lastMessage.createdAt,
        }
      : undefined,
    otherUser,
    unreadCount: fs.unreadCount?.[meId] ?? 0,
    participants: fs.participants,
    readReceipts: fs.readReceipts ?? {},
  };
}

/**
 * Derive the effective message status for display.
 *
 * KIVO status is now tracked per-message (sent → delivered → seen), so the
 * message doc is the source of truth. Local optimistic statuses
 * (sending/queued/failed) pass through unchanged. For legacy messages that
 * predate per-message status, we fall back to the conversation readReceipts.
 */
export function deriveMessageStatus(msg: Message, conv: Conversation | undefined, meId: string): Message['status'] {
  if (msg.status === 'sending' || msg.status === 'queued' || msg.status === 'failed') return msg.status;
  if (msg.deleted || msg.status === 'deleted') return 'deleted';
  if (msg.senderId !== meId) return msg.status;

  if (msg.status === 'seen') return 'seen';
  if (msg.status === 'delivered') return 'delivered';

  // Legacy fallback: read receipts used to live on the conversation doc.
  const otherId = conv ? (conv.user1Id === meId ? conv.user2Id : conv.user1Id) : '';
  if (!otherId) return msg.status;
  const readAt = conv?.readReceipts?.[otherId];
  if (readAt && readAt >= msg.createdAt) return 'seen';
  return msg.status;
}

/* ------------------------------------------------------------------ */
/*  Subscriptions                                                      */
/* ------------------------------------------------------------------ */

export function subscribeConversations(
  meId: string,
  onChange: (convs: FSConversationDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirestoreInstance();
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', meId));
  return onSnapshot(
    q,
    (snap) => {
      const convs = snap.docs.map(fsConvFromSnap);
      convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onChange(convs);
    },
    (err) => onError?.(err)
  );
}

export function subscribeMessages(
  conversationId: string,
  onChange: (messages: FSMessageDoc[], hasMore: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirestoreInstance();
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(MESSAGE_PAGE_SIZE + 1)
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => fsMsgFromSnap(conversationId, d));
      const hasMore = docs.length > MESSAGE_PAGE_SIZE;
      const sliced = hasMore ? docs.slice(0, MESSAGE_PAGE_SIZE) : docs;
      // asc order for display
      onChange(sliced.reverse(), hasMore);
    },
    (err) => onError?.(err)
  );
}

export async function loadOlderMessages(
  conversationId: string,
  beforeCreatedAt: string,
  pageSize = MESSAGE_PAGE_SIZE
): Promise<{ messages: FSMessageDoc[]; hasMore: boolean }> {
  const db = getFirestoreInstance();
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    where('createdAt', '<', new Date(beforeCreatedAt)),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => fsMsgFromSnap(conversationId, d));
  const hasMore = docs.length > pageSize;
  const sliced = hasMore ? docs.slice(0, pageSize) : docs;
  return { messages: sliced.reverse(), hasMore };
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

export interface SendMessageInput {
  conversationId: string;
  sender: User;
  /** KIVO user id of the other participant (for unread increment). */
  recipientId?: string;
  content: string;
  type?: string;
  replyToId?: string | null;
  replyTo?: Message | null;
  attachments?: MediaAttachment[];
  tempId?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<string> {
  const db = getFirestoreInstance();
  const convRef = doc(db, 'conversations', input.conversationId);
  const messagesRef = collection(convRef, 'messages');
  const now = serverTimestamp();

  const msgData: Record<string, unknown> = {
    senderId: input.sender.id,
    sender: {
      id: input.sender.id,
      displayName: input.sender.displayName,
      username: input.sender.username,
      avatar: input.sender.avatar,
    },
    content: input.content,
    type: input.type ?? 'text',
    status: 'sent',
    sentAt: now,
    deliveredAt: null,
    seenAt: null,
    replyToId: input.replyToId ?? null,
    replyTo: input.replyTo
      ? { id: input.replyTo.id, content: input.replyTo.content, senderId: input.replyTo.senderId, deleted: input.replyTo.deleted }
      : null,
    edited: false,
    deleted: false,
    createdAt: now,
    updatedAt: now,
    reactions: {},
    attachments: input.attachments ?? [],
  };
  if (input.tempId) msgData.tempId = input.tempId;

  // Atomic batch: message doc + conversation preview + recipient unread increment.
  const batch = writeBatch(db);
  const msgRef = doc(messagesRef);
  batch.set(msgRef, msgData);
  const convPatch: Record<string, unknown> = {
    lastMessage: {
      id: msgRef.id,
      content: input.content,
      type: input.type ?? 'text',
      senderId: input.sender.id,
      createdAt: now,
      deleted: false,
      status: 'sent',
      sentAt: now,
      deliveredAt: null,
      seenAt: null,
    },
    updatedAt: now,
  };
  if (input.recipientId) convPatch[`unreadCount.${input.recipientId}`] = increment(1);
  // Conversation docs are always created server-side (rules forbid client
  // create), so a plain update is correct and keeps the rules simple.
  batch.update(convRef, convPatch);
  await batch.commit();

  // Presence-driven promotion (sending → sent → connected): the batch write
  // above already persisted the message as `sent` (the sender's local
  // `sending` state is optimistic-only and never persisted). If the receiver
  // is online in KIVO right now, advance the message straight to `connected`
  // instead of waiting for their device to ack the snapshot. Fire-and-forget
  // so the send never blocks or fails on a presence read.
  if (input.recipientId) {
    void markMessageConnectedIfOnline(input.conversationId, msgRef.id, input.recipientId);
    // Step 3.2 — offline push: if the receiver is NOT actively connected,
    // their device won't sync via Firestore immediately, so notify them via
    // FCM (server route uses the existing DeviceToken system).
    void maybePushToOfflineRecipient(input);
  }
  return msgRef.id;
}

/**
 * Step 3.2 — offline push.
 *
 * After a message is persisted, check the receiver's live presence. If they
 * are actively connected (online + realtime connection active), the Firestore
 * snapshot will reach their device and the status engine advances the message
 * to `connected` — no push needed. Otherwise, ask the server to send an FCM
 * push to the receiver's registered devices.
 *
 * Fire-and-forget: never blocks or fails the send.
 */
async function maybePushToOfflineRecipient(input: SendMessageInput): Promise<void> {
  const { recipientId, conversationId, sender } = input;
  if (!recipientId) return;
  try {
    const presence = await getPresence(recipientId);
    // Actively connected — Firestore snapshot will deliver; skip the push.
    if (presence?.online && presence.connectionStatus === 'online') return;

    const preview =
      input.type === 'image' || (input.attachments?.length ?? 0) > 0
        ? '📷 Photo'
        : (input.content || '').slice(0, 100);

    const res = await authFetch(
      '/api/notifications/push',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId,
          conversationId,
          senderId: sender.id,
          senderName: sender.displayName || sender.username || 'Someone',
          preview,
        }),
      },
      { autoSignOut: false }
    );
    if (!res.ok) {
      console.warn('[chat-service] offline push rejected:', res.status, res.statusText);
    }
  } catch (err) {
    // Presence read or push request failed — never fail the send.
    console.warn('[chat-service] offline push skipped:', err);
  }
}

export async function editMessage(conversationId: string, messageId: string, content: string): Promise<void> {
  const db = getFirestoreInstance();
  await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    content,
    edited: true,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  const db = getFirestoreInstance();
  await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    deleted: true,
    content: 'This message was deleted',
    status: 'deleted',
    updatedAt: serverTimestamp(),
  });
}

export async function toggleReaction(
  conversationId: string,
  messageId: string,
  emoji: string,
  user: User
): Promise<void> {
  const db = getFirestoreInstance();
  const ref = doc(db, 'conversations', conversationId, 'messages', messageId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.senderId === user.id) return; // no self-reactions (legacy behavior)

    const reactions = data.reactions ?? {};
    const emojiMap = reactions[emoji] ?? {};
    if (emojiMap[user.id]) {
      // Toggle off
      const nextEmoji = { ...emojiMap };
      delete nextEmoji[user.id];
      const next = { ...reactions, [emoji]: nextEmoji };
      if (Object.keys(nextEmoji).length === 0) delete next[emoji];
      tx.update(ref, { reactions: next });
    } else {
      // Remove any other reaction by this user on this message first (legacy behavior)
      const next = { ...reactions };
      for (const key of Object.keys(next)) {
        if (next[key]?.[user.id]) {
          const m = { ...next[key] };
          delete m[user.id];
          if (Object.keys(m).length === 0) delete next[key];
          else next[key] = m;
        }
      }
      tx.update(ref, {
        reactions: {
          ...next,
          [emoji]: { ...(next[emoji] ?? {}), [user.id]: { createdAt: new Date().toISOString(), displayName: user.displayName, avatar: user.avatar } },
        },
      });
    }
  });
}

export async function markConversationRead(conversationId: string, meId: string): Promise<void> {
  const db = getFirestoreInstance();
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`readReceipts.${meId}`]: serverTimestamp(),
    [`unreadCount.${meId}`]: 0,
  });
}

/* ------------------------------------------------------------------ */
/*  KIVO message status receipts                                       */
/* ------------------------------------------------------------------ */

/**
 * Status-receipt ack helpers moved to the dedicated status engine
 * (src/lib/message-status.ts) so every transition — including
 * `updateMessageStatus` / `markMessageSeen` / presence-driven promotion —
 * lives in one place. Re-exported here so existing UI imports keep working.
 */
export { markMessagesDelivered, markMessagesSeen } from '@/lib/message-status';

/* ------------------------------------------------------------------ */
/*  Orphan cleanup                                                     */
/* ------------------------------------------------------------------ */

/**
 * Scan the current user's conversations and delete any whose other
 * participant no longer exists in the Prisma database.
 *
 * Call sparingly (e.g. on app launch or from a background admin job).
 * Returns the count of orphan conversations that were removed.
 */
export async function cleanupOrphanConversations(meId: string): Promise<number> {
  const db = getFirestoreInstance();
  const snap = await getDocs(
    query(collection(db, 'conversations'), where('participants', 'array-contains', meId))
  );

  const checks = snap.docs.map(async (d) => {
    const data = d.data();
    const otherId = (data.participants as string[] | undefined)?.find((p) => p !== meId);
    if (!otherId) return null;

    try {
      const res = await authFetch(`/api/users/${otherId}`, {}, { autoSignOut: false });
      if (res.ok) return null; // user exists — keep conversation
      if (res.status === 404) return d.ref; // confirmed deleted — clean up
      // Transient error (500, 503 etc.) — skip; don't delete on uncertainty
      return null;
    } catch {
      // Network / auth error — skip (don't delete because we can't confirm)
      return null;
    }
  });

  const toDelete = (await Promise.all(checks)).filter(Boolean) as ReturnType<typeof doc>[];

  if (toDelete.length === 0) return 0;

  // Delete in batches of 500 (Firestore limit per batch)
  for (let i = 0; i < toDelete.length; i += 500) {
    const batch = writeBatch(db);
    const chunk = toDelete.slice(i, i + 500);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
  }

  return toDelete.length;
}

