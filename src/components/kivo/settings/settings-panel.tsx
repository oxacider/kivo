'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';
import { useFriendsStore } from '@/stores/friends-store';
import { api } from '@/lib/api';
import { unblockUser } from '@/lib/friends-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useTheme } from 'next-themes';
import { ArrowLeft, Loader2, User as UserIcon, Palette, Bell, Shield, LogOut, UserX, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { disconnectSocket } from '@/lib/socket';
import { disconnectPresence } from '@/lib/presence';
import { enableNotifications, disableNotifications, getFCMToken } from '@/lib/notifications';
import { isNative } from '@/lib/capacitor';
import Image from 'next/image';
import type { User } from '@/types';

function getInitials(name: string) { return name.slice(0, 2).toUpperCase(); }

/* ------------------------------------------------------------------ */
/*  Notification Settings Section (real browser permission state)     */
/* ------------------------------------------------------------------ */

function NotificationSettingsSection({ onBack }: { onBack: () => void }) {
  const { isDemo } = useAuthStore();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  // Start false — only set true after confirming both permission + token exist.
  // Avoids flicker from async token check flipping the toggle back.
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [hasCheckedToken, setHasCheckedToken] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // On mount, sync real permission state and verify FCM token registration.
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      const p = Notification.permission;
      setPermission(p);
      if (p === 'granted' && !isDemo) {
        getFCMToken().then((token) => {
          setNotifEnabled(!!token);
          setHasCheckedToken(true);
        });
      } else {
        setNotifEnabled(false);
        setHasCheckedToken(true);
      }
    } else {
      setHasCheckedToken(true);
    }
  }, [isDemo]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    if (isDemo || isNative) return;
    setIsToggling(true);

    if (enabled) {
      // Request permission and register
      const token = await enableNotifications();
      if (token) {
        setPermission('granted');
        setNotifEnabled(true);
        toast.success('Notifications enabled');
      } else {
        setPermission(Notification.permission);
        setNotifEnabled(false);
        if (Notification.permission === 'denied') {
          toast.error('Permission denied. Enable in browser settings.');
        } else {
          toast.error('Could not enable notifications');
        }
      }
    } else {
      // Disable (unregister token)
      await disableNotifications();
      setNotifEnabled(false);
      toast.success('Notifications disabled');
    }

    setIsToggling(false);
  }, [isDemo]);

  const handleOpenBrowserSettings = useCallback(() => {
    // Guide users to browser notification settings
    if (typeof window !== 'undefined') {
      // Most browsers: opening settings via UI is the only option
      // Show a toast with instructions
      toast('Open your browser settings → Privacy → Notifications → Allow KIVO', {
        duration: 8000,
        icon: <ExternalLink className="h-4 w-4" />,
      });
    }
  }, []);

  const permissionLabel =
    permission === 'granted' ? 'Allowed' :
    permission === 'denied' ? 'Blocked' :
    'Not configured';

  const permissionColor =
    permission === 'granted' ? 'text-green-500' :
    permission === 'denied' ? 'text-destructive' :
    'text-amber-500';

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-md">
        <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h2 className="mb-6 text-lg font-semibold">Notifications</h2>

        <div className="space-y-4">
          {/* Main toggle */}
          <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm font-medium">Push Notifications</p>
              <p className={`text-xs mt-0.5 ${permissionColor}`}>
                {permissionLabel}
                {!isNative && permission === 'denied' && (
                  <button
                    onClick={handleOpenBrowserSettings}
                    className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    How to enable <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </p>
            </div>
            <Switch
              checked={notifEnabled}
              disabled={isToggling || isDemo || isNative || permission === 'denied' || !hasCheckedToken}
              onCheckedChange={handleToggle}
            />
          </div>

          {/* Permission status card */}
          {!isNative && permission !== 'granted' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-surface-1 p-4 border border-border/20"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {permission === 'denied'
                      ? 'Notifications are blocked'
                      : 'Enable notifications'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {permission === 'denied'
                      ? 'KIVO cannot show notifications because they are blocked in your browser. Open your browser settings to allow notifications from KIVO.'
                      : 'Receive messages instantly, even when KIVO is closed. Background notifications keep you connected.'}
                  </p>
                  {permission === 'default' && !isDemo && !isNative && (
                    <button
                      onClick={() => handleToggle(true)}
                      disabled={isToggling}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90"
                      style={{
                        background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))',
                      }}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Bell className="h-3 w-3" />
                      )}
                      Enable
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Info: what notifications include */}
          <div className="rounded-xl bg-surface-1 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              What you'll receive
            </p>
            <div className="flex flex-col gap-2">
              {[
                { icon: '💬', label: 'New message alerts with sender name' },
                { icon: '🔔', label: 'Background notifications when KIVO is closed' },
                { icon: '📳', label: 'Vibration on supported devices' },
                { icon: '🔄', label: 'Real-time message updates' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function SettingsPanel() {
  const { user, isDemo, setUser, logout } = useAuthStore();
  const { setView, setSettingsOpen } = useUIStore();
  const { theme, setTheme } = useTheme();
  const { blockedUsers, removeBlockedUser } = useFriendsStore();
  const [section, setSection] = useState<'main' | 'edit-profile' | 'notifications' | 'privacy' | 'blocked'>('main');
  const [privacySettings, setPrivacySettings] = useState(() => ({
    showOnline: user?.showOnline ?? true,
    showLastSeen: user?.showLastSeen ?? true,
    showReadReceipts: user?.showReadReceipts ?? true,
  }));
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ displayName: user?.displayName || '', username: user?.username || '', bio: user?.bio || '', status: user?.status || '' });

  const saveProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const updated = await api<User>('/users/' + user.id, { method: 'PUT', body: form });
      setUser(updated);
      setSection('main');
      toast.success('Profile updated');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  const handleLogout = () => {
    disconnectSocket();
    // Phase 3: flip presence offline explicitly (RTDB onDisconnect is the backup).
    if (user?.id && !isDemo) disconnectPresence(user.id);
    logout();
    setSettingsOpen(false);
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
              <Label className="text-xs">Username</Label>
              <Input
                value={form.username || ''}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="h-10 rounded-xl bg-surface-1 border-border/50"
                placeholder="johndoe"
              />
              <span className="text-[11px] text-muted-foreground/60">Lowercase, letters, numbers, underscores</span>
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
    return <NotificationSettingsSection onBack={() => setSection('main')} />;
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
              <Switch checked={privacySettings.showOnline} onCheckedChange={async (v) => {
                setPrivacySettings((s) => ({ ...s, showOnline: v }));
                if (!isDemo) { api('/users/privacy', { method: 'PUT', body: { showOnline: v } }).catch(() => {}); }
              }} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Show Last Seen</p>
                <p className="text-xs text-muted-foreground">Let others see when you were last active</p>
              </div>
              <Switch checked={privacySettings.showLastSeen} onCheckedChange={async (v) => {
                setPrivacySettings((s) => ({ ...s, showLastSeen: v }));
                if (!isDemo) { api('/users/privacy', { method: 'PUT', body: { showLastSeen: v } }).catch(() => {}); }
              }} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-1 p-4">
              <div>
                <p className="text-sm font-medium">Read Receipts</p>
                <p className="text-xs text-muted-foreground">Show when you've read messages</p>
              </div>
              <Switch checked={privacySettings.showReadReceipts} onCheckedChange={async (v) => {
                setPrivacySettings((s) => ({ ...s, showReadReceipts: v }));
                if (!isDemo) { api('/users/privacy', { method: 'PUT', body: { showReadReceipts: v } }).catch(() => {}); }
              }} />
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
                    if (!user) return;
                    try {
                      await unblockUser(user.id, u.id);
                      removeBlockedUser(u.id);
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
          onClick={() => { setSettingsOpen(false); setView('chat'); }}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden">
            <Image
              src="/logo.png"
              alt="KIVO"
              width={56}
              height={56}
              quality={100}
              sizes="56px"
              className="object-contain p-1"
            />
          </div>
        </div>

        <h2 className="mb-6 text-lg font-semibold">Settings</h2>

        <div className="space-y-2">
          {/* Profile */}
          <button
            onClick={() => setSection('edit-profile')}
            className="w-full flex items-center gap-3 rounded-xl bg-surface-1 p-4 text-left hover:bg-surface-hover transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <UserIcon className="h-5 w-5 text-primary" />
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