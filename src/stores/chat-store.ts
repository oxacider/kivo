import { create } from 'zustand';
import type { Message, Conversation, TypingUser, Reaction, MediaAttachment, QueuedMessage } from '@/types';
import { saveQueuedMessage, getAllQueuedMessages, removeQueuedMessage } from '@/lib/offline-queue';
import { sendMessage as firestoreSendMessage } from '@/lib/chat-service';
import { useAuthStore } from '@/stores/auth-store';
import { schedulePushHistory } from '@/lib/navigation';

export interface TypingUserData extends TypingUser {
  user?: { id: string; displayName: string; avatar: string } | null;
}

type NetworkStatus = 'online' | 'offline' | 'reconnecting';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  typingUsers: TypingUserData[];
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  isLoadingConversations: boolean;
  searchQuery: string;
  networkStatus: NetworkStatus;
  isSyncing: boolean;
  /** Phase 3: live RTDB presence map keyed by kivoId. */
  presenceMap: Record<string, { online: boolean; lastSeen: string }>;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  setPresence: (userId: string, online: boolean, lastSeen: string) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  prependMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, data: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  setTypingUsers: (users: TypingUserData[]) => void;
  setTyping: (userId: string, conversationId: string, isTyping: boolean, user?: { id: string; displayName: string; avatar: string } | null) => void;
  clearTypingForConversation: (conversationId: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setLoadingMoreMessages: (loading: boolean) => void;
  setHasMoreMessages: (hasMore: boolean) => void;
  setLoadingConversations: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  addReaction: (messageId: string, reaction: Reaction) => void;
  removeReaction: (messageId: string, userId: string, emoji: string) => void;
  setMessageStatus: (messageId: string, status: Message['status']) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  syncQueuedMessages: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  messages: [] as Message[],
  typingUsers: [] as TypingUserData[],
  isLoadingMessages: false,
  isLoadingMoreMessages: false,
  hasMoreMessages: false,
  isLoadingConversations: false,
  searchQuery: '',
  networkStatus: 'online' as NetworkStatus,
  isSyncing: false,
  presenceMap: {} as Record<string, { online: boolean; lastSeen: string }>,
};

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  ...initialState,
  setConversations: (conversations) => set({ conversations }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
  updateConversation: (id, data) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    })),
  setActiveConversationId: (id) => {
    schedulePushHistory();
    set({ activeConversationId: id });
  },
  setMessages: (messages) => set({ messages }),
  prependMessages: (newMessages) =>
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const unique = newMessages.filter((m) => !existingIds.has(m.id));
      if (unique.length === 0) return state;
      return { messages: [...unique, ...state.messages] };
    }),
  addMessage: (message) =>
    set((state) => {
      const exists = state.messages.find((m) => m.id === message.id);
      if (exists) return state;
      return { messages: [...state.messages, message] };
    }),
  updateMessage: (id, data) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...data } : m)),
    })),
  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),
  setTypingUsers: (typingUsers) => set({ typingUsers }),
  setTyping: (userId, conversationId, isTyping, user) =>
    set((state) => {
      const filtered = state.typingUsers.filter(
        (t) => !(t.userId === userId && t.conversationId === conversationId)
      );
      if (isTyping) {
        return { typingUsers: [...filtered, { userId, conversationId, isTyping, user }] };
      }
      return { typingUsers: filtered };
    }),
  clearTypingForConversation: (conversationId) =>
    set((state) => ({
      typingUsers: state.typingUsers.filter(
        (t) => t.conversationId !== conversationId
      ),
    })),
  setLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),
  setLoadingMoreMessages: (isLoadingMoreMessages) => set({ isLoadingMoreMessages }),
  setHasMoreMessages: (hasMoreMessages) => set({ hasMoreMessages }),
  setLoadingConversations: (isLoadingConversations) =>
    set({ isLoadingConversations }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  incrementUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
          : c
      ),
    })),
  clearUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),
  addReaction: (messageId, reaction) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = [...(m.reactions || [])];
        const filtered = reactions.filter((r) => r.userId !== reaction.userId);
        filtered.push(reaction);
        return { ...m, reactions: filtered };
      }),
    })),
  removeReaction: (messageId, userId, emoji) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          reactions: (m.reactions || []).filter(
            (r) => !(r.userId === userId && r.emoji === emoji)
          ),
        };
      }),
    })),
  setMessageStatus: (messageId, status) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, status } : m
      ),
    })),
  setNetworkStatus: (networkStatus) => set({ networkStatus }),
  setPresence: (userId, online, lastSeen) =>
    set((state) => ({
      presenceMap: { ...state.presenceMap, [userId]: { online, lastSeen } },
      // Mirror onto conversation otherUser so headers/list stay live too.
      conversations: state.conversations.map((c) =>
        c.otherUser?.id === userId
          ? { ...c, otherUser: { ...c.otherUser, online, lastSeen } }
          : c
      ),
    })),
  syncQueuedMessages: async () => {
    const state = get();
    if (state.isSyncing) return;
    if (!isOnline()) return;

    let queued: QueuedMessage[];
    try {
      queued = await getAllQueuedMessages();
    } catch {
      return;
    }
    if (queued.length === 0) return;

    set({ isSyncing: true });
    const { user } = useAuthStore.getState();
    if (!user) {
      set({ isSyncing: false });
      return;
    }

    for (const msg of queued) {
      // Update local status to 'sending'
      get().setMessageStatus(msg.tempId, 'sending');

      try {
        const conv = get().conversations.find((c) => c.id === msg.conversationId);
        const recipientId = conv?.participants?.find((p) => p !== user.id);
        await firestoreSendMessage({
          conversationId: msg.conversationId,
          sender: user,
          recipientId,
          content: msg.content,
          type: msg.type,
          replyToId: msg.replyToId,
          replyTo: msg.replyTo ?? null,
          attachments: msg.attachments ?? [],
          tempId: msg.tempId,
        });
        // Remove from IndexedDB after successful Firestore write
        try { await removeQueuedMessage(msg.tempId); } catch { /* ignore */ }
      } catch {
        get().setMessageStatus(msg.tempId, 'failed');
      }
    }

    set({ isSyncing: false });
  },
  reset: () => set(initialState),
}));
