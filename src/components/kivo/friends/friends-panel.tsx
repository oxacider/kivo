'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useChatStore } from '@/stores/chat-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, Check, X, UserMinus, ArrowLeft, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { User, Friendship } from '@/types';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  onClose: () => void;
}

export function FriendsPanel({ onClose }: Props) {
  const { token } = useAuthStore();
  const { friends, pendingRequests, sentRequests, searchResults, isSearching, setFriends, setPendingRequests, setSentRequests, addFriend, removeFriend, addSentRequest, removeSentRequest, setSearchResults, setIsSearching } = useFriendsStore();
  const { addConversation, setActiveConversationId } = useChatStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'friends' | 'requests' | 'sent' | 'add' | 'blocked'>('friends');
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchUsers = async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const results = await api<User[]>('/users/search?q=' + encodeURIComponent(q), { token });
      setSearchResults(results);
    } catch { /* ignore */ }
    setIsSearching(false);
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const sendRequest = async (receiverId: string) => {
    try {
      const results = await api<Friendship>('/friends/request', { token, body: { receiverId } });
      addSentRequest(results);
      setSearchResults(searchResults.filter((u: User) => u.id !== receiverId));
      toast.success('Friend request sent');
    } catch (err: any) { toast.error(err.message); }
  };

  const acceptRequest = async (id: string) => {
    try {
      await api('/friends/accept', { token, body: { requestId: id } });
      const req = pendingRequests.find((r) => r.id === id);
      if (req) addFriend(req.sender as unknown as User);
      setPendingRequests(pendingRequests.filter((r) => r.id !== id));
      toast.success('Friend added!');
    } catch (err: any) { toast.error(err.message); }
  };

  const declineRequest = async (id: string) => {
    try {
      await api('/friends/decline', { token, body: { requestId: id } });
      setPendingRequests(pendingRequests.filter((r) => r.id !== id));
    } catch (err: any) { toast.error(err.message); }
  };

  const removeFriendAction = async (userId: string) => {
    try {
      await api('/friends/remove', { token, body: { userId } });
      removeFriend(userId);
      toast.success('Friend removed');
    } catch (err: any) { toast.error(err.message); }
  };

  const blockUserAction = async (userId: string, name: string) => {
    try {
      await api('/blocks/block', { token, body: { userId } });
      removeFriend(userId);
      toast.success(`${name} has been blocked`);
    } catch (err: any) { toast.error(err.message); }
  };

  const startChat = async (userId: string) => {
    try {
      const conv = await api<any>('/conversations', { token, body: { userId } });
      addConversation(conv);
      setActiveConversationId(conv.id);
      onClose();
    } catch (err: any) { toast.error(err.message); }
  };

  // Load friends data on mount
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [friendsList, requestsList, sentList]: any[] = await Promise.all([
          api('/friends/list', { token }),
          api('/friends/requests', { token }),
          api('/friends/sent', { token }),
        ]);
        setFriends(friendsList);
        setPendingRequests(requestsList);
        setSentRequests(sentList);
      } catch { /* ignore */ }
    })();
  }, [token, setFriends, setPendingRequests, setSentRequests]);

  const cancelRequest = async (id: string) => {
    try {
      await api('/friends/cancel', { token, body: { requestId: id } });
      removeSentRequest(id);
      toast.success('Request cancelled');
    } catch (err: any) { toast.error(err.message); }
  };

  useEffect(() => {
    if (tab === 'blocked') {
      (async () => {
        try {
          const list = await api<User[]>('/blocks/list', { token });
          setBlockedUsers(list);
        } catch { /* ignore */ }
      })();
    }
  }, [tab, token]);

  const unblockUser = async (userId: string) => {
    try {
      await api('/blocks/unblock', { token, body: { userId } });
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success('User unblocked');
    } catch (err: any) { toast.error(err.message); }
  };

  const isFriend = (id: string) => friends.some((f) => f.id === id);
  const isPending = (id: string) => sentRequests.some((r) => r.receiverId === id);

  const tabs = [
    { key: 'friends' as const, label: 'Friends', count: friends.length },
    { key: 'requests' as const, label: 'Requests', count: pendingRequests.length },
    { key: 'sent' as const, label: 'Sent', count: sentRequests.length },
    { key: 'add' as const, label: 'Add', count: 0 },
    { key: 'blocked' as const, label: 'Blocked', count: blockedUsers.length },
  ];

  return (
    <div className="flex h-72 flex-col bg-surface-1">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="ml-1 text-[10px] opacity-60">{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="w-4" />
      </div>

      <ScrollArea className="flex-1">
        {tab === 'friends' && (
          <div className="p-2">
            {friends.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No friends yet</p>
            )}
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={f.avatar || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(f.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{f.displayName || f.username}</p>
                  {f.online ? (
                    <p className="text-[10px] text-online">Online</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Offline</p>
                  )}
                </div>
                <button onClick={() => startChat(f.id)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </button>
                <button onClick={() => removeFriendAction(f.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => blockUserAction(f.id, f.displayName || f.username)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                  <UserX className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'requests' && (
          <div className="p-2">
            {pendingRequests.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No pending requests</p>
            )}
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={req.sender?.avatar || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(req.sender?.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{req.sender?.displayName || req.sender?.username}</p>
                </div>
                <button onClick={() => acceptRequest(req.id)} className="p-1 text-online hover:bg-online/10 rounded-lg transition-colors">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => declineRequest(req.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'add' && (
          <div className="p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Search by name or username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 rounded-lg bg-surface-2 border-border/30 text-xs"
              />
            </div>
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatar || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(u.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{u.displayName}</p>
                  <p className="text-[10px] text-muted-foreground">@{u.username}</p>
                </div>
                {isFriend(u.id) ? (
                  <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-surface-2 rounded-md">Friends</span>
                ) : isPending(u.id) ? (
                  <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-surface-2 rounded-md">Pending</span>
                ) : (
                  <button
                    onClick={() => sendRequest(u.id)}
                    className="flex items-center gap-1 text-[10px] font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                  >
                    <UserPlus className="h-3 w-3" /> Add
                  </button>
                )}
              </div>
            ))}
            {search.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No users found</p>
            )}
          </div>
        )}

        {tab === 'sent' && (
          <div className="p-2">
            {sentRequests.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No sent requests</p>
            )}
            {sentRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={(req as any).receiver?.avatar || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials((req as any).receiver?.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{(req as any).receiver?.displayName || 'User'}</p>
                  <p className="text-[10px] text-muted-foreground">@{(req as any).receiver?.username || ''}</p>
                </div>
                <button
                  onClick={() => cancelRequest(req.id)}
                  className="text-[10px] font-medium text-amber-500 hover:bg-amber-500/10 px-2 py-1 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'blocked' && (
          <div className="p-2">
            {blockedUsers.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No blocked users</p>
            )}
            {blockedUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-destructive/10 text-destructive">{getInitials(u.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{u.displayName || u.username}</p>
                  <p className="text-[10px] text-muted-foreground">@{u.username}</p>
                </div>
                <button
                  onClick={() => unblockUser(u.id)}
                  className="text-[10px] font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}