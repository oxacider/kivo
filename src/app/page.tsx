'use client';

import { useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useFriendsStore } from '@/stores/friends-store';
import { SplashScreen } from '@/components/kivo/splash-screen';
import { WelcomeScreen } from '@/components/kivo/welcome-screen';
import { SignInForm } from '@/components/kivo/auth/sign-in-form';
import { SignUpForm } from '@/components/kivo/auth/sign-up-form';
import { ForgotPasswordForm } from '@/components/kivo/auth/forgot-password-form';
import { ConversationList } from '@/components/kivo/chat/conversation-list';
import { ConversationView } from '@/components/kivo/chat/conversation-view';
import { SettingsPanel } from '@/components/kivo/settings/settings-panel';
import { api } from '@/lib/api';

type ViewConfig = {
  key: string;
  slideFrom?: number;
};

const viewConfig: Record<string, ViewConfig> = {
  splash: { key: 'splash' },
  welcome: { key: 'welcome' },
  signin: { key: 'signin', slideFrom: 80 },
  signup: { key: 'signup', slideFrom: 80 },
  'forgot-password': { key: 'forgot-password', slideFrom: 80 },
  chat: { key: 'chat' },
  settings: { key: 'settings', slideFrom: 40 },
  profile: { key: 'profile', slideFrom: 40 },
};

const pageVariants = {
  initial: (from: number) => ({ x: from || 0, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (from: number) => ({ x: -(from || 40), opacity: 0 }),
};

export default function Home() {
  const { currentView, splashDone, setSplashDone, setView } = useUIStore();
  const { user, token, setUser, setToken, logout } = useAuthStore();

  // Fix hydration mismatch: splashDone persisted but currentView reset to 'splash'
  useEffect(() => {
    if (splashDone && currentView === 'splash') {
      setView(user && token ? 'chat' : 'welcome');
    }
  }, [splashDone, currentView, user, token, setView]);

  useEffect(() => {
    if (user && token && currentView !== 'splash') {
      api('/auth/me', { token })
        .then((u: any) => {
          setUser(u);
          setView('chat');
        })
        .catch(() => {
          logout();
          setView('welcome');
        });
    }
  }, []);

  const handleSplashDone = useCallback(() => {
    setSplashDone(true);
    if (user && token) {
      setView('chat');
    } else {
      setView('welcome');
    }
  }, [user, token, setSplashDone, setView]);

  const config = viewConfig[currentView] || viewConfig.welcome;

  return (
    <div className="h-dvh w-screen overflow-hidden">
      <AnimatePresence mode="wait">
        {!splashDone ? (
          <SplashScreen key="splash" onDone={handleSplashDone} />
        ) : (
          <motion.div
            key={config.key}
            custom={config.slideFrom || 0}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full"
          >
            {currentView === 'welcome' && <WelcomeScreen />}
            {currentView === 'signin' && <SignInForm />}
            {currentView === 'signup' && <SignUpForm />}
            {currentView === 'forgot-password' && <ForgotPasswordForm />}
            {currentView === 'settings' && <SettingsPanel />}
            {currentView === 'chat' && <ChatLayout />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatLayout() {
  const { activeConversationId } = useChatStore();
  return (
    <div className="flex h-full w-full">
      <div className="w-full h-full md:w-80 md:min-w-80 md:border-r md:border-border/50">
        <ConversationList />
      </div>
      <div className="hidden md:flex flex-1 h-full">
        <ConversationView key={activeConversationId} />
      </div>
      {activeConversationId && (
        <div className="flex-1 h-full md:hidden absolute inset-0 z-30 bg-background">
          <ConversationView key={activeConversationId} />
        </div>
      )}
    </div>
  );
}
