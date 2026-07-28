'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';
import { useFriendsStore } from '@/stores/friends-store';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useTheme } from 'next-themes';
import { ArrowLeft, Loader2, User, Palette, Bell, Shield, LogOut, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { disconnectSocket } from '@/lib/socket';

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

export function SettingsPanel() {
  const { user, token, setUser, logout } = useAuthStore();
  const { setView } = useUIStore();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<'main' | 'edit-profile' | 'notifications' | 'privacy' | 'blocked'>('main');
  const [notifSettings, setNotifSettings] = useState({ messages: true, friendRequests: true });
  const [privacySettings, setPrivacySettings] = useState({ showOnline: true, showLastSeen: true, showReadReceipts: true });
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ displayName: user?.displayName || '', bio: user?.bio || '', status: user?.status || '' });

  const saveProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const updated = await api('/users/' + user.id, { token, method: 'PUT', body: form });
      setUser(updated);
      setSection('main');
      toast.success('Profile updated');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    setView('welcome');
    useChatStore.getState().reset();
    useFriendsStore.getState().reset();
  };

  if (section === 'edit-profile') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mx-auto max-w-md"
        >
          <button
            onClick={() => setSection('main')}
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <h2 className="mb-6 text-lg font-semibold">Edit Profile</h2>

          <div className="space-y-5">
            <div className="flex justify-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">{getInitials(user?.displayName || 'U')}</AvatarFallback>
              </Avatar>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Display Name</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="h-10 rounded-xl bg-surface-1 border-border/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Bio</Label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                rows={3}
                className="w-full resize-none rounded-xl bg-surface-1 border border-border/50 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="Tell us about yourself..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Status</Label>
              <Input
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="h-10 rounded-xl bg-surface-1 border-border/50"
                placeholder="What's on your mind?"
              />
            </div>

            <Button
              onClick={saveProfile}
              disabled={loading}
              className="w-full h-10 rounded-xl kivo-glow"
              style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (section === 'notifications') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-md">
          <button onClick={() => setSection('main')} className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="mb-6 text-lg font-semibold">Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Message Notifications</p>
                <p className="text-xs text-muted-foreground">Get notified for new messages</p>
              </div>
              <Switch checked={notifSettings.messages} onCheckedChange={(v) => setNotifSettings((s) => ({ ...s, messages: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Friend Request Alerts</p>
                <p className="text-xs text-muted-foreground">Get notified for friend requests</p>
              </div>
              <Switch checked={notifSettings.friendRequests} onCheckedChange={(v) => setNotifSettings((s) => ({ ...s, friendRequests: v }))} />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (section === 'privacy') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-md">
          <button onClick={() => setSection('main')} className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="mb-6 text-lg font-semibold">Privacy & Security</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Show Online Status</p>
                <p className="text-xs text-muted-foreground">Let others see when you're online</p>
              </div>
              <Switch checked={privacySettings.showOnline} onCheckedChange={(v) => setPrivacySettings((s) => ({ ...s, showOnline: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Show Last Seen</p>
                <p className="text-xs text-muted-foreground">Let others see when you were last active</p>
              </div>
              <Switch checked={privacySettings.showLastSeen} onCheckedChange={(v) => setPrivacySettings((s) => ({ ...s, showLastSeen: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Read Receipts</p>
                <p className="text-xs text-muted-foreground">Show when you've read messages</p>
              </div>
              <Switch checked={privacySettings.showReadReceipts} onCheckedChange={(v) => setPrivacySettings((s) => ({ ...s, showReadReceipts: v }))} />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (section === 'blocked') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-md">
          <button onClick={() => setSection('main')} className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="mb-6 text-lg font-semibold">Blocked Users</h2>
          <div className="space-y-2">
            {blockedUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No blocked users</p>}
            {blockedUsers.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl bg-surface-1 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs bg-destructive/10 text-destructive">{getInitials(u.displayName || '?')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{u.username}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api('/blocks/unblock', { token, body: { userId: u.id } });
                      setBlockedUsers((prev: any[]) => prev.filter((b: any) => b.id !== u.id));
                      toast.success('User unblocked');
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="text-xs font-medium text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </motion.div>
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

        <h2 className="mb-6 text-lg font-semibold">Settings</h2>

        <div className="space-y-2">
          {/* Profile */}
          <button
            onClick={() => setSection('edit-profile')}
            className="w-full flex items-center gap-3 rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-hover transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Edit Profile</p>
              <p className="text-xs text-muted-foreground">{user?.displayName} · @{user?.username}</p>
            </div>
          </button>

          {/* Appearance */}
          <div className="flex items-center gap-3 rounded-xl bg-surface-1 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch to dark theme</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>

          {/* Notifications */}
          <button
            onClick={() => setSection('notifications')}
            className="w-full flex items-center gap-3 rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-hover transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-muted-foreground">Message and friend request alerts</p>
            </div>
          </button>

          {/* Privacy & Security */}
          <button
            onClick={() => setSection('privacy')}
            className="w-full flex items-center gap-3 rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-hover transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Privacy & Security</p>
              <p className="text-xs text-muted-foreground">Manage your security settings</p>
            </div>
          </button>

          {/* Blocked Users */}
          <button
            onClick={() => setSection('blocked')}
            className="w-full flex items-center gap-3 rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-hover transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <UserX className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Blocked Users</p>
              <p className="text-xs text-muted-foreground">Manage blocked users</p>
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl p-4 text-left hover:bg-destructive/5 transition-colors mt-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">Log Out</p>
          </button>
        </div>
      </motion.div>
    </div>
  );
}