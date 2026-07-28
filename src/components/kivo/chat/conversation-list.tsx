'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Plus, Users, Settings, UserCircle, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation, User } from '@/types';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { toast } from 'sonner';
import { FriendsPanel } from '@/components/kivo/friends/friends-panel';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(date: string) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: false });
  } catch {
    return '';
  }
}

export function ConversationList() {
  const { conversations, activeConversationId, setActiveConversationId, searchQuery, setSearchQuery, setConversations, addConversation, updateConversation, addMessage, updateMessage, removeMessage, setTyping, clearTypingForConversation, clearUnread } = useChatStore();
  const { user, token, setUser, setToken, logout } = useAuthStore();
  const { friends, pendingRequests, setFriends, setPendingRequests, removeFriend: removeFriendFromStore } = useFriendsStore();
  const { setView, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const [showFriends, setShowFriends] = useState(false);
  const socketRef = useRef<any>(null);

  const loadData = useCallback(async () => {
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
  }, [token, setConversations, setFriends, setPendingRequests]);

  useEffect(() => {
    if (!token) return;
    loadData();
    const socket = connectSocket(user!.id);
    socketRef.current = socket;

    socket.on('message:new', (msg: any) => {
      addMessage(msg);
      if (msg.conversationId !== activeConversationId) {
        updateConversation(msg.conversationId, {
          lastMessage: msg,
          updatedAt: msg.createdAt,
        } as Partial<Conversation>);
      } else {
        socket.emit('message:read', { conversationId: msg.conversationId });
        api('/conversations/' + msg.conversationId + '/read', { token, method: 'POST', body: {} });
      }
    });

    socket.on('message:updated', (msg: any) => {
      updateMessage(msg.id, msg);
    });

    socket.on('message:deleted', (data: any) => {
      removeMessage(data.id);
    });

    socket.on('user:typing', (data: any) => {
      setTyping(data.userId, data.conversationId, data.isTyping);
    });

    socket.on('message:read', (data: any) => {
      updateConversation(data.conversationId, { unreadCount: 0 } as Partial<Conversation>);
    });

    return () => {
      disconnectSocket();
    };
  }, [token, loadData, activeConversationId, addMessage, updateConversation, updateMessage, removeMessage, setTyping]);

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    clearTypingForConversation(id);
    clearUnread(id);
    setMobileSidebarOpen(false);
    api('/conversations/' + id + '/read', { token, method: 'POST', body: {} });
    if (socketRef.current) {
      socketRef.current.emit('message:read', { conversationId: id });
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    setView('welcome');
    useChatStore.getState().reset();
    useFriendsStore.getState().reset();
  };

  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true;
    const name = c.otherUser?.displayName || c.otherUser?.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-full flex-col bg-surface-1 border-r border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          {user && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar || undefined} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getInitials(user.displayName || 'U')}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <h2 className="text-sm font-semibold leading-none">Chats</h2>
            {user && <p className="text-[11px] text-muted-foreground">@{user.username}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFriends(!showFriends)}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all"
          >
            <Users className="h-4 w-4" />
            {pendingRequests.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('settings')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 rounded-lg bg-surface-2 border-border/30 text-xs"
          />
        </div>
      </div>

      {/* Friends panel */}
      <AnimatePresence>
        {showFriends && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30"
          >
            <FriendsPanel onClose={() => setShowFriends(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-1">
          {filtered.length === 0 && !showFriends && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">
                <Plus className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Add friends to start chatting
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
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all mb-0.5 ${
                  isActive ? 'bg-primary/10' : 'hover:bg-surface-hover'
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={other?.avatar || undefined} />
                    <AvatarFallback className="text-sm bg-primary/10 text-primary">
                      {getInitials(other?.displayName || '?')}
                    </AvatarFallback>
                  </Avatar>
                  {other?.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-online" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">
                      {other?.displayName || other?.username || 'Unknown'}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">
                        {formatTime(conv.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.lastMessage?.deleted
                        ? 'Message deleted'
                        : conv.lastMessage?.content || 'No messages yet'}
                    </p>
                    {(conv.unreadCount ?? 0) > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground ml-2">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Bottom nav (mobile) */}
      <div className="flex items-center justify-around border-t border-border/30 py-2 md:hidden">
        <button onClick={() => setView('chat')} className="flex flex-col items-center gap-0.5 text-primary">
          <Users className="h-5 w-5" />
          <span className="text-[10px]">Chats</span>
        </button>
        <button
          onClick={() => setView('settings')}
          className="flex flex-col items-center gap-0.5 text-muted-foreground"
        >
          <UserCircle className="h-5 w-5" />
          <span className="text-[10px]">Profile</span>
        </button>
        <button onClick={handleLogout} className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <LogOut className="h-5 w-5" />
          <span className="text-[10px]">Logout</span>
        </button>
      </div>
    </div>
  );
}