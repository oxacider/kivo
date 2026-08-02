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
  emailVerified: boolean;
  showOnline: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'displayName' | 'avatar'>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'voice' | 'system';
  /** KIVO lifecycle state: sending → sent → delivered → seen (or failed/queued/deleted). */
  status: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed' | 'queued' | 'deleted';
  /** ISO timestamp when the message reached the KIVO server. */
  sentAt?: string;
  /** ISO timestamp when the receiver's device received & synced the message. */
  deliveredAt?: string | null;
  /** ISO timestamp when the receiver opened the chat and saw the message. */
  seenAt?: string | null;
  replyToId: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  replyTo?: Message | null;
  reactions?: Reaction[];
  attachments?: MediaAttachment[];
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
  /** Firestore-only: participant KIVO user ids (Phase 2) */
  participants?: string[];
  /** Firestore-only: kivoUserId → last-read ISO timestamp (Phase 2) */
  readReceipts?: Record<string, string>;
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
  | 'verify-email'
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

export interface MediaAttachment {
  id: string;
  messageId?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  url: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt?: string;
  publicId?: string;
}

export interface PendingImage {
  file: File;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  name: string;
  size: number;
}

export interface QueuedMessage {
  tempId: string;
  conversationId: string;
  content: string;
  type: string;
  replyToId: string | null;
  attachmentId?: string;
  senderId: string;
  sender?: User;
  replyTo?: Message | null;
  attachments?: MediaAttachment[];
  createdAt: string;
  updatedAt: string;
}
