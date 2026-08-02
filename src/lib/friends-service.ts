/**
 * Phase 4 — Firestore friendships & blocks layer.
 *
 * Data model (keyed by sorted KIVO user-id pair, consistent with the
 * conversations' `participants` convention):
 *
 *   friendships/{fs_id1_id2} → {
 *     participants: [id1, id2],          // sorted, immutable
 *     requesterId: id, receiverId: id,
 *     status: 'pending' | 'accepted' | 'declined',
 *     sender:   { id, displayName, username, avatar } | null,   // denormalized
 *     receiver: { id, displayName, username, avatar } | null,
 *     createdAt, updatedAt
 *   }
 *   blocks/{blk_blockerId_blockedId} → { blockerId, blockedId, participants, createdAt }
 *
 * Reads/writes happen directly from the client. firestore.rules authorize
 * participants only, keep the pair immutable, and allow conversation creation
 * only for accepted friendships.
 */
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreInstance } from '@/lib/firebase';
import { getOrCreateConversation } from '@/lib/chat-service';
import type { Friendship, User } from '@/types';
import type { FriendRelationStatus } from '@/stores/friends-store';

/* ------------------------------------------------------------------ */
/*  Firestore document shapes                                          */
/* ------------------------------------------------------------------ */

export interface FSUserMeta {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
}

