'use client';

import { motion } from 'framer-motion';
import {
  MessageSquare,
  Users,
  User,
  Settings,
  Search,
  Bell,
} from 'lucide-react';
import { useUIStore, type MainTab } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendsStore } from '@/stores/friends-store';
import { useChatStore } from '@/stores/chat-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { KivoLogo } from '@/components/kivo/kivo-logo';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

interface NavItem {
  id: MainTab;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chats', icon: <MessageSquare size={20} /> },
  { id: 'friends', label: 'Friends', icon: <Users size={20} /> },
  { id: 'profile', label: 'Profile', icon: <User size={20} /> },
];

export function DesktopSidebar() {
  const { mainTab, setMainTab, setSearchOpen, setNotificationsOpen, setSettingsOpen } =
    useUIStore();
  const { user } = useAuthStore();
  const { friends } = useFriendsStore();
  const { conversations } = useChatStore();

  const getBadge = (id: MainTab): number => {
    if (id === 'friends') return friends.length;
    if (id === 'chat') return conversations.length;
    return 0;
  };

  return (
    <aside className="hidden md:flex flex-col h-screen w-[72px] lg:w-[240px] border-r border-border/20 bg-surface-1 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border/10">
        <KivoLogo size="md" />
        <span className="hidden lg:block gradient-text text-xl font-extrabold tracking-tight">
          KIVO
        </span>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-1 px-3 pt-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center lg:justify-start gap-3 w-full h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          <Search size={20} />
          <span className="hidden lg:block text-sm font-medium">Search</span>
          <kbd className="hidden lg:inline-flex ml-auto text-[10px] font-mono text-muted-foreground/60 border border-border/30 rounded-md px-1.5 py-0.5">
            ⌘K
          </kbd>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setNotificationsOpen(true)}
          className="flex items-center justify-center lg:justify-start gap-3 w-full h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          <Bell size={20} />
          <span className="hidden lg:block text-sm font-medium">Notifications</span>
        </motion.button>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 px-3 pt-4 flex-1">
        {navItems.map((item, i) => {
          const isActive = mainTab === item.id;
          const badge = getBadge(item.id);
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setMainTab(item.id)}
              className={`relative flex items-center justify-center lg:justify-start gap-3 w-full h-10 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'sidebar-item-active text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.icon}</span>
              <span className="relative z-10 hidden lg:block">{item.label}</span>
              {badge > 0 && (
                <span className="relative z-10 hidden lg:flex ml-auto text-xs font-bold text-primary-foreground bg-primary rounded-full min-w-[20px] h-5 items-center justify-center px-1.5">
                  {badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="flex flex-col gap-1 px-3 pb-4">
        {/* Settings */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center lg:justify-start gap-3 w-full h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
        >
          <Settings size={20} />
          <span className="hidden lg:block text-sm font-medium">Settings</span>
        </motion.button>

        {/* User Card */}
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer">
          <div className="relative">
            <Avatar className="h-8 w-8 rounded-xl">
              <AvatarImage src={user?.avatar} alt={user?.displayName} />
              <AvatarFallback className="rounded-xl bg-surface-2 text-xs font-bold">
                {user?.displayName ? getInitials(user.displayName) : '?'}
              </AvatarFallback>
            </Avatar>
            {user?.online && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-online border-2 border-surface-1" />
            )}
          </div>
          <div className="hidden lg:block min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {user?.displayName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              @{user?.username}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
