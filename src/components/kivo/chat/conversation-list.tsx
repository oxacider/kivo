'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useUIStore } from '@/stores/ui-store';
import { authFetch } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { auth } from '@/lib/firebase';
import { getAllQueuedMessages } from '@/lib/offline-queue';
import { subscribeConversations, fsConversationToConversation, markConversationRead, markMessagesDelivered, type FSConversationDoc } from '@/lib/chat-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Bell, MessageSquarePlus, Check, CheckCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Conversation, Message, User } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatTimestamp(date: string) {
  try {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return format(d, 'h:mm a');
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (d.getFullYear() === today.getFullYear()) return format(d, 'MMM d');
    return format(d, 'MMM d, yyyy');
  } catch {
    return '';
  }
}

/** Mini KIVO status glyph for outgoing last-message previews. */
function MiniStatusIcon({ status }: { status?: string }) {
  if (status === 'seen') return <CheckCheck className="h-3 w-3 text-seen" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground/50" />;
  return <Check className="h-2.5 w-2.5 text-muted-foreground/40" />;
}

type FilterTab = 'all' | 'unread' | 'groups' | 'archived';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'groups', label: 'Groups' },
  { key: 'archived', label: 'Archived' },
];

/* ------------------------------------------------------------------ */
/*  Memoized Conversation Row                                          */
/*  Only re-renders when its own data or active state changes.         */
/* ------------------------------------------------------------------ */

interface ConversationRowProps {
  conv: Conversation;
  isActive: boolean;
  userId: string;
  onSelect: (id: string) => void;
}

