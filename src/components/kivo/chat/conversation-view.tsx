'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Send, Smile, MoreHorizontal, ArrowLeft, Check, CheckCheck, Edit3, Trash2, X, CornerDownRight, UserX, Forward, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import Image from 'next/image';
import type { Message } from '@/types';

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

const EMOJI_LIST = ['😊','😂','❤️','👍','🎉','🔥','💯','✨','🙌','😍','🤔','😅','👋','🥳','😎','🤝','💪','🫡','💕','🥰','😀','🥺','😢','😭'];

export function ConversationView() {
  const { activeConversationId, conversations, messages, setMessages, addMessage, updateMessage, typingUsers, setActiveConversationId, updateConversation } = useChatStore();
  const { user, token } = useAuthStore();
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const otherUser = activeConv?.otherUser;
  const isTyping = typingUsers.some((t) => t.conversationId === activeConversationId && t.isTyping && t.userId !== user?.id);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversationId || !token) return;
    const isDemo = token.startsWith('demo-');
    if (isDemo) return;
    let cancelled = false;
    (async () => {
      try {
        const msgs = await api<Message[]>('/conversations/' + activeConversationId + '/messages', { token });
        if (!cancelled) setMessages(msgs);
      } catch (err: any) { if (!cancelled) toast.error(err.message); }
    })();
    return () => { cancelled = true; };
  }, [activeConversationId, token]);

  // Scroll to bottom
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [messages, isTyping]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || !activeConversationId) return;
    const socket = getSocket();
    socket.emit('message:send', {
      conversationId: activeConversationId,
      content: input.trim(),
      type: 'text',
      replyToId: replyTo?.id || null,
    });
    setInput('');
    setReplyTo(null);
    setShowEmoji(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    // Stop typing
    socket.emit('typing:stop', { conversationId: activeConversationId });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }, [input, activeConversationId, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingId) { saveEdit(); } else { sendMessage(); }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    // Typing indicator
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

  const filteredMessages = searchMsg
    ? messages.filter((m) => m.content.toLowerCase().includes(searchMsg.toLowerCase()))
    : messages;

  if (!activeConversationId || !otherUser) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden">
            <Image
              src="/logo.png"
              alt="KIVO"
              width={64}
              height={64}
              quality={100}
              sizes="64px"
              className="object-contain p-1.5 opacity-30"
            />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Select a conversation</h3>
          <p className="mt-1 text-xs text-muted-foreground/60">Choose a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Chat Header */}
      <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3 bg-surface-1">
        <button
          onClick={() => setActiveConversationId(null)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative">
          <Avatar className="h-9 w-9">
            <AvatarImage src={otherUser.avatar || undefined} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(otherUser.displayName || '?')}</AvatarFallback>
          </Avatar>
          {otherUser.online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-online" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{otherUser.displayName || otherUser.username}</p>
          <p className="text-[11px] text-muted-foreground">
            {isTyping ? (
              <span className="text-typing">typing...</span>
            ) : otherUser.online ? (
              <span className="text-online">Online</span>
            ) : 'Offline'}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-all">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setShowSearch(!showSearch)} className="text-xs cursor-pointer">
              <Search className="mr-2 h-3.5 w-3.5" /> Search Messages
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { blockUser(); }} className="text-xs cursor-pointer text-destructive focus:text-destructive">
              <UserX className="mr-2 h-3.5 w-3.5" /> Block User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Message search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30 bg-surface-1"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                autoFocus
                value={searchMsg}
                onChange={(e) => setSearchMsg(e.target.value)}
                placeholder="Search in conversation..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
              />
              <button onClick={() => { setShowSearch(false); setSearchMsg(''); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
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
            const showAvatar = !isMine && (i === 0 || filteredMessages[i - 1].senderId !== msg.senderId);
            const isLast = i === filteredMessages.length - 1 || filteredMessages[i + 1]?.senderId !== msg.senderId;
            const repliedMsg = msg.replyTo;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`mb-1 flex ${isMine ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
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
                      <span className="truncate">{repliedMsg.content}</span>
                    </div>
                  )}

                  <div className="group relative flex items-end gap-1.5">
                    <div
                      className={`relative rounded-2xl px-3 py-1.5 ${
                        isMine
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-surface-2 text-foreground rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                      {msg.edited && !msg.deleted && (
                        <span className="text-[9px] opacity-50">edited</span>
                      )}
                    </div>

                    {/* Message actions (hover) */}
                    {isMine && !msg.deleted && isLast && (
                      <div className="absolute -top-3 right-0 hidden gap-0.5 group-hover:flex">
                        <button
                          onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                          className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-surface-3 transition-colors"
                        >
                          <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => forwardMessage(msg)} className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-surface-3 transition-colors">
                          <Forward className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => startEdit(msg)} className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-surface-3 transition-colors">
                          <Edit3 className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteMessage(msg.id)} className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {!isMine && !msg.deleted && isLast && (
                      <div className="absolute -top-3 left-0 hidden gap-0.5 group-hover:flex">
                        <button
                          onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                          className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-surface-3 transition-colors"
                        >
                          <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => forwardMessage(msg)} className="rounded-md bg-surface-2 p-1 shadow-sm hover:bg-surface-3 transition-colors">
                          <Forward className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status & time */}
                  {isLast && (
                    <div className={`mt-0.5 flex items-center gap-1 ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
                      <span className="text-[10px] text-muted-foreground/50">
                        {format(new Date(msg.createdAt), 'h:mm a')}
                      </span>
                      {isMine && (
                        msg.status === 'read' ? (
                          <CheckCheck className="h-3 w-3 text-primary" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="h-3 w-3 text-muted-foreground/40" />
                        ) : (
                          <Check className="h-3 w-3 text-muted-foreground/40" />
                        )
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-2 flex items-center gap-2"
              >
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                      style={{
                        animation: `kivo-typing-dot 1.4s ease-in-out infinite ${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Reply preview bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 bg-surface-1"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="w-1 h-8 rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-primary">Reply to {replyTo.senderId === user?.id ? 'yourself' : otherUser?.displayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forward preview bar */}
      <AnimatePresence>
        {forwardMsg && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 bg-surface-1"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Forward className="h-3.5 w-3.5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-primary">Forward message</p>
                <p className="text-[11px] text-muted-foreground truncate">{forwardMsg.content}</p>
              </div>
              <button onClick={() => setForwardMsg(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editing indicator */}
      <AnimatePresence>
        {editingId && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 bg-surface-1"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <Edit3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">Editing message</span>
              <div className="flex-1" />
              <button onClick={() => { setEditingId(null); setEditText(''); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30 bg-surface-1"
          >
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
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

      {/* Input */}
      <div className="border-t border-border/30 bg-surface-1 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              showEmoji ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            <Smile className="h-4.5 w-4.5" />
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={editingId ? editText : input}
              onChange={editingId ? (e) => setEditText(e.target.value) : handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none rounded-xl bg-surface-2 border border-border/30 px-4 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 max-h-[120px]"
            />
          </div>
          <button
            onClick={editingId ? saveEdit : forwardMsg ? sendForward : sendMessage}
            disabled={editingId ? !editText.trim() : forwardMsg ? false : !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40 kivo-glow"
          >
            {editingId ? <Check className="h-4 w-4" /> : forwardMsg ? <Forward className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
