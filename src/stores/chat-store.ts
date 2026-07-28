import { create } from 'zustand';
import type { Message, Conversation, TypingUser } from '@/types';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  typingUsers: TypingUser[];
  isLoadingMessages: boolean;
  isLoadingConversations: boolean;
  searchQuery: string;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  setActiveConversationId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, data: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  setTypingUsers: (users: TypingUser[]) => void;
  setTyping: (userId: string, conversationId: string, isTyping: boolean) => void;
  clearTypingForConversation: (conversationId: string) => void;
  setLoadingMessages: (loading: boolean) => void;
  setLoadingConversations: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  reset: () => void;
}

const initialState = {
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  messages: [] as Message[],
  typingUsers: [] as TypingUser[],
  isLoadingMessages: false,
  isLoadingConversations: false,
  searchQuery: '',
};

export const useChatStore = create<ChatState>()((set) => ({
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
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
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
  setTyping: (userId, conversationId, isTyping) =>
    set((state) => {
      const filtered = state.typingUsers.filter(
        (t) => !(t.userId === userId && t.conversationId === conversationId)
      );
      if (isTyping) {
        return { typingUsers: [...filtered, { userId, conversationId, isTyping }] };
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
  reset: () => set(initialState),
}));
