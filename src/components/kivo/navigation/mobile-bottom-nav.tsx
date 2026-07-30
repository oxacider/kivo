'use client';

import { motion } from 'framer-motion';
import { MessageSquare, Users, User } from 'lucide-react';
import { useUIStore, type MainTab } from '@/stores/ui-store';

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

interface TabItem {
  id: MainTab;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabItem[] = [
  { id: 'chat', label: 'Chats', icon: <MessageSquare size={22} /> },
  { id: 'friends', label: 'Friends', icon: <Users size={22} /> },
  { id: 'profile', label: 'Profile', icon: <User size={22} /> },
];

export function MobileBottomNav() {
  const { mainTab, setMainTab } = useUIStore();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/20 bg-surface-1/90 backdrop-blur-xl">
      <div className="relative flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = mainTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`relative flex flex-col items-center justify-center w-20 h-full gap-0.5 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
              whileTap={{ scale: 0.92 }}
            >
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-active-pill"
                  className="absolute -top-px left-3 right-3 h-[3px] rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">{tab.icon}</span>
              <span className="relative text-[11px] font-medium">{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
