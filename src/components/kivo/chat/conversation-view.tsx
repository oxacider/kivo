'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Send, Smile, MoreHorizontal, ArrowLeft, Check, CheckCheck,
  Edit3, Trash2, X, CornerDownRight, UserX, Forward, Search,
  Copy, RotateCcw, ImageIcon, Paperclip, Mic, Clock,
  AlertCircle, Sparkles, Loader2, Upload
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import type { Message, Reaction, PendingImage, MediaAttachment } from '@/types';

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

const EMOJI_LIST = ['😊','😂','❤️','👍','🎉','🔥','💯','✨','🙌','😍','🤔','😅','👋','🥳','😎','🤝','💪','🫡','💕','🥰','😀','🥺','😢','😭'];

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

function formatLastSeen(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return 'recently';
  }
}

// --- Message Status Icon ---
function MessageStatus({ status, className = '' }: { status: Message['status']; className?: string }) {
  if (status === 'failed') {
    return <AlertCircle className={`h-3.5 w-3.5 text-destructive ${className}`} />;
  }
  if (status === 'sending') {
    return <div className={`flex items-center gap-0.5 ${className}`}>
      {[0, 1, 2].map(i => (
        <span key={i} className="h-1 w-1 rounded-full bg-current opacity-40"
          style={{ animation: 'kivo-status-pulse 1s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>;
  }
  if (status === 'read') {
    return <CheckCheck className={`h-3.5 w-3.5 text-primary ${className}`} />;
  }
  if (status === 'delivered') {
    return <CheckCheck className={`h-3.5 w-3.5 text-muted-foreground/50 ${className}`} />;
  }
  return <Check className={`h-3 w-3 text-muted-foreground/40 ${className}`} />;
}

// --- Reaction Badge on message ---
function MessageReactions({
  reactions,
  myUserId,
  onReact,
  onLongPress,
}: {
  reactions: Reaction[];
  myUserId: string;
  onReact: (emoji: string) => void;
  onLongPress?: () => void;
}) {
  if (!reactions || reactions.length === 0) return null;

  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {Object.entries(grouped).map(([emoji, rs]) => {
        const isMine = rs.some(r => r.userId === myUserId);
        const count = rs.length;
        const names = rs.map(r => r.user?.displayName).filter(Boolean).join(', ');
        return (
          <motion.button
            key={emoji}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
            title={names}
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors ${
              isMine
                ? 'bg-primary/15 ring-1 ring-primary/30'
                : 'bg-surface-2 hover:bg-surface-hover'
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {count > 1 && <span className="text-[10px] font-medium text-muted-foreground">{count}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

// --- Quick Reaction Bar (shown on message hover/tap) ---
function QuickReactionBar({ onReact, onOpenPicker }: { onReact: (emoji: string) => void; onOpenPicker?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-0.5 rounded-full bg-popover px-1.5 py-1 shadow-lg border border-border/50"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <motion.button
          key={emoji}
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-hover transition-colors text-base"
        >
          {emoji}
        </motion.button>
      ))}
      {onOpenPicker && (
        <div className="w-px h-4 bg-border/50 mx-0.5" />
      )}
    </motion.div>
  );
}

// --- Profile Preview Popover ---
function ProfilePreview({ user, children }: { user: { displayName: string; username: string; avatar: string; bio: string; status: string; online: boolean; lastSeen: string; showOnline: boolean; showLastSeen: boolean }; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" side="bottom" align="start">
        <div className="flex flex-col items-center gap-3 p-5">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user.avatar || undefined} />
            <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
              {getInitials(user.displayName || '?')}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h3 className="font-semibold text-sm">{user.displayName || user.username}</h3>
            <p className="text-xs text-muted-foreground">@{user.username}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {user.showOnline !== false && user.online ? (
              <><span className="h-2 w-2 rounded-full bg-online" /> Online</>
            ) : user.showLastSeen !== false ? (
              <><Clock className="h-3 w-3" /> Last seen {formatLastSeen(user.lastSeen)}</>
            ) : null}
          </div>
          {user.bio && (
            <p className="text-xs text-muted-foreground text-center leading-relaxed px-2">{user.bio}</p>
          )}
          {user.status && user.status !== 'Hey there! I\'m using KIVO' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-surface-2 rounded-lg px-3 py-1.5">
              <Sparkles className="h-3 w-3" />
              <span className="truncate">{user.status}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ===================== MAIN COMPONENT =====================

// --- Image Message Bubble ---
function ImageMessageBubble({ attachment, isMine, isSending }: { attachment: MediaAttachment; isMine: boolean; isSending: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const isLandscape = (attachment.width && attachment.height) ? attachment.width > attachment.height : true;

  return (
    <>
      <div
        className={`relative overflow-hidden ${isLandscape ? 'max-w-[280px] sm:max-w-[320px]' : 'max-w-[200px]'} ${isSending ? 'animate-kivo-media-shimmer' : 'animate-kivo-image-enter'}`}
        onClick={() => !isSending && setShowFull(true)}
      >
        {!loaded && (
          <div className="absolute inset-0 bg-surface-2 flex items-center justify-center min-h-[120px]">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        )}
        <img
          src={attachment.url}
          alt={attachment.name || 'Image'}
          className={`max-w-full rounded-xl object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={isLandscape ? { maxHeight: '280px', width: '100%' } : { maxHeight: '300px' }}
          onLoad={() => setLoaded(true)}
        />
        {isSending && (
          <div className="absolute inset-0 bg-background/30 flex items-center justify-center rounded-xl">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        )}
      </div>
      {/* Lightbox overlay */}
      <AnimatePresence>
        {showFull && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setShowFull(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={attachment.url}
                alt={attachment.name || 'Image'}
                className="max-w-full max-h-[85vh] rounded-xl object-contain"
              />
              <button
                onClick={() => setShowFull(false)}
                className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-popover text-foreground flex items-center justify-center shadow-lg border border-border/50 hover:bg-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// --- Upload Progress Bar ---
function UploadProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}

export function ConversationView() {
  const { activeConversationId, conversations, messages, setMessages, prependMessages, addMessage, updateMessage, removeMessage, typingUsers, setActiveConversationId, updateConversation, addReaction, removeReaction, setMessageStatus, hasMoreMessages, isLoadingMoreMessages, setLoadingMoreMessages, setHasMoreMessages } = useChatStore();
  const { user, token } = useAuthStore();
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [quickReactMsgId, setQuickReactMsgId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wasAtBottom, setWasAtBottom] = useState(true);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const otherUser = activeConv?.otherUser;
  const activeTypingUsers = useMemo(
    () => typingUsers.filter(t => t.conversationId === activeConversationId && t.isTyping && t.userId !== user?.id),
    [typingUsers, activeConversationId, user?.id]
  );
  const isTyping = activeTypingUsers.length > 0;
  const typingDisplay = activeTypingUsers.length === 1
    ? activeTypingUsers[0]
    : null;

  // Track scroll position + trigger pagination
  const loadMoreTriggeredRef = useRef(false);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setWasAtBottom(atBottom);
    // Trigger load-more when near top
    if (el.scrollTop < 120 && hasMoreMessages && !isLoadingMoreMessages && !loadMoreTriggeredRef.current) {
      loadMoreTriggeredRef.current = true;
    }
  }, [hasMoreMessages, isLoadingMoreMessages]);

  // Load older messages when near top
  const [loadMoreTick, setLoadMoreTick] = useState(0);
  useEffect(() => {
    if (!loadMoreTriggeredRef.current) return;
    setLoadMoreTick((t) => t + 1);
  }, [hasMoreMessages, isLoadingMoreMessages]);

  useEffect(() => {
    if (!activeConversationId || !token || !hasMoreMessages || isLoadingMoreMessages) return;
    const convId = activeConversationId;
    const tok = token;
    const firstMsg = useChatStore.getState().messages[0];
    if (!firstMsg || firstMsg.id.startsWith('temp-')) return;
    const prevHeight = scrollRef.current?.scrollHeight ?? 0;
    let cancelled = false;
    setLoadingMoreMessages(true);
    loadMoreTriggeredRef.current = false;
    (async () => {
      try {
        const result = await api<{ messages: Message[]; hasMore: boolean }>(
          '/conversations/' + convId + '/messages?before=' + encodeURIComponent(firstMsg.createdAt),
          { token: tok }
        );
        if (!cancelled) {
          prependMessages(result.messages);
          setHasMoreMessages(result.hasMore);
          requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight - prevHeight;
          });
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoadingMoreMessages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadMoreTick, activeConversationId, token]);

  // Socket listeners for delivered, read, reactions, and optimistic message replacement
  useEffect(() => {
    if (!token || token.startsWith('demo-')) return;
    const socket = getSocket();

    const onDelivered = (data: { messageId: string; conversationId: string; status: string }) => {
      if (data.conversationId !== activeConversationId) return;
      updateMessage(data.messageId, { status: 'delivered' });
    };

    const onRead = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId !== activeConversationId) return;
      // Batch: mark all sent/delivered/sending messages as read in one update
      const msgs = useChatStore.getState().messages;
      const updates = msgs
        .filter(m => m.senderId === user?.id && (m.status === 'sent' || m.status === 'delivered' || m.status === 'sending'))
        .map(m => ({ id: m.id, status: 'read' as const }));
      if (updates.length > 0) {
        useChatStore.setState((state) => ({
          messages: state.messages.map((m) => {
            const u = updates.find((up) => up.id === m.id);
            return u ? { ...m, status: u.status } : m;
          }),
        }));
      }
    };

    const onNew = (msg: any) => {
      // Replace optimistic sending message with the real server message
      const msgs = useChatStore.getState().messages;
      // For text messages: match by content
      const textMatch = msgs.find(m => m.status === 'sending' && m.conversationId === msg.conversationId && m.content === msg.content && m.senderId === msg.senderId && !m.attachments?.length);
      // For image messages: match by type + sender + conversation + no real id
      const imageMatch = msgs.find(m => m.status === 'sending' && m.conversationId === msg.conversationId && m.type === 'image' && m.senderId === msg.senderId && m.id.startsWith('temp-'));
      const sending = textMatch || imageMatch;
      if (sending && sending.id.startsWith('temp-')) {
        // Remove the temp message, the real one will be added by the store's addMessage
        useChatStore.getState().removeMessage(sending.id);
      }
    };

    const onReaction = (data: any) => {
      if (data.removed) {
        removeReaction(data.messageId, data.userId, data.emoji);
      } else {
        addReaction(data.messageId, data);
      }
    };

    socket.on('message:delivered', onDelivered);
    socket.on('message:read', onRead);
    socket.on('message:new', onNew);
    socket.on('reaction:update', onReaction);

    return () => {
      socket.off('message:delivered', onDelivered);
      socket.off('message:read', onRead);
      socket.off('message:new', onNew);
      socket.off('reaction:update', onReaction);
    };
  }, [token, activeConversationId, user?.id, updateMessage, removeMessage, addReaction, removeReaction]);

  // Load latest 30 messages when conversation changes
  useEffect(() => {
    if (!activeConversationId || !token) return;
    const isDemo = token.startsWith('demo-');
    if (isDemo) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api<{ messages: Message[]; hasMore: boolean }>(
          '/conversations/' + activeConversationId + '/messages',
          { token }
        );
        if (!cancelled) {
          setMessages(result.messages);
          setHasMoreMessages(result.hasMore);
        }
      } catch (err: any) { if (!cancelled) toast.error(err.message); }
    })();
    return () => { cancelled = true; };
  }, [activeConversationId, token]);

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  }, []);

  // Scroll to bottom on new messages (only if already at bottom)
  useEffect(() => {
    if (wasAtBottom) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [messages, isTyping, wasAtBottom]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || !activeConversationId) return;
    const socket = getSocket();
    const content = input.trim();
    const replyId = replyTo?.id || null;

    // Optimistic local message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: user?.id || '',
      content,
      type: 'text',
      status: 'sending',
      replyToId: replyId,
      edited: false,
      deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: user ? { id: user.id, email: user.email, displayName: user.displayName, username: user.username, avatar: user.avatar, bio: user.bio, status: user.status, online: user.online, lastSeen: user.lastSeen, theme: user.theme, emailVerified: user.emailVerified, showOnline: user.showOnline, showLastSeen: user.showLastSeen, showReadReceipts: user.showReadReceipts, createdAt: user.createdAt, updatedAt: user.updatedAt } : undefined,
      replyTo: replyTo ? { id: replyTo.id, conversationId: replyTo.conversationId, senderId: replyTo.senderId, content: replyTo.content, type: replyTo.type, status: replyTo.status, replyToId: replyTo.replyToId, edited: replyTo.edited, deleted: replyTo.deleted, createdAt: replyTo.createdAt, updatedAt: replyTo.updatedAt } : null,
    };
    addMessage(optimisticMsg);

    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Stop typing
    socket.emit('typing:stop', { conversationId: activeConversationId });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    // Emit to server
    socket.emit('message:send', {
      conversationId: activeConversationId,
      content,
      type: 'text',
      replyToId: replyId,
    });
  }, [input, activeConversationId, replyTo, user, addMessage]);

  // --- Image selection handler ---
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only images are supported');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        setPendingImage({
          file,
          dataUrl: reader.result as string,
          width: img.naturalWidth,
          height: img.naturalHeight,
          mimeType: file.type,
          name: file.name,
          size: file.size,
        });
        inputRef.current?.focus();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, []);

  // --- Send image message with upload ---
  const sendImageMessage = useCallback(() => {
    if (!pendingImage || !activeConversationId || !token || isUploading) return;
    setIsUploading(true);
    setUploadProgress(0);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const caption = input.trim();
    const tempAttachment: MediaAttachment = {
      id: `temp-att-${Date.now()}`,
      type: 'image',
      url: pendingImage.dataUrl,
      name: pendingImage.name,
      size: pendingImage.size,
      mimeType: pendingImage.mimeType,
      width: pendingImage.width,
      height: pendingImage.height,
    };

    // Optimistic message with local preview
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: user?.id || '',
      content: caption,
      type: 'image',
      status: 'sending',
      replyToId: replyTo?.id || null,
      edited: false,
      deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: [tempAttachment],
      sender: user ? { id: user.id, email: user.email, displayName: user.displayName, username: user.username, avatar: user.avatar, bio: user.bio, status: user.status, online: user.online, lastSeen: user.lastSeen, theme: user.theme, emailVerified: user.emailVerified, showOnline: user.showOnline, showLastSeen: user.showLastSeen, showReadReceipts: user.showReadReceipts, createdAt: user.createdAt, updatedAt: user.updatedAt } : undefined,
    };
    addMessage(optimisticMsg);

    // Clear UI state
    setInput('');
    setPendingImage(null);
    setReplyTo(null);
    setShowEmoji(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Upload using XMLHttpRequest for progress tracking
    const formData = new FormData();
    formData.append('file', pendingImage.file);
    formData.append('width', String(pendingImage.width));
    formData.append('height', String(pendingImage.height));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.data?.id) {
            // Send message via socket with attachment
            const socket = getSocket();
            socket.emit('message:send', {
              conversationId: activeConversationId,
              content: caption,
              type: 'image',
              replyToId: optimisticMsg.replyToId,
              attachmentId: res.data.id,
            });
            // Update optimistic message with real attachment
            updateMessage(tempId, {
              attachments: [{
                id: res.data.id,
                type: 'image',
                url: pendingImage.dataUrl,
                name: pendingImage.name,
                size: pendingImage.size,
                mimeType: pendingImage.mimeType,
                width: pendingImage.width,
                height: pendingImage.height,
              }],
            });
          } else {
            setMessageStatus(tempId, 'failed');
            toast.error(res.error || 'Upload failed');
          }
        } catch {
          setMessageStatus(tempId, 'failed');
          toast.error('Upload failed');
        }
      } else {
        setMessageStatus(tempId, 'failed');
        toast.error('Upload failed');
      }
      setIsUploading(false);
      setUploadProgress(0);
    };

    xhr.onerror = () => {
      setMessageStatus(tempId, 'failed');
      toast.error('Network error during upload');
      setIsUploading(false);
      setUploadProgress(0);
    };

    xhr.send(formData);
  }, [pendingImage, activeConversationId, token, user, input, replyTo, isUploading, addMessage, updateMessage, setMessageStatus]);

  const handleSend = useCallback(() => {
    if (pendingImage) {
      sendImageMessage();
    } else {
      sendMessage();
    }
  }, [pendingImage, sendImageMessage, sendMessage]);

  const retryMessage = useCallback((msg: Message) => {
    if (!activeConversationId || msg.status !== 'failed') return;
    const socket = getSocket();
    // Update locally to 'sending'
    updateMessage(msg.id, { status: 'sending' });
    socket.emit('message:send', {
      conversationId: activeConversationId,
      content: msg.content,
      type: 'text',
      replyToId: msg.replyToId,
    });
  }, [activeConversationId, updateMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingId) { saveEdit(); } else { handleSend(); }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (activeConversationId) {
      const socket = getSocket();
      socket.emit('typing:start', { conversationId: activeConversationId });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: activeConversationId });
      }, 2000);
    }
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.content);
    setReplyTo(null);
    setQuickReactMsgId(null);
    inputRef.current?.focus();
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim() || !activeConversationId) return;
    try {
      const updated = await api<Message>('/conversations/' + activeConversationId + '/messages', {
        token, method: 'PUT', body: { messageId: editingId, content: editText.trim() },
      });
      updateMessage(editingId, updated);
      setEditingId(null);
      setEditText('');
    } catch (err: any) { toast.error(err.message); }
  };

  const deleteMessage = async (msgId: string) => {
    if (token?.startsWith('demo-')) { toast.info('Demo mode'); return; }
    try {
      await api('/messages/' + msgId, { token, method: 'DELETE' });
      updateMessage(msgId, { content: 'This message was deleted', deleted: true } as Partial<Message>);
    } catch (err: any) { toast.error(err.message); }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Failed to copy')
    );
  };

  const blockUser = async () => {
    if (!otherUser) return;
    if (token?.startsWith('demo-')) { toast.info('Demo mode'); return; }
    try {
      await api('/blocks/block', { token, body: { userId: otherUser.id } });
      toast.success(`${otherUser.displayName} has been blocked`);
      setActiveConversationId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const forwardMessage = (msg: Message) => {
    setForwardMsg(msg);
    setReplyTo(null);
    setQuickReactMsgId(null);
    inputRef.current?.focus();
  };

  const sendForward = useCallback(() => {
    if (!forwardMsg?.content || !activeConversationId) return;
    const socket = getSocket();
    socket.emit('message:send', {
      conversationId: activeConversationId,
      content: forwardMsg.content,
      type: 'text',
      replyToId: null,
    });
    setForwardMsg(null);
  }, [forwardMsg, activeConversationId]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    const socket = getSocket();
    socket.emit('reaction:add', { messageId, emoji });
    setQuickReactMsgId(null);
  }, []);

  const filteredMessages = searchMsg
    ? messages.filter((m) => m.content.toLowerCase().includes(searchMsg.toLowerCase()))
    : messages;

  if (!activeConversationId || !otherUser) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden">
            <img src="/logo.png" alt="KIVO" className="h-full w-full object-contain p-1.5 opacity-30" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Select a conversation</h3>
          <p className="mt-1 text-xs text-muted-foreground/60">Choose a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ========== CHAT HEADER ========== */}
      <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3 bg-surface-1">
        <button
          onClick={() => { setActiveConversationId(null); setQuickReactMsgId(null); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <ProfilePreview user={otherUser}>
          <button className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={otherUser.avatar || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(otherUser.displayName || '?')}</AvatarFallback>
              </Avatar>
              {otherUser.showOnline !== false && otherUser.online && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-online" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{otherUser.displayName || otherUser.username}</p>
              <p className="text-[11px] text-muted-foreground">
                {isTyping && typingDisplay ? (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-typing font-medium"
                  >
                    {typingDisplay.user?.displayName || 'Someone'} is typing
                  </motion.span>
                ) : otherUser.showOnline !== false && otherUser.online ? (
                  <span className="text-online">Online</span>
                ) : otherUser.showLastSeen !== false ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last seen {formatLastSeen(otherUser.lastSeen)}
                  </span>
                ) : (
                  'Offline'
                )}
              </p>
            </div>
          </button>
        </ProfilePreview>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => { setShowSearch(!showSearch); setQuickReactMsgId(null); }} className="text-xs cursor-pointer">
              <Search className="mr-2 h-3.5 w-3.5" /> Search Messages
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { blockUser(); setQuickReactMsgId(null); }} className="text-xs cursor-pointer text-destructive focus:text-destructive">
              <UserX className="mr-2 h-3.5 w-3.5" /> Block User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ========== MESSAGE SEARCH BAR ========== */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border/30 bg-surface-1">
            <div className="flex items-center gap-2 px-4 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
              <input autoFocus value={searchMsg} onChange={(e) => setSearchMsg(e.target.value)} placeholder="Search in conversation..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40" />
              <button onClick={() => { setShowSearch(false); setSearchMsg(''); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== MESSAGES AREA ========== */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {/* Loading older messages indicator */}
          {isLoadingMoreMessages && (
            <div className="mb-4 flex items-center justify-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Loading older messages...</span>
            </div>
          )}

          {/* Start of chat indicator */}
          {!hasMoreMessages && messages.length > 0 && (
            <div className="mb-4 flex items-center justify-center">
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[10px] text-muted-foreground/60">
                Start of conversation
              </span>
            </div>
          )}

          {/* Date divider */}
          {messages.length > 0 && (
            <div className="mb-4 flex items-center justify-center">
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[10px] text-muted-foreground">
                {format(new Date(messages[0].createdAt), 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            const isMine = msg.senderId === user?.id;
            const showAvatar = !isMine && (i === 0 || filteredMessages[i - 1]?.senderId !== msg.senderId);
            const isLast = i === filteredMessages.length - 1 || filteredMessages[i + 1]?.senderId !== msg.senderId;
            const isFailed = msg.status === 'failed';
            const isSending = msg.status === 'sending';
            const repliedMsg = msg.replyTo;
            const showQuickReact = quickReactMsgId === msg.id;

            return (
              <motion.div
                key={msg.id}
                initial={isMine ? { opacity: 0, y: 12, scale: 0.95 } : { opacity: 0, x: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                transition={{ duration: isMine ? 0.35 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`mb-1 flex ${isMine ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'} ${isFailed ? 'animate-kivo-shake' : ''}`}
                onClick={() => setQuickReactMsgId(showQuickReact ? null : msg.id)}
              >
                {!isMine && (
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={msg.sender?.avatar || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getInitials(msg.sender?.displayName || '?')}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                )}
                <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
                  {/* Reply preview */}
                  {repliedMsg && (
                    <div className={`mb-0.5 ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] ${
                      isMine ? 'bg-primary/10 text-primary-foreground/70' : 'bg-surface-2 text-muted-foreground'
                    }`}>
                      <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate max-w-[180px]">{repliedMsg.deleted ? 'Message deleted' : repliedMsg.content}</span>
                    </div>
                  )}

                  <div className="group relative flex items-end gap-1.5">
                    {/* Image message */}
                    {msg.type === 'image' && msg.attachments && msg.attachments.length > 0 && !msg.deleted ? (
                      <div className="relative">
                        <div className={`rounded-2xl overflow-hidden ${isMine ? 'rounded-br-md' : 'rounded-bl-md'} ${isFailed ? 'border border-destructive/20' : ''}`}>
                          <ImageMessageBubble
                            attachment={msg.attachments[0]}
                            isMine={isMine}
                            isSending={isSending}
                          />
                          {/* Upload progress on optimistic image */}
                          {isSending && msg.id.startsWith('temp-') && (
                            <div className="px-3 pb-2 bg-inherit">
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <Upload className="h-3 w-3 animate-pulse" />
                                <span>Uploading...</span>
                              </div>
                              <UploadProgressBar progress={uploadProgress} />
                            </div>
                          )}
                          {msg.content && (
                            <div className={`px-3 pb-2 ${isMine ? 'text-primary-foreground' : ''}`}>
                              <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`relative rounded-2xl px-3 py-1.5 ${
                        isFailed
                          ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-br-md'
                          : isMine
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-surface-2 text-foreground rounded-bl-md'
                      }`}>
                        {msg.deleted ? (
                          <p className="text-sm italic opacity-50">This message was deleted</p>
                        ) : (
                          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                        )}
                        {msg.edited && !msg.deleted && (
                          <span className="text-[9px] opacity-50">edited</span>
                        )}
                      </div>
                    )}

                    {/* Message action buttons (hover) */}
                    {isLast && !msg.deleted && !isSending && (
                      <>
                        {isMine ? (
                          <div className="absolute -top-8 right-0 hidden group-hover:flex z-10">
                            <QuickReactionBar
                              onReact={(emoji) => handleReact(msg.id, emoji)}
                            />
                          </div>
                        ) : (
                          <div className="absolute -top-8 left-0 hidden group-hover:flex z-10">
                            <QuickReactionBar
                              onReact={(emoji) => handleReact(msg.id, emoji)}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Mobile quick actions (tap) */}
                    {showQuickReact && !msg.deleted && !isSending && (
                      <div className={`absolute -top-8 ${isMine ? 'right-0' : 'left-0'} flex z-10 md:hidden`}>
                        <AnimatePresence>
                          <QuickReactionBar onReact={(emoji) => handleReact(msg.id, emoji)} />
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Desktop action row (hover) */}
                    {isMine && !msg.deleted && isLast && (
                      <div className="absolute -bottom-3 right-0 hidden group-hover:flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); copyMessage(msg.content); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); setQuickReactMsgId(null); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); forwardMessage(msg); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <Forward className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(msg); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <Edit3 className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {!isMine && !msg.deleted && isLast && (
                      <div className="absolute -bottom-3 left-0 hidden group-hover:flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); copyMessage(msg.content); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setReplyTo(msg); inputRef.current?.focus(); setQuickReactMsgId(null); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); forwardMessage(msg); }} className="rounded-md bg-popover p-1 shadow-sm border border-border/50 hover:bg-surface-hover transition-colors">
                          <Forward className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Failed message retry */}
                  {isFailed && isLast && (
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() => retryMessage(msg)}
                        className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  )}

                  {/* Reactions display */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={isMine ? 'flex justify-end' : ''}>
                      <MessageReactions
                        reactions={msg.reactions}
                        myUserId={user?.id || ''}
                        onReact={(emoji) => handleReact(msg.id, emoji)}
                      />
                    </div>
                  )}

                  {/* Status & time */}
                  {isLast && (
                    <div className={`mt-0.5 flex items-center gap-1 ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
                      <span className="text-[10px] text-muted-foreground/50">
                        {format(new Date(msg.createdAt), 'h:mm a')}
                      </span>
                      {isMine && <MessageStatus status={msg.status} />}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* ========== PREMIUM TYPING INDICATOR ========== */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="mt-2 flex items-center gap-2.5"
              >
                {typingDisplay?.user?.avatar && (
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={typingDisplay.user.avatar || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{getInitials(typingDisplay.user.displayName || '?')}</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-[6px] w-[6px] rounded-full bg-muted-foreground/50"
                        style={{
                          animation: 'kivo-typing-dot 1.4s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground/60 font-medium">
                    {typingDisplay?.user?.displayName || 'Someone'} is typing
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ========== REPLY PREVIEW BAR ========== */}
      <AnimatePresence>
        {replyTo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30 bg-surface-1">
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="w-1 h-8 rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-primary">Reply to {replyTo.senderId === user?.id ? 'yourself' : otherUser?.displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{replyTo.deleted ? 'Message deleted' : replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== FORWARD PREVIEW BAR ========== */}
      <AnimatePresence>
        {forwardMsg && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30 bg-surface-1">
            <div className="flex items-center gap-2 px-4 py-2">
              <Forward className="h-3.5 w-3.5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-primary">Forward message</p>
                <p className="text-[11px] text-muted-foreground truncate">{forwardMsg.content}</p>
              </div>
              <button onClick={() => setForwardMsg(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== EDITING INDICATOR ========== */}
      <AnimatePresence>
        {editingId && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30 bg-surface-1">
            <div className="flex items-center gap-2 px-4 py-2">
              <Edit3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Editing message</span>
              <div className="flex-1" />
              <button onClick={() => { setEditingId(null); setEditText(''); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== IMAGE PREVIEW BAR ========== */}
      <AnimatePresence>
        {pendingImage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 bg-surface-1 animate-kivo-preview-slide"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <img
                  src={pendingImage.dataUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{pendingImage.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(pendingImage.size / 1024).toFixed(1)} KB · {pendingImage.width}×{pendingImage.height}
                </p>
              </div>
              <button
                onClick={() => setPendingImage(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== EMOJI PICKER ========== */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30 bg-surface-1">
            <div className="flex flex-wrap gap-1.5 px-4 py-3 max-h-36 overflow-y-auto">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { setInput((p) => p + emoji); inputRef.current?.focus(); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-hover text-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== INPUT BAR ========== */}
      <div className="border-t border-border/30 bg-surface-1 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Attachment button - visible on all screens */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              pendingImage
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            } disabled:opacity-40`}
            title="Attach image"
          >
            <ImageIcon className="h-[18px] w-[18px]" />
          </button>

          {/* File/Voice buttons (desktop only, architecture prep) */}
          <div className="hidden sm:flex items-center gap-1">
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors" title="Attach file">
              <Paperclip className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors" title="Voice message">
              <Mic className="h-[18px] w-[18px]" />
            </button>
          </div>

          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              showEmoji ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            <Smile className="h-[18px] w-[18px]" />
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={editingId ? editText : input}
              onChange={editingId ? (e) => setEditText(e.target.value) : handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingImage ? 'Add a caption...' : 'Type a message...'}
              rows={1}
              className="w-full resize-none rounded-xl bg-surface-2 border border-border/30 px-4 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 max-h-[120px]"
            />
          </div>
          <button
            onClick={editingId ? saveEdit : forwardMsg ? sendForward : handleSend}
            disabled={isUploading || (editingId ? !editText.trim() : forwardMsg ? false : (!input.trim() && !pendingImage))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40 kivo-glow"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Check className="h-4 w-4" /> : forwardMsg ? <Forward className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
