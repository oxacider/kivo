'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { getOrCreateConversation } from '@/lib/chat-service';
import { getFriendStatusWith, blockUser } from '@/lib/friends-service';
import { subscribePresence } from '@/lib/presence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, MessageCircle, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/types';
import { format } from 'date-fns';

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

interface Props {
  userId: string;
}

export function UserProfile({ userId }: Props) {
  const { token, user: me } = useAuthStore();
  const { setView } = useUIStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const u = await api<User>('/users/' + userId, { token });
        setProfile(u);

        // Phase 4: friendship + block status read straight from Firestore.
        if (me?.id) {
          try {
            const { status } = await getFriendStatusWith(me.id, userId);
            setIsFriend(status === 'accepted');
            setIsBlocked(status === 'blocked');
          } catch { /* no relationship */ }
        }
      } catch (err: any) { toast.error(err.message); }
      setLoading(false);
    })();
  }, [token, userId]);

  // Phase 3: live online/lastSeen via RTDB presence.
  useEffect(() => {
    if (!token || token.startsWith('demo-')) return;
    const unsub = subscribePresence(userId, (presence) => {
      if (!presence) return;
      setProfile((prev) => (prev ? { ...prev, online: presence.online, lastSeen: presence.lastSeen } : prev));
    });
    return () => unsub();
  }, [token, userId]);

  const startChat = async () => {
    if (!me) return;
    try {
      await getOrCreateConversation(me.id, userId);
      setView('chat');
    } catch (err: any) { toast.error(err.message); }
  };

  const blockAction = async () => {
    if (!me) return;
    try {
      await blockUser(me.id, { id: userId, displayName: profile?.displayName || '', username: profile?.username || '', avatar: profile?.avatar || '' });
      toast.success('User blocked');
      setView('chat');
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-surface-2" />
          <div className="h-4 w-32 rounded bg-surface-2" />
          <div className="h-3 w-24 rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mx-auto max-w-md"
      >
        <button
          onClick={() => setView('chat')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {getInitials(profile.displayName || '?')}
              </AvatarFallback>
            </Avatar>
            {profile.online && (
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-3 border-background bg-online" />
            )}
          </div>

          <h2 className="text-xl font-semibold">{profile.displayName}</h2>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>

          <p className="mt-3 px-8 text-sm text-muted-foreground leading-relaxed">
            {profile.bio || 'No bio yet'}
          </p>

          <p className="mt-2 text-xs text-muted-foreground/60">
            {profile.online ? (
              <span className="text-online">Online now</span>
            ) : (
              <>Last seen {format(new Date(profile.lastSeen), 'PPP p')}</>
            )}
          </p>

          <div className="mt-6 flex gap-3 w-full">
            {isFriend && (
              <button
                onClick={startChat}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium kivo-glow"
              >
                <MessageCircle className="h-4 w-4" /> Message
              </button>
            )}
            {!isBlocked && (
              <button
                onClick={blockAction}
                className="flex items-center justify-center gap-2 h-11 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors px-6"
              >
                <UserX className="h-4 w-4" /> Block
              </button>
            )}
          </div>

          {isBlocked && (
            <p className="mt-4 text-xs text-destructive/70">You have blocked this user</p>
          )}

          <div className="mt-8 w-full space-y-3">
            <div className="rounded-xl bg-surface-1 p-4">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <p className="text-sm">{profile.status || 'No status set'}</p>
            </div>
            <div className="rounded-xl bg-surface-1 p-4">
              <p className="text-xs text-muted-foreground mb-1">Member since</p>
              <p className="text-sm">{format(new Date(profile.createdAt), 'MMMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