const ConversationRow = memo(function ConversationRow({
  conv,
  isActive,
  userId,
  onSelect,
}: ConversationRowProps) {
  const other = conv.otherUser;
  const isPending = !other;

  return (
    <motion.button
      onClick={() => onSelect(conv.id)}
      className={`w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 ring-1 ring-primary/20'
          : 'bg-surface-1 hover:bg-surface-hover'
      }`}
      whileTap={{ scale: 0.98 }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl overflow-hidden bg-surface-2">
          <Avatar className="h-full w-full rounded-2xl">
            <AvatarImage src={other?.avatar || undefined} />
            <AvatarFallback className="text-base font-semibold bg-surface-2 text-foreground">
              {getInitials(other?.displayName || (isPending ? '..' : '?'))}
            </AvatarFallback>
          </Avatar>
        </div>
        {!isPending && other?.showOnline !== false && other?.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-surface-1 bg-online" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-[15px] font-semibold truncate ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
            {isPending ? 'KIVO user' : other?.displayName || other?.username}
          </span>
          {conv.lastMessage && (
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground/60 shrink-0 ml-2">
              {!isPending && conv.lastMessage.senderId === userId && (
                <MiniStatusIcon status={(conv.lastMessage as Message).status} />
              )}
              <span>{formatTimestamp(conv.lastMessage.createdAt)}</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground truncate leading-snug">
          {isPending
            ? 'Loading…'
            : conv.lastMessage?.deleted
              ? 'Message deleted'
              : conv.lastMessage?.content || 'Tap to start chatting'}
        </p>
      </div>

      {/* Unread badge */}
      {(conv.unreadCount ?? 0) > 0 && (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground">
          {conv.unreadCount}
        </span>
      )}
    </motion.button>
  );
}, (prev, next) => {
  // Custom comparator: only re-render when visible fields change.
  // Skips re-renders from Firestore snapshots that produce new conv objects
  // with identical data.
  return (
    prev.isActive === next.isActive &&
    prev.userId === next.userId &&
    prev.onSelect === next.onSelect &&
    prev.conv.id === next.conv.id &&
    prev.conv.otherUser?.displayName === next.conv.otherUser?.displayName &&
    prev.conv.otherUser?.username === next.conv.otherUser?.username &&
    prev.conv.otherUser?.avatar === next.conv.otherUser?.avatar &&
    prev.conv.otherUser?.online === next.conv.otherUser?.online &&
    prev.conv.otherUser?.showOnline === next.conv.otherUser?.showOnline &&
    prev.conv.lastMessage?.id === next.conv.lastMessage?.id &&
    prev.conv.lastMessage?.content === next.conv.lastMessage?.content &&
    prev.conv.lastMessage?.status === next.conv.lastMessage?.status &&
    prev.conv.lastMessage?.senderId === next.conv.lastMessage?.senderId &&
    prev.conv.lastMessage?.createdAt === next.conv.lastMessage?.createdAt &&
    prev.conv.lastMessage?.deleted === next.conv.lastMessage?.deleted &&
    prev.conv.unreadCount === next.conv.unreadCount
  );
});

/* ------------------------------------------------------------------ */
/*  Conversation List                                                  */
/* ------------------------------------------------------------------ */
export function ConversationList() {
  const {
    conversations, activeConversationId, setActiveConversationId,
    searchQuery, setSearchQuery, setConversations,
    presenceMap, clearTypingForConversation, clearUnread,
    networkStatus, setNetworkStatus, syncQueuedMessages,
  } = useChatStore();
  const { user, isDemo } = useAuthStore();
  const { setSearchOpen, setNotificationsOpen, setMobileSidebarOpen } = useUIStore();
  // Friends + pending requests now stream from the useFriends() Firestore hook.
  const { friends, pendingRequests } = useFriendsStore();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const socketRef = useRef<any>(null);
  /** One-shot toast guard for the Firestore conversations subscription error. */
  const convErrorShownRef = useRef(false);
  /** Raw Firestore conversation docs (Phase 2). */
  const [fsConvs, setFsConvs] = useState<FSConversationDoc[]>([]);
  /** Profiles fetched for participants not in the friends list. */
  const [extraProfiles, setExtraProfiles] = useState<Record<string, User>>({});
  /** User IDs whose profile fetch returned 404 — the user no longer exists. */
  const [deletedUserIds, setDeletedUserIds] = useState<Set<string>>(new Set());

  const greeting = useMemo(() => getGreeting(), []);

  /** KIVO status: lastMessage ids already acked as delivered this session. */
  const deliveredAckedRef = useRef<Set<string>>(new Set());

  /**
   * Phase 2: conversations now live in Firestore.
   * - Subscribe to conversation docs the user participates in.
   * - Resolve otherUser from the friends list / lazily fetched profiles.
   * - Phase 3: live online/lastSeen is merged from the RTDB presence map.
   */
  useEffect(() => {
    if (isDemo || !user?.id) return;
    const meId = user.id;

    const unsub = subscribeConversations(
      meId,
      (convs) => setFsConvs(convs),
      (err) => {
        console.error('[chat] conversation subscription error', err);
        if (!convErrorShownRef.current) {
          convErrorShownRef.current = true;
          toast.error('Chat unavailable — check connection and Firestore setup');
        }
      }
    );
    return () => unsub();
  }, [isDemo, user?.id]);

  // Lazily fetch profiles for conversation participants that aren't in the friends list.
  useEffect(() => {
    if (isDemo || !user?.id || fsConvs.length === 0) return;
    const meId = user.id;
    const known = new Set([...friends.map((f) => f.id), ...Object.keys(extraProfiles), ...deletedUserIds]);
    let needsUpdate = false;
    const nextDeleted = new Set(deletedUserIds);
    for (const c of fsConvs) {
      const otherId = c.participants.find((p) => p !== meId);
      if (otherId && !known.has(otherId)) {
        known.add(otherId); // avoid duplicate fetches in this pass
        // Use authFetch directly so we can distinguish 404 (user deleted)
        // from transient errors (network, 500) which should be retried.
        authFetch(`/api/users/${otherId}`, {}, { autoSignOut: false })
          .then(async (res) => {
            if (!res.ok) {
              if (res.status === 404) {
                // User genuinely deleted — mark for filtering.
                needsUpdate = true;
                nextDeleted.add(otherId);
              }
              // Other errors (500, 503) — skip silently; will retry on next render.
              return;
            }
            const json = await res.json();
            if (json?.success && json?.data) {
              setExtraProfiles((prev) => (prev[otherId] ? prev : { ...prev, [otherId]: json.data as User }));
            }
          })
          .catch(() => {
            // Network error — skip silently; will retry on next render.
          });
      }
    }
    if (needsUpdate) {
      // Defer the state update so React doesn't complain about setting
      // state inside a render-pass effect synchronously.
      queueMicrotask(() => setDeletedUserIds(nextDeleted));
    }
  }, [fsConvs, friends, extraProfiles, deletedUserIds, isDemo, user?.id]);

  // KIVO status: when the receiver is online and their device has synced a
  // conversation preview whose last message is from the other user and still
  // 'sent', ack it as delivered — the receiver does NOT need to open the chat.
  // Deduped per session so each message is acked once. (Full history is acked
  // as delivered/seen when the conversation is opened in conversation-view.)
  useEffect(() => {
    if (isDemo || !user?.id || networkStatus !== 'online') return;
    const meId = user.id;
    for (const c of fsConvs) {
      const lm = c.lastMessage;
      if (!lm || lm.senderId === meId || lm.deleted) continue;
      if (lm.status && lm.status !== 'sent') continue; // already delivered/seen
      if (deliveredAckedRef.current.has(lm.id)) continue;
      deliveredAckedRef.current.add(lm.id);
      markMessagesDelivered(c.id, [lm.id]).catch(() => {});
    }
  }, [fsConvs, isDemo, user?.id, networkStatus]);

  // Derive the app Conversation objects (keeps the UI shape unchanged).
  // Phase 3: overlay live RTDB presence (online/lastSeen) onto otherUser.
  // Filter out conversations where the other participant's profile was confirmed
  // deleted (not just pending fetch).
  useEffect(() => {
    if (!user?.id) return;
    const meId = user.id;
    const byId = new Map<string, User>();
    for (const f of friends) byId.set(f.id, f);
    for (const [id, u] of Object.entries(extraProfiles)) byId.set(id, u);
    const mapped: Conversation[] = [];
    for (const c of fsConvs) {
      const otherId = c.participants.find((p) => p !== meId) ?? '';
      // Skip conversations where the other user was confirmed deleted.
      if (deletedUserIds.has(otherId)) continue;
      const base = byId.get(otherId);
      const presence = base ? presenceMap[otherId] : undefined;
      const otherUser = base
        ? presence
          ? { ...base, online: presence.online, lastSeen: presence.lastSeen }
          : base
        : undefined;
      // Let conversations with pending profile fetches through (otherUser may
      // be undefined temporarily) — the extraProfiles effect will hydrate them.
      mapped.push(fsConversationToConversation(c, meId, otherUser));
    }
    setConversations(mapped);
  }, [fsConvs, friends, extraProfiles, presenceMap, deletedUserIds, user?.id, setConversations]);

  useEffect(() => {
    if (isDemo || !user?.id) return;
    let cancelled = false;
    let socket: any = null;

    // Network awareness + auto-sync on reconnect
    // (typing + presence moved to RTDB in Phase 3; socket kept only for
    //  network-status/reconnect and legacy mini-service until Phase 8)
    const handleOnline = () => { setNetworkStatus('online'); syncQueuedMessages(); };
    const handleOffline = () => setNetworkStatus('offline');
    const handleReconnect = () => { setNetworkStatus('reconnecting'); };
    const handleReconnectFail = () => setNetworkStatus('offline');
    const handleConnect = () => { setNetworkStatus('online'); syncQueuedMessages(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Obtain a FRESH Firebase ID token at connect time — never cached.
    auth.currentUser
      ?.getIdToken()
      .then((freshToken) => {
        if (cancelled || !freshToken) return;
        socket = connectSocket(freshToken);
        socketRef.current = socket;
        socket.on('reconnect', handleReconnect);
        socket.on('reconnect_attempt', handleReconnect);
        socket.on('reconnect_failed', handleReconnectFail);
        socket.on('connect', handleConnect);

        // Restore queued messages from IndexedDB into store on mount
        (async () => {
          try {
            const queued = await getAllQueuedMessages();
            for (const q of queued) {
              const msg: import('@/types').Message = {
                id: q.tempId,
                conversationId: q.conversationId,
                senderId: q.senderId,
                content: q.content,
                type: q.type as any,
                status: 'queued',
                replyToId: q.replyToId,
                edited: false,
                deleted: false,
                createdAt: q.createdAt,
                updatedAt: q.updatedAt,
                sender: q.sender,
                replyTo: q.replyTo ?? null,
                attachments: q.attachments,
              };
              useChatStore.getState().addMessage(msg);
            }
          } catch { /* IndexedDB unavailable */ }
        })();
      })
      .catch(() => { /* token fetch failed — socket stays disconnected */ });

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (socket) {
        socket.off('reconnect', handleReconnect);
        socket.off('reconnect_attempt', handleReconnect);
        socket.off('reconnect_failed', handleReconnectFail);
        socket.off('connect', handleConnect);
      }
    };
  }, [isDemo, user?.id, setNetworkStatus, syncQueuedMessages]);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    clearTypingForConversation(id);
    clearUnread(id);
    setMobileSidebarOpen(false);
    const myId = user?.id;
    if (!isDemo && myId) {
      markConversationRead(id, myId).catch(() => {});
    }
  }, [isDemo, user?.id, setActiveConversationId, clearTypingForConversation, clearUnread, setMobileSidebarOpen]);

  /* Filter logic */
  const filtered = useMemo(() => {
    let list = conversations;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const name = c.otherUser?.displayName || c.otherUser?.username || '';
        return name.toLowerCase().includes(q);
      });
    }
    if (activeFilter === 'unread') {
      list = list.filter((c) => (c.unreadCount ?? 0) > 0);
    }
    if (activeFilter === 'groups' || activeFilter === 'archived') {
      list = [];
    }
    return list;
  }, [conversations, searchQuery, activeFilter]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ================================================================== */}
      {/* HEADER — Greeting, Name, Bell, Avatar */}
      {/* ================================================================== */}
      <header className="shrink-0 px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          {/* Left — Text stack */}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-tight text-primary/90">
              {greeting}
            </p>
            <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight text-foreground truncate">
              {user?.displayName?.toUpperCase() || 'USER'}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Stay connected with All.
            </p>
          </div>

          {/* Right — Bell + Avatar */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {pendingRequests.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <div className="relative">
              <Avatar className="h-12 w-12 rounded-2xl">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="text-base font-semibold bg-surface-2 text-foreground">
                  {getInitials(user?.displayName || 'U')}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-background bg-online" />
            </div>
          </div>
        </div>
      </header>

      {/* ================================================================== */}
      {/* SEARCH BAR */}
      {/* ================================================================== */}
      <div className="shrink-0 px-5 mt-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search messages or people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-[52px] rounded-2xl bg-surface-2 pl-12 pr-4 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none border border-transparent transition-all duration-200 focus:border-primary/30 focus:bg-surface-3"
          />
        </div>
      </div>

      {/* ================================================================== */}
      {/* FILTER PILLS */}
      {/* ================================================================== */}
      <div className="shrink-0 mt-3 px-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
                activeFilter === tab.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-surface-2 text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECTION HEADER + CONVERSATION LIST */}
      {/* ================================================================== */}
      <div className="flex min-h-0 flex-1 flex-col px-5 mt-4 pb-20 md:pb-2">
        <div className="shrink-0 mb-1">
          <h2 className="text-xl font-bold text-foreground">Chats</h2>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Recent Conversations
          </p>
        </div>

        <div className="flex-1 overflow-y-auto mt-3 pb-2 space-y-2.5">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2">
                <MessageSquarePlus className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {activeFilter === 'groups'
                  ? 'No groups yet'
                  : activeFilter === 'archived'
                    ? 'No archived chats'
                    : 'No conversations yet'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/50">
                {activeFilter === 'all' ? 'Add friends to start chatting' : 'Try a different filter'}
              </p>
            </div>
          )}

          {filtered.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConversationId}
              userId={user?.id || ''}
              onSelect={selectConversation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}