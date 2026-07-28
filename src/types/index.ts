export interface User {
  id: string;
  email: string;
  displayName: string;
  username: string;
  avatar: string;
  bio: string;
  status: string;
  online: boolean;
  lastSeen: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'system';
  status: 'sent' | 'delivered' | 'read' | 'deleted';
  replyToId: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  replyTo?: Message | null;
}

export interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: Message;
  otherUser?: User;
  unreadCount?: number;
}

export interface Friendship {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
}

export type ViewType =
  | 'splash'
  | 'welcome'
  | 'signin'
  | 'signup'
  | 'forgot-password'
  | 'chat'
  | 'settings'
  | 'profile'
  | 'friends'
  | 'edit-profile';

export interface TypingUser {
  userId: string;
  isTyping: boolean;
  conversationId: string;
}

export interface OnlineUser {
  userId: string;
  socketId: string;
}
