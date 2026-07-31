'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { getAllQueuedMessages } from '@/lib/offline-queue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Bell, MessageSquarePlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Conversation, User } from '@/types';

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
    return format(new Date(date), 'h:mm a');
  } catch {
    return '';
  }
}

type FilterTab = 'all' | 'unread' | 'groups' | 'archived';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'groups', label: 'Groups' },
  { key: 'archived', label: 'Archived' },
];

/* ------------------------------------------------------------------ */
/*  Conversation List                                                  */
/* ------------------------------------------------------------------ */
export function ConversationList() {
  const {
    conversations, activeConversationId, setActiveConversationId,
    searchQuery, setSearchQuery, setConversations,
    updateConversation, addMessage, updateMessage, removeMessage,
    setTyping, clearTypingForConversation, clearUnread, addReaction, removeReaction,
    setNetworkStatus, syncQueuedMessages,
  } = useChatStore();
  const { user, token } = useAuthStore();
  const { setSearchOpen, setNotificationsOpen, setMobileSidebarOpen } = useUIStore();
  const { pendingRequests, setFriends, setPendingRequests } = useFriendsStore();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const socketRef = useRef<any>(null);

  const isDemo = token?.startsWith('demo-');
  const greeting = useMemo(() => getGreeting(), []);

  const loadData = useCallback(async () => {
    if (isDemo) return;
    try {
      const convs = await api<Conversation[]>('/conversations', { token });
      setConversations(convs);
      const f = await api<User[]>('/friends/list', { token });
      setFriends(f);
      const reqs = await api<any[]>('/friends/requests', { token });
      setPendingRequests(reqs);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [isDemo, token, setConversations, setFriends, setPendingRequests]);

  useEffect(() => {
    if (!token) return;
    if (isDemo) return;
    loadData();
    const socket = connectSocket(token);
    socketRef.current = socket;

    const onMessageNew = (msg: any) => {
      addMessage(msg);
      const activeId = useChatStore.getState().activeConversationId;
      if (msg.conversationId !== activeId) {
        updateConversation(msg.conversationId, {
          lastMessage: msg,
          updatedAt: msg.createdAt,
        } as Partial<Conversation>);
      } else {
        socket.emit('message:read', { conversationId: msg.conversationId });
        api('/conversations/' + msg.conversationId + '/read', { token, method: 'POST', body: {} });
      }
    };
    const onMessageUpdated = (msg: any) => { updateMessage(msg.id, msg); };
    const onMessageDeleted = (data: any) => { removeMessage(data.messageId); };
    const onMessageDelivered = (data: any) => {
      updateMessage(data.messageId, { status: 'delivered' });
    };
    const onMessageFailed = (data: any) => {
      const msgs = useChatStore.getState().messages;
      const sending = msgs.find(m => (m.status === 'sending' || m.status === 'queued') && m.conversationId === data.conversationId);
      if (sending) {
        updateMessage(sending.id, { status: 'failed' });
      }
    };
    const onReactionUpdate = (data: any) => {
      if (data.removed) {
        removeReaction(data.messageId, data.userId, data.emoji);
      } else {
        addReaction(data.messageId, data);
      }
    };
    const onUserTyping = (data: any) => { setTyping(data.userId, data.conversationId, data.isTyping, data.user); };
    const onMessageRead = (data: any) => { updateConversation(data.conversationId, { unreadCount: 0 } as Partial<Conversation>); };

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:delivered', onMessageDelivered);
    socket.on('message:failed', onMessageFailed);
    socket.on('reaction:update', onReactionUpdate);
    socket.on('user:typing', onUserTyping);
    socket.on('message:read', onMessageRead);

    // Network awareness + auto-sync on reconnect
    const handleOnline = () => { setNetworkStatus('online'); syncQueuedMessages(); };
    const handleOffline = () => setNetworkStatus('offline');
    const handleReconnect = () => { setNetworkStatus('reconnecting'); };
    const handleReconnectFail = () => setNetworkStatus('offline');
    const handleConnect = () => { setNetworkStatus('online'); syncQueuedMessages(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
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

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:delivered', onMessageDelivered);
      socket.off('message:failed', onMessageFailed);
      socket.off('reaction:update', onReactionUpdate);
      socket.off('user:typing', onUserTyping);
      socket.off('message:read', onMessageRead);
      socket.off('reconnect', handleReconnect);
      socket.off('reconnect_attempt', handleReconnect);
      socket.off('reconnect_failed', handleReconnectFail);
      socket.off('connect', handleConnect);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isDemo, token, loadData, addMessage, updateConversation, updateMessage, removeMessage, addReaction, removeReaction, setTyping, setNetworkStatus, syncQueuedMessages]);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    clearTypingForConversation(id);
    clearUnread(id);
    setMobileSidebarOpen(false);
    if (!isDemo) {
      api('/conversations/' + id + '/read', { token, method: 'POST', body: {} });
      if (socketRef.current) socketRef.current.emit('message:read', { conversationId: id });
    }
  }, [isDemo, token, activeConversationId, setActiveConversationId, clearTypingForConversation, clearUnread, setMobileSidebarOpen]);

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

          {filtered.map((conv) => {
            const other = conv.otherUser;
            const isActive = conv.id === activeConversationId;
            return (
              <motion.button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
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
                        {getInitials(other?.displayName || '?')}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  {other?.showOnline !== false && other?.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-surface-1 bg-online" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold truncate text-foreground">
                      {other?.displayName || other?.username || 'Unknown'}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-[12px] text-muted-foreground/60 shrink-0 ml-2">
                        {formatTimestamp(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground truncate leading-snug">
                    {conv.lastMessage?.deleted
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
          })}
        </div>
      </div>
    </div>
  );
}