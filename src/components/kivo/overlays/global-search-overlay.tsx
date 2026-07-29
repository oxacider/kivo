'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MessageSquare, Users, User, Loader2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Conversation, User as UserType } from '@/types';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

type SearchCategory = 'all' | 'users' | 'messages';

const categories: { id: SearchCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: <Search size={14} /> },
  { id: 'users', label: 'Users', icon: <Users size={14} /> },
  { id: 'messages', label: 'Messages', icon: <MessageSquare size={14} /> },
];

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, y: -20, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.15 } },
};

export function GlobalSearchOverlay() {
  const { searchOpen, setSearchOpen } = useUIStore();
  const { conversations } = useChatStore();
  const { friends } = useFriendsStore();
  const { token } = useAuthStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [apiResults, setApiResults] = useState<UserType[]>([]);
  const [searching, setSearching] = useState(false);

  const isDemo = token?.startsWith('demo-');

  const filteredConversations = (() => {
    if (!query.trim()) return conversations.slice(0, 5);
    const q = query.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.lastMessage?.content?.toLowerCase().includes(q) ?? false)
    );
  })();

  const filteredFriends = (() => {
    if (!query.trim()) return friends.slice(0, 5);
    const q = query.toLowerCase();
    return friends.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
    );
  })();

  const showConversations = category === 'all' || category === 'messages';
  const showFriends = category === 'all' || category === 'users';
  const showApiResults = (category === 'all' || category === 'users') && query.trim().length > 0;

  useEffect(() => {
    if (!searchOpen || !query.trim() || isDemo) {
      setApiResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await api.searchUsers(query);
        setApiResults(results);
      } catch {
        setApiResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, searchOpen, isDemo, category]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(false);
      }
    },
    [setSearchOpen]
  );

  useEffect(() => {
    if (searchOpen) {
      document.addEventListener('keydown', handleKeyDown);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchOpen, handleKeyDown]);

  if (!searchOpen) return null;

  const hasResults =
    (showConversations && filteredConversations.length > 0) ||
    (showFriends && filteredFriends.length > 0) ||
    (showApiResults && apiResults.length > 0);

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          key="search-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] overlay-backdrop"
          onClick={() => setSearchOpen(false)}
        >
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="mx-auto mt-[12vh] w-[92vw] max-w-lg rounded-2xl glass-panel overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <Search size={18} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations, friends, users..."
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none"
              />
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setQuery('')}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <X size={16} />
                </motion.button>
              )}
              <kbd className="hidden sm:inline-flex text-[10px] font-mono text-muted-foreground/50 border border-border/30 rounded-md px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-white/5">
              {categories.map((cat) => (
                <motion.button
                  key={cat.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    category === cat.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </motion.button>
              ))}
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {/* Loading */}
              {searching && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              )}

              {/* Empty State */}
              {!searching && !hasResults && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
                    <Search size={22} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {query.trim() ? 'No results found' : 'Start typing to search'}
                  </p>
                  {query.trim() && (
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Try different keywords
                    </p>
                  )}
                </div>
              )}

              {/* Conversations */}
              {!searching && showConversations && filteredConversations.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                    Messages
                  </p>
                  {filteredConversations.map((conv) => (
                    <motion.button
                      key={conv.id}
                      whileHover={{ x: 4 }}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
                    >
                      <Avatar className="h-9 w-9 rounded-xl">
                        <AvatarImage src={conv.avatar} alt={conv.name} />
                        <AvatarFallback className="rounded-xl bg-surface-2 text-xs font-bold">
                          {getInitials(conv.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {conv.name}
                        </p>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.lastMessage.content}
                          </p>
                        )}
                      </div>
                      <MessageSquare size={14} className="text-muted-foreground/50 shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Friends */}
              {!searching && showFriends && filteredFriends.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                    Friends
                  </p>
                  {filteredFriends.map((friend) => (
                    <motion.button
                      key={friend.id}
                      whileHover={{ x: 4 }}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
                    >
                      <div className="relative">
                        <Avatar className="h-9 w-9 rounded-xl">
                          <AvatarImage src={friend.avatar} alt={friend.displayName} />
                          <AvatarFallback className="rounded-xl bg-surface-2 text-xs font-bold">
                            {getInitials(friend.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        {friend.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-online border-2 border-surface-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {friend.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{friend.username}
                        </p>
                      </div>
                      <User size={14} className="text-muted-foreground/50 shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}

              {/* API User Results */}
              {!searching && showApiResults && apiResults.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                    Users
                  </p>
                  {apiResults.map((result) => (
                    <motion.button
                      key={result.id}
                      whileHover={{ x: 4 }}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-surface-hover transition-colors text-left"
                    >
                      <Avatar className="h-9 w-9 rounded-xl">
                        <AvatarImage src={result.avatar} alt={result.displayName} />
                        <AvatarFallback className="rounded-xl bg-surface-2 text-xs font-bold">
                          {getInitials(result.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {result.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{result.username}
                        </p>
                      </div>
                      <User size={14} className="text-muted-foreground/50 shrink-0" />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