export interface FSFriendshipDoc {
  id: string;
  participants: string[];
  requesterId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  sender: FSUserMeta | null;
  receiver: FSUserMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface FSBlockDoc {
  id: string;
  blockerId: string;
  blockedId: string;
  participants: string[];
  blocked: FSUserMeta | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Key helpers (sorted pair = deterministic id, like conversations)   */
/* ------------------------------------------------------------------ */

export function friendshipPairKey(a: string, b: string): string {
  return `fs_${[a, b].sort().join('_')}`;
}

export function blockKey(blockerId: string, blockedId: string): string {
  return `blk_${blockerId}_${blockedId}`;
}

function userMeta(u: User): FSUserMeta {
  return { id: u.id, displayName: u.displayName, username: u.username, avatar: u.avatar };
}

/** Build a full app User from a denormalized meta (online/lastSeen overlay via RTDB presence). */
export function userFromMeta(meta: FSUserMeta | null | undefined): User | null {
  if (!meta?.id) return null;
  return {
    id: meta.id,
    email: '',
    displayName: meta.displayName || '',
    username: meta.username || '',
    avatar: meta.avatar || '',
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
  };
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

function fsFriendshipFromSnap(doc: QueryDocumentSnapshot<DocumentData>): FSFriendshipDoc {
  const d = doc.data();
  return {
    id: doc.id,
    participants: d.participants ?? [],
    requesterId: d.requesterId ?? '',
    receiverId: d.receiverId ?? '',
    status: (d.status ?? 'pending') as FSFriendshipDoc['status'],
    sender: d.sender ?? null,
    receiver: d.receiver ?? null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function fsBlockFromSnap(doc: QueryDocumentSnapshot<DocumentData>): FSBlockDoc {
  const d = doc.data();
  return {
    id: doc.id,
    blockerId: d.blockerId ?? '',
    blockedId: d.blockedId ?? '',
    participants: d.participants ?? [],
    blocked: d.blocked ?? null,
    createdAt: toIso(d.createdAt),
  };
}

/* ------------------------------------------------------------------ */
/*  Derivation (single subscription → friends / requests / sent)       */
/* ------------------------------------------------------------------ */

export function deriveFriendshipState(
  docs: FSFriendshipDoc[],
  meId: string
): { friends: User[]; pendingRequests: Friendship[]; sentRequests: Friendship[] } {
  const friends: User[] = [];
  const pendingRequests: Friendship[] = [];
  const sentRequests: Friendship[] = [];

  for (const d of docs) {
    if (d.status === 'accepted') {
      const other = d.participants[0] === meId ? d.receiver : d.sender;
      const u = userFromMeta(other);
      if (u) friends.push(u);
      continue;
    }
    if (d.status !== 'pending') continue;
    const isMine = d.requesterId === meId;
    const fs: Friendship = {
      id: d.id,
      senderId: d.requesterId,
      receiverId: d.receiverId,
      status: 'pending',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      sender: userFromMeta(d.sender) ?? undefined,
      receiver: userFromMeta(d.receiver) ?? undefined,
    };
    if (isMine) sentRequests.push(fs);
    else pendingRequests.push(fs);
  }

  // Newest first (mirrors the legacy API ordering).
  pendingRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sentRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { friends, pendingRequests, sentRequests };
}

/* ------------------------------------------------------------------ */
/*  Subscriptions                                                      */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to every friendship the user is part of (all statuses).
 * The consumer derives friends / pending / sent client-side — avoids
 * composite-index requirements and keeps a single live channel.
 */
export function subscribeFriendships(
  meId: string,
  onChange: (docs: FSFriendshipDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirestoreInstance();
  const q = query(collection(db, 'friendships'), where('participants', 'array-contains', meId));
  console.info('[friends] subscribeFriendships starting for:', meId);
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map(fsFriendshipFromSnap);
      console.info('[friends] subscribeFriendships snapshot:', {
        meId,
        docCount: docs.length,
        docs: docs.map((d) => ({ id: d.id, status: d.status, requester: d.requesterId, receiver: d.receiverId })),
      });
      onChange(docs);
    },
    (err) => {
      console.error('[friends] subscribeFriendships error:', err);
      onError?.(err);
    }
  );
}

/** Subscribe to blocks where the user is either side (blocked + blocked_by). */
export function subscribeBlocks(
  meId: string,
  onChange: (docs: FSBlockDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirestoreInstance();
  const q = query(collection(db, 'blocks'), where('participants', 'array-contains', meId));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(fsBlockFromSnap)),
    (err) => onError?.(err)
  );
}

/* ------------------------------------------------------------------ */
/*  Writes — friendships                                               */
/* ------------------------------------------------------------------ */

/**
 * Send a friend request. Atomic: if a previously-declined request exists for
 * the pair it is deleted in the same transaction so the set below is a fresh
 * create (writing over a declined doc would be an update write the rules
 * reject — updates require resource.status == 'pending'). Running in a
 * transaction also closes the TOCTOU race where the receiver accepts while we
 * are sending — the version precondition aborts/retries and we re-read the
 * accepted status instead of destroying the friendship.
 */
export async function sendFriendRequest(me: User, receiver: User): Promise<Friendship> {
  const db = getFirestoreInstance();
  const id = friendshipPairKey(me.id, receiver.id);
  const ref = doc(db, 'friendships', id);

  console.info('[friends] sendFriendRequest:', {
    fsId: id,
    senderId: me.id,
    senderEmail: me.email,
    receiverId: receiver.id,
    receiverEmail: receiver.email,
    participants: [me.id, receiver.id].sort(),
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const status = snap.data().status;
      console.info('[friends] sendFriendRequest existing doc:', { fsId: id, status });
      if (status === 'accepted') throw new Error('Already friends');
      if (status === 'pending') throw new Error('Request already pending');
      tx.delete(ref); // declined → clear the stale row
    }
    tx.set(ref, {
      participants: [me.id, receiver.id].sort(),
      requesterId: me.id,
      receiverId: receiver.id,
      status: 'pending',
      sender: userMeta(me),
      receiver: userMeta(receiver),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  console.info('[friends] sendFriendRequest success:', { fsId: id });
  return {
    id,
    senderId: me.id,
    receiverId: receiver.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sender: me,
    receiver,
  };
}

/** Accept a pending request (receiver only) and create the pair conversation. */
export async function acceptFriendRequest(fsId: string, meId: string): Promise<string> {
  const db = getFirestoreInstance();
  const ref = doc(db, 'friendships', fsId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Request not found');
  const d = snap.data();
  if (d.receiverId !== meId) throw new Error('Forbidden');
  if (d.status !== 'pending') throw new Error('Request not pending');

  await updateDoc(ref, { status: 'accepted', updatedAt: serverTimestamp() });

  // Create the pair conversation (deterministic id, reuses legacy docs).
  const otherId = (d.participants as string[]).find((p: string) => p !== meId);
  return otherId ? getOrCreateConversation(meId, otherId) : '';
}

/** Decline a pending request (receiver only). */
export async function declineFriendRequest(fsId: string, meId: string): Promise<void> {
  const db = getFirestoreInstance();
  const ref = doc(db, 'friendships', fsId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Request not found');
  const d = snap.data();
  if (d.receiverId !== meId) throw new Error('Forbidden');
  await updateDoc(ref, { status: 'declined', updatedAt: serverTimestamp() });
}

/** Cancel a sent request (requester only). */
export async function cancelFriendRequest(fsId: string, meId: string): Promise<void> {
  const db = getFirestoreInstance();
  const ref = doc(db, 'friendships', fsId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Request not found');
  const d = snap.data();
  if (d.requesterId !== meId) throw new Error('Forbidden');
  await deleteDoc(ref);
}

/** Remove a friend (either participant). */
export async function removeFriend(meId: string, otherId: string): Promise<void> {
  const db = getFirestoreInstance();
  await deleteDoc(doc(db, 'friendships', friendshipPairKey(meId, otherId)));
}

/* ------------------------------------------------------------------ */
/*  Writes — blocks                                                    */
/* ------------------------------------------------------------------ */

/**
 * Block a user: write the block doc + delete any friendship between the pair.
 * The friendship delete is conditional — a batch.delete of a non-existent doc
 * would be rejected by the rules (resource == null), failing the whole batch
 * and leaving the block unwritten when blocking a stranger.
 */
export async function blockUser(
  meId: string,
  blocked: FSUserMeta
): Promise<void> {
  const db = getFirestoreInstance();
  const batch = writeBatch(db);
  batch.set(doc(db, 'blocks', blockKey(meId, blocked.id)), {
    blockerId: meId,
    blockedId: blocked.id,
    participants: [meId, blocked.id].sort(),
    blocked,
    createdAt: serverTimestamp(),
  });
  const fsRef = doc(db, 'friendships', friendshipPairKey(meId, blocked.id));
  if ((await getDoc(fsRef)).exists()) batch.delete(fsRef);
  await batch.commit();
}

/** Unblock a user (blocker only). */
export async function unblockUser(meId: string, blockedId: string): Promise<void> {
  const db = getFirestoreInstance();
  await deleteDoc(doc(db, 'blocks', blockKey(meId, blockedId)));
}

/* ------------------------------------------------------------------ */
/*  One-shot reads (search results / profile pages)                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve the relationship between me and another user, plus the mutual
 * friend count. Mirrors the legacy /friends/status payload client-side.
 */
export async function getFriendStatusWith(
  meId: string,
  otherId: string
): Promise<{ status: FriendRelationStatus; mutualCount: number; requestId: string | null }> {
  const db = getFirestoreInstance();

  const fsId = friendshipPairKey(meId, otherId);
  console.info('[friends] getFriendStatusWith start:', { meId, otherId, fsId });

  const [fsSnap, myBlk, theirBlk, myFs, theirFs] = await Promise.all([
    getDoc(doc(db, 'friendships', fsId)),
    getDoc(doc(db, 'blocks', blockKey(meId, otherId))),
    getDoc(doc(db, 'blocks', blockKey(otherId, meId))),
    getDocs(query(collection(db, 'friendships'), where('participants', 'array-contains', meId))),
    getDocs(query(collection(db, 'friendships'), where('participants', 'array-contains', otherId))),
  ]);

  console.info('[friends] getFriendStatusWith resolved:', {
    meId,
    otherId,
    fsExists: fsSnap.exists(),
    fsStatus: fsSnap.exists() ? fsSnap.data().status : null,
    myBlkExists: myBlk.exists(),
    theirBlkExists: theirBlk.exists(),
    myFsCount: myFs.size,
    theirFsCount: theirFs.size,
  });

  let status: FriendRelationStatus = 'none';
  if (myBlk.exists()) status = 'blocked';
  else if (theirBlk.exists()) status = 'blocked_by';
  else if (fsSnap.exists()) {
    const d = fsSnap.data();
    if (d.status === 'accepted') status = 'accepted';
    else if (d.status === 'pending') {
      status = d.requesterId === meId ? 'pending_sent' : 'pending_received';
    }
  }

  // Mutual friends: accepted friendships of both sides, intersected.
  // Filter by status client-side — adding a status== equality to the query
  // would require a composite index we don't want to provision.
  const myIds = new Set<string>();
  for (const d of myFs.docs) {
    if (d.data().status !== 'accepted') continue;
    for (const p of (d.data().participants ?? []) as string[]) if (p !== meId) myIds.add(p);
  }
  const theirIds = new Set<string>();
  for (const d of theirFs.docs) {
    if (d.data().status !== 'accepted') continue;
    for (const p of (d.data().participants ?? []) as string[]) if (p !== otherId) theirIds.add(p);
  }
  let mutualCount = 0;
  for (const id of myIds) if (theirIds.has(id)) mutualCount++;

  return { status, mutualCount, requestId: fsSnap.exists() ? fsSnap.id : null };
}
