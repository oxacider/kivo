'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  UserPlus,
  Check,
  X,
  UserMinus,
  MoreVertical,
  MessageSquare,
  Shield,
  Users,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useChatStore } from '@/stores/chat-store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User as UserType, FriendRequest } from '@/types';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

type FriendTab = 'all' | 'online' | 'requests' | 'add';

const friendTabs: { id: FriendTab; label: string }[] = [
  { id: 'all', label: 'All Friends' },
  { id: 'online', label: 'Online' },
  { id: 'requests', label: 'Requests' },
  { id: 'add', label: 'Add Friend' },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
};

export function FriendsPage() {
  const { user, token } = useAuthStore();
  const { friends, requests, removeFriend } = useFriendsStore();
  const { conversations } = useChatStore();

  const [activeTab, setActiveTab] = useState<FriendTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDemo = token?.startsWith('demo-');

  const onlineFriends = useMemo(
    () => friends.filter((f) => f.online),
    [friends]
  );

  const filteredFriends = useMemo(() => {
    const list = activeTab === 'online' ? onlineFriends : friends;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
    );
  }, [activeTab, friends, onlineFriends, searchQuery]);

  const incomingRequests = useMemo(
    () => requests.filter((r) => r.direction === 'incoming'),
    [requests]
  );

  const outgoingRequests = useMemo(
    () => requests.filter((r) => r.direction === 'outgoing'),
    [requests]
  );

  useEffect(() => {
    if (activeTab !== 'add' || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      if (isDemo) return;
      try {
        setSearching(true);
        const results = await api.searchUsers(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [activeTab, searchQuery, isDemo]);

  const handleRemoveFriend = (_friendId: string) => {
    toast.info('Coming soon');
  };

  const handleAcceptRequest = (_requestId: string) => {
    toast.info('Coming soon');
  };

  const handleDeclineRequest = (_requestId: string) => {
    toast.info('Coming soon');
  };

  const handleCancelRequest = (_requestId: string) => {
    toast.info('Coming soon');
  };

  const handleSendRequest = (_userId: string) => {
    toast.info('Coming soon');
  };

  const handleStartChat = (_friendId: string) => {
    toast.info('Coming soon');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-foreground">Friends</h1>
          <span className="text-sm font-medium text-muted-foreground bg-surface-2 px-2.5 py-0.5 rounded-full">
            {friends.length}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('add')}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Add Friend</span>
        </motion.button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 pb-3 overflow-x-auto scrollbar-none">
        {friendTabs.map((tab) => (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab(tab.id)}
            className={`relative shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-primary-foreground bg-primary'
                : 'text-muted-foreground bg-surface-2 hover:bg-surface-hover'
            }`}
          >
            {tab.label}
            {tab.id === 'requests' && requests.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                {requests.length}
              </span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-20 md:pb-4">
        <AnimatePresence mode="wait">
          {activeTab === 'all' && (
            <motion.div
              key="all"
              {...fadeUp}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-2"
            >
              {filteredFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                    <Users size={28} className="text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    No friends yet
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Add some friends to get started
                  </p>
                </div>
              ) : (
                filteredFriends.map((friend, i) => (
                  <motion.div
                    key={friend.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-hover transition-colors group"
                  >
                    <Avatar className="h-11 w-11 rounded-2xl">
                      <AvatarImage src={friend.avatar} alt={friend.displayName} />
                      <AvatarFallback className="rounded-2xl bg-surface-2 text-sm font-bold">
                        {getInitials(friend.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {friend.displayName}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            friend.online ? 'bg-online' : 'bg-muted-foreground/40'
                          }`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {friend.online ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleStartChat(friend.id)}
                        className="p-2 rounded-xl bg-surface-2 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors"
                      >
                        <MessageSquare size={16} />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleRemoveFriend(friend.id)}
                        className="p-2 rounded-xl bg-surface-2 hover:bg-red-500 hover:text-white text-muted-foreground transition-colors"
                      >
                        <UserMinus size={16} />
                      </motion.button>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'online' && (
            <motion.div
              key="online"
              {...fadeUp}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-2"
            >
              {onlineFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                    <Clock size={28} className="text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    No one&apos;s online
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Check back later
                  </p>
                </div>
              ) : (
                onlineFriends.map((friend, i) => (
                  <motion.div
                    key={friend.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-hover transition-colors group"
                  >
                    <div className="relative">
                      <Avatar className="h-11 w-11 rounded-2xl">
                        <AvatarImage src={friend.avatar} alt={friend.displayName} />
                        <AvatarFallback className="rounded-2xl bg-surface-2 text-sm font-bold">
                          {getInitials(friend.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-online border-2 border-surface-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {friend.displayName}
                      </p>
                      <span className="text-xs text-online font-medium">Online</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleStartChat(friend.id)}
                      className="p-2 rounded-xl bg-surface-2 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors"
                    >
                      <MessageSquare size={16} />
                    </motion.button>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'requests' && (
            <motion.div
              key="requests"
              {...fadeUp}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-6"
            >
              {/* Incoming */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Incoming — {incomingRequests.length}
                </h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 py-4 text-center">
                    No incoming requests
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {incomingRequests.map((req, i) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-hover transition-colors"
                      >
                        <Avatar className="h-11 w-11 rounded-2xl">
                          <AvatarImage src={req.user.avatar} alt={req.user.displayName} />
                          <AvatarFallback className="rounded-2xl bg-surface-2 text-sm font-bold">
                            {getInitials(req.user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {req.user.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{req.user.username}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleAcceptRequest(req.id)}
                            className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors"
                          >
                            <Check size={16} />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDeclineRequest(req.id)}
                            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                          >
                            <X size={16} />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Outgoing — {outgoingRequests.length}
                </h3>
                {outgoingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 py-4 text-center">
                    No outgoing requests
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {outgoingRequests.map((req, i) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-hover transition-colors"
                      >
                        <Avatar className="h-11 w-11 rounded-2xl">
                          <AvatarImage src={req.user.avatar} alt={req.user.displayName} />
                          <AvatarFallback className="rounded-2xl bg-surface-2 text-sm font-bold">
                            {getInitials(req.user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {req.user.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{req.user.username}
                          </p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleCancelRequest(req.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted-foreground bg-surface-2 hover:bg-surface-hover transition-colors"
                        >
                          Cancel
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'add' && (
            <motion.div
              key="add"
              {...fadeUp}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4"
            >
              {/* Search Input */}
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find users by name or username..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-2 border border-white/10 text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                />
              </div>

              {/* Loading */}
              {searching && (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              )}

              {/* Results */}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                    <Search size={28} className="text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">No users found</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Try a different search term
                  </p>
                </div>
              )}

              {!searching && searchResults.map((result, i) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-hover transition-colors"
                >
                  <Avatar className="h-11 w-11 rounded-2xl">
                    <AvatarImage src={result.avatar} alt={result.displayName} />
                    <AvatarFallback className="rounded-2xl bg-surface-2 text-sm font-bold">
                      {getInitials(result.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {result.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">@{result.username}</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSendRequest(result.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <UserPlus size={14} />
                    Add
                  </motion.button>
                </motion.div>
              ))}

              {!searching && !searchQuery.trim() && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                    <UserPlus size={28} className="text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    Find new friends
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Search by name or username
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
