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
import { VerifyEmailForm } from '@/components/kivo/auth/verify-email-form';
import { ConversationList } from '@/components/kivo/chat/conversation-list';
import { ConversationView } from '@/components/kivo/chat/conversation-view';
import { SettingsPanel } from '@/components/kivo/settings/settings-panel';
import { DesktopSidebar } from '@/components/kivo/navigation/desktop-sidebar';
import { MobileBottomNav } from '@/components/kivo/navigation/mobile-bottom-nav';
import { FriendsPage } from '@/components/kivo/friends/friends-page';
import { ProfilePage } from '@/components/kivo/profile/profile-page';
import { GlobalSearchOverlay } from '@/components/kivo/overlays/global-search-overlay';
import { usePresence } from '@/hooks/use-presence';
import { useFriends } from '@/hooks/use-friends';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Bell } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { api } from '@/lib/api';
import type { User } from '@/types';

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
  'verify-email': { key: 'verify-email', slideFrom: 80 },
  chat: { key: 'chat' },
};

const pageVariants = {
  initial: (from: number) => ({ x: from || 0, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (from: number) => ({ x: -(from || 40), opacity: 0 }),
};

/**
 * Route to the correct view once a session has been restored.
 * Mirrors the gate used by handleSplashDone (verify-email vs chat). Only acts
 * after the splash has completed — the splash owns routing until it finishes.
 */
function routeAfterRestore(user: User) {
  const ui = useUIStore.getState();
  if (!ui.splashDone || ui.currentView === 'splash') return;
  ui.setView(user.emailVerified ? 'chat' : 'verify-email');
}

export default function Home() {
  const { currentView, splashDone, setSplashDone, setView } = useUIStore();
  const { user, token } = useAuthStore();
  const { setActiveConversationId } = useChatStore();

  // Fix hydration mismatch: splashDone persisted but currentView reset to 'splash'
  useEffect(() => {
    if (splashDone && currentView === 'splash') {
      setView(user && token ? 'chat' : 'welcome');
    }
  }, [splashDone, currentView, user, token, setView]);

  // Handle notification click: ?chat=conversationId from SW click handler
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('chat');
    if (chatId && user && token) {
      setActiveConversationId(chatId);
      // Clean URL without reload
      window.history.replaceState({}, '', '/');
    }
  }, [user, token, setActiveConversationId]);

  /**
   * Session restore — Firebase Auth is the single source of truth.
   *
   * onAuthStateChanged() drives the auth store: when a Firebase session exists
   * we hydrate the complete profile from the backend (/auth/me); otherwise we
   * fall back to the legacy JWT session for backward compatibility. Demo and
   * signed-out states are left to handleSplashDone.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    /** Backward-compatible restore for legacy JWT sessions (no Firebase session). */
    const restoreLegacySession = async () => {
      const { token: storedToken } = useAuthStore.getState();
      if (!storedToken || storedToken.startsWith('demo-')) return;
      try {
        const me = await api<User>('/auth/me', { token: storedToken });
        if (cancelled) return;
        useAuthStore.setState({ user: me, token: storedToken });
        routeAfterRestore(me);
      } catch {
        if (cancelled) return;
        // Stale legacy token → clear the persisted session.
        useAuthStore.getState().logout();
        const ui = useUIStore.getState();
        if (ui.splashDone) ui.setView('welcome');
      }
    };

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (cancelled) return;

        if (firebaseUser) {
          // Primary path: Firebase session → fresh ID token + hydrated DB profile.
          firebaseUser
            .getIdToken()
            .then(async (idToken) => {
              if (cancelled) return;
              let hydrated: User;
              try {
                hydrated = await api<User>('/auth/me', { token: idToken });
              } catch {
                // No DB record yet — fall back to a Firebase-derived profile,
                // but never clobber an existing hydrated DB user (e.g. the
                // signup /auth/register insert may still be in flight).
                const existing = useAuthStore.getState().user;
                if (
                  existing?.email &&
                  existing.email.toLowerCase() === (firebaseUser.email || '').toLowerCase()
                ) {
                  useAuthStore.setState({ token: idToken });
                  routeAfterRestore(existing);
                  return;
                }
                hydrated = {
                  id: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || '',
                  username: (firebaseUser.email || '').split('@')[0] || firebaseUser.uid,
                  avatar: '',
                  bio: '',
                  status: '',
                  online: true,
                  lastSeen: new Date().toISOString(),
                  theme: 'dark',
                  emailVerified: firebaseUser.emailVerified,
                  showOnline: true,
                  showLastSeen: true,
                  showReadReceipts: true,
                  createdAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
                  updatedAt: firebaseUser.metadata.lastSignInTime || new Date().toISOString(),
                };
              }
              if (cancelled) return;
              useAuthStore.setState({ user: hydrated, token: idToken });
              routeAfterRestore(hydrated);
            })
            .catch(() => {
              // ID token refresh failed (e.g. network) — keep existing state and
              // let a later auth event / reload retry. Never sign the user out here.
            });
          return;
        }

        // No Firebase session:
        const { token: storedToken } = useAuthStore.getState();
        if (storedToken && !storedToken.startsWith('demo-')) {
          // Legacy JWT session → restore it (backward compatibility).
          void restoreLegacySession();
        } else if (!storedToken) {
          // Signed out after the splash (e.g. logout from chat) — land on welcome.
          const ui = useUIStore.getState();
          if (ui.splashDone && ui.currentView !== 'welcome' && ui.currentView !== 'splash') {
            ui.setView('welcome');
          }
        }
        // Demo sessions (storedToken starts with 'demo-') are left untouched.
      });
    } catch {
      // Firebase misconfigured — fall back to the legacy session restore.
      void restoreLegacySession();
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleSplashDone = useCallback(() => {
    setSplashDone(true);
    if (user && token) {
      // Gate: unverified users go to verify-email
      if (!token.startsWith('demo-') && !user.emailVerified) {
        setView('verify-email');
      } else {
        setView('chat');
      }
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
            {currentView === 'verify-email' && <VerifyEmailForm />}
            {currentView === 'chat' && <ChatLayout />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatLayout() {
  const { mainTab, settingsOpen, setSettingsOpen, notificationsOpen, setNotificationsOpen } = useUIStore();
  const { activeConversationId } = useChatStore();

  // Phase 3: RTDB presence + live online status for friends/conversations.
  usePresence();
  // Phase 4: Firestore friendships/blocks → friends store (replaces legacy API polling).
  useFriends();

  return (
    <div className="flex h-full w-full">
      <DesktopSidebar />

      {/* Main content area — switches based on mainTab */}
      <div className="flex-1 h-full overflow-hidden">
        {mainTab === 'chat' && (
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
        )}
        {mainTab === 'friends' && <FriendsPage />}
        {mainTab === 'profile' && <ProfilePage />}
      </div>

      <MobileBottomNav />

      {/* Settings overlay */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="overflow-y-auto p-0">
          <SheetTitle className="sr-only">Settings</SheetTitle>
          <SheetDescription className="sr-only">Manage your account settings</SheetDescription>
          <SettingsPanel />
        </SheetContent>
      </Sheet>

      {/* Notifications overlay */}
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right">
          <SheetTitle className="sr-only">Notifications</SheetTitle>
          <SheetDescription className="sr-only">View your notifications</SheetDescription>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Notifications</h2>
            </div>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                <Bell size={28} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">No new notifications</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                You&apos;re all caught up
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <GlobalSearchOverlay />
    </div>
  );
}
