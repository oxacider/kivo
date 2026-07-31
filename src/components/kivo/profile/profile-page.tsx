'use client';

import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Edit3,
  Camera,
  Settings,
  BadgeCheck,
  Shield,
  CalendarDays,
  Hash,
  Users,
  Activity,
  Mail,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useChatStore } from '@/stores/chat-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import Image from 'next/image';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function formatLastSeen(date: string): string {
  try {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(d, 'MMM d, yyyy');
  } catch {
    return 'Unknown';
  }
}

export function ProfilePage() {
  const { user, token, logout } = useAuthStore();
  const { friends } = useFriendsStore();
  const { setSettingsOpen } = useUIStore();
  const { theme, setTheme } = useTheme();

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(user?.bio ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDemo = token?.startsWith('demo-');

  const joinDate = useMemo(() => {
    if (!user?.createdAt) return 'Unknown';
    try {
      return format(new Date(user.createdAt), 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  }, [user]);

  const handleSaveBio = async () => {
    if (!user || isDemo) return;
    try {
      const updated = await api<User>('/users/' + user.id, { token, method: 'PUT', body: { bio: editBio } });
      useAuthStore.getState().setUser(updated);
      setIsEditing(false);
      toast.success('Bio updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update bio');
    }
  };

  const handleCancelEdit = () => {
    setEditBio(user?.bio ?? '');
    setIsEditing(false);
  };

  const handleEditProfile = () => {
    setSettingsOpen(true);
  };

  const handleChangeAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isDemo) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      useAuthStore.getState().updateUser({ avatar: json.data.avatar });
      toast.success('Avatar updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload avatar');
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
  };

  const container = {
    animate: { transition: { staggerChildren: 0.06 } },
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-20 md:pb-4">
      {/* Banner */}
      <div className="relative h-32 sm:h-40 w-full shrink-0 rounded-b-3xl bg-gradient-to-br from-primary via-primary/80 to-primary/40 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
      </div>

      <motion.div
        variants={container}
        initial="initial"
        animate="animate"
        className="flex flex-col gap-6 px-5 -mt-12 relative z-10"
      >
        {/* Avatar Row */}
        <motion.div
          variants={fadeUp}
          className="flex items-end justify-between gap-4"
        >
          <div className="relative group">
            <div className="gradient-border p-[3px] rounded-3xl">
              <Avatar className="h-24 w-24 rounded-3xl">
                <AvatarImage
                  src={user?.avatar}
                  alt={user?.displayName}
                  className="object-cover"
                />
                <AvatarFallback className="rounded-3xl bg-surface-2 text-2xl font-bold">
                  {user?.displayName ? getInitials(user.displayName) : '?'}
                </AvatarFallback>
              </Avatar>
            </div>
            {user?.online && (
              <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-online border-[3px] border-surface-1 z-20" />
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleChangeAvatar}
              className="absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera size={22} className="text-white" />
            </motion.button>
          </div>

          <div className="flex gap-2 mb-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleEditProfile}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
            >
              <Edit3 size={15} />
              <span className="hidden sm:inline">Edit Profile</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleChangeAvatar}
              className="p-2 rounded-xl bg-surface-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <Camera size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-xl bg-surface-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <Settings size={16} />
            </motion.button>
          </div>
        </motion.div>

        {/* Name & Bio */}
        <motion.div variants={fadeUp} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-foreground">
              {user?.displayName ?? 'Unknown'}
            </h1>
            <BadgeCheck
              size={22}
              className="text-primary shrink-0"
            />
          </div>
          <p className="text-sm text-muted-foreground">@{user?.username ?? 'unknown'}</p>

          {isEditing ? (
            <div className="flex flex-col gap-2 mt-2">
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                maxLength={190}
                placeholder="Tell us about yourself..."
                className="w-full rounded-xl bg-surface-2 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveBio}
                  className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Save
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCancelEdit}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 text-muted-foreground text-sm font-medium hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {user?.bio || 'No bio yet.'}
            </p>
          )}
        </motion.div>

        {/* Quick Stats Grid */}
        <motion.div
          variants={fadeUp}
          className="grid grid-cols-2 gap-3"
        >
          <div className="rounded-2xl bg-surface-1 p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Hash size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                KIVO ID
              </span>
            </div>
            <p className="text-sm font-bold text-foreground">
              #{user?.id?.slice(0, 8) ?? '--------'}
            </p>
          </div>

          <div className="rounded-2xl bg-surface-1 p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Joined
              </span>
            </div>
            <p className="text-sm font-bold text-foreground">{joinDate}</p>
          </div>

          <div className="rounded-2xl bg-surface-1 p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Friends
              </span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {friends.length}
            </p>
          </div>

          <div className="rounded-2xl bg-surface-1 p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-emerald-400" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${user?.online ? 'bg-online' : 'bg-muted-foreground/40'}`} />
              <p className="text-sm font-bold text-foreground">
                {user?.online ? 'Online' : user?.showLastSeen !== false ? `Last seen ${formatLastSeen(user?.lastSeen ?? '')}` : 'Offline'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Account Info */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Account Info
          </h2>
          <div className="flex flex-col gap-2">
            {/* Email */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-1 border border-white/5">
              <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center">
                <Mail size={16} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email ?? 'Not set'}
                </p>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-1 border border-white/5">
              <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center">
                {theme === 'dark' ? (
                  <Moon size={16} className="text-muted-foreground" />
                ) : (
                  <Sun size={16} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Theme</p>
                <p className="text-sm font-medium text-foreground capitalize">
                  {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
                </p>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) =>
                  setTheme(checked ? 'dark' : 'light')
                }
              />
            </div>

            {/* Privacy */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-1 border border-white/5">
              <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center">
                <Shield size={16} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Privacy</p>
                <p className="text-sm font-medium text-emerald-400">Secured</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Mobile Logout */}
        <motion.div variants={fadeUp} className="md:hidden">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
          >
            <LogOut size={16} />
            Log Out
          </motion.button>
        </motion.div>
      </motion.div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
    </div>
  );
}
