'use client';

import { useEffect } from 'react';
import { auth, getDatabaseInstance } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';
import { connectPresence, subscribePresence, disconnectPresence, startPresenceHeartbeat } from '@/lib/presence';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useChatStore } from '@/stores/chat-store';

/**
 * Phase 3 — RTDB presence manager.
 *
 * Mount once (in the authenticated chat layout):
 * 1. Brings the current user online (mapping + presence node with onDisconnect).
 * 2. Subscribes to live presence for every friend and conversation participant
 *    and mirrors it into the friends store + chat store presence map.
 *
 * On unmount / logout the user is flipped offline.
 */
export function usePresence() {
  const { user, isDemo } = useAuthStore();
  const { friends } = useFriendsStore();
  const { conversations } = useChatStore();

  const meId = user?.id ?? null;

  // Go online once when a real session is present, and re-establish presence
  // whenever the RTDB connection (re)connects — otherwise onDisconnect flips us
  // offline on any network blip and nothing brings us back until reload.
  useEffect(() => {
    if (!meId || isDemo) return;
    const db = getDatabaseInstance();
    const firebaseUid = auth.currentUser?.uid ?? null;
    const goOnline = () => void connectPresence(meId, firebaseUid);
    goOnline();
    // Keep lastSeen fresh during long sessions; disconnectPresence stops it
    // on teardown so the offline flip can't be overwritten by a late tick.
    const stopHeartbeat = startPresenceHeartbeat(meId);
    const unsub = onValue(ref(db, '.info/connected'), (snap) => {
      if (snap.val() === true) goOnline();
    });
    return () => {
      unsub();
      stopHeartbeat();
      void disconnectPresence(meId);
    };
  }, [meId, isDemo]);

  // Track everyone we can see: friends + conversation participants (minus me).
  const trackedIds = Array.from(
    new Set([
      ...friends.map((f) => f.id),
      ...conversations.flatMap((c) => c.participants ?? []),
      ...conversations.map((c) => c.otherUser?.id).filter(Boolean) as string[],
    ])
  ).filter((id) => id && id !== meId);

  useEffect(() => {
    if (!meId || isDemo || trackedIds.length === 0) return;

    const unsubs = trackedIds.map((userId) =>
      subscribePresence(userId, (presence) => {
        if (!presence) return;
        useFriendsStore.getState().applyPresence(userId, presence.online, presence.lastSeen);
        useChatStore.getState().setPresence(userId, presence.online, presence.lastSeen, presence.connectionStatus);
      })
    );

    return () => unsubs.forEach((unsub) => unsub());
    // Re-subscribe when the tracked set changes (friends/conversations arrive).
  }, [meId, isDemo, trackedIds.join(',')]);
}
