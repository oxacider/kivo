'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import {
  subscribeFriendships,
  subscribeBlocks,
  deriveFriendshipState,
  userFromMeta,
} from '@/lib/friends-service';
import { toast } from 'sonner';

/**
 * Phase 4 — Firestore friends manager.
 *
 * Mount once (in the authenticated chat layout):
 * 1. Subscribes to every friendship involving the user and mirrors the
 *    derived friends / pending requests / sent requests into the store.
 * 2. Subscribes to blocks (both directions) and mirrors blocked users.
 *
 * This replaces the legacy /friends/* and /blocks/* API polling; the UI
 * components now read straight from the store.
 */
export function useFriends() {
  const { user, token } = useAuthStore();
  const isDemo = token?.startsWith('demo-');
  const meId = user?.id ?? null;

  const friendsErrShown = useRef(false);
  const blocksErrShown = useRef(false);

  useEffect(() => {
    if (!meId || isDemo) return;
    let cancelled = false;

    const unsubF = subscribeFriendships(
      meId,
      (docs) => {
        if (cancelled) return;
        const { friends, pendingRequests, sentRequests } = deriveFriendshipState(docs, meId);
        const store = useFriendsStore.getState();
        store.setFriends(friends);
        store.setPendingRequests(pendingRequests);
        store.setSentRequests(sentRequests);
      },
      (err) => {
        console.error('[friends] friendships subscription error', err);
        if (!friendsErrShown.current) {
          friendsErrShown.current = true;
          toast.error('Friends unavailable — check connection and Firestore setup');
        }
      }
    );

    const unsubB = subscribeBlocks(
      meId,
      (docs) => {
        if (cancelled) return;
        const blocked = docs
          .filter((d) => d.blockerId === meId)
          .map((d) => userFromMeta(d.blocked))
          .filter(Boolean) as NonNullable<ReturnType<typeof userFromMeta>>[];
        useFriendsStore.getState().setBlockedUsers(blocked);
      },
      (err) => {
        console.error('[friends] blocks subscription error', err);
        if (!blocksErrShown.current) {
          blocksErrShown.current = true;
          toast.error('Blocked list unavailable — check connection and Firestore setup');
        }
      }
    );

    return () => {
      cancelled = true;
      unsubF();
      unsubB();
    };
  }, [meId, isDemo]);
}
