'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore, triggerNotifications } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { auth } from '@/lib/firebase';
import { authFetch } from '@/lib/api';
import { ArrowLeft, Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/types';
import Image from 'next/image';

/** Map Firebase Auth error codes to user-friendly messages. */
function getFirebaseErrorMessage(err: any): string | null {
  const code: string = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Authentication is misconfigured. Please contact support';
    default:
      return null;
  }
}

export function SignInForm() {
  const setView = useUIStore((s) => s.setView);
  const { setUser, setIsDemo } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Sign in failed');

      // Fetch the canonical KIVO user (DB record) so user.id matches the ids
      // used by chat/friends APIs. authFetch() attaches a fresh Firebase ID
      // token automatically — no token is cached here. autoSignOut:false keeps
      // a 401 from /auth/me from killing the fresh session, because a 401 here
      // means "no DB record yet" (e.g. account not created via Signup), not an
      // expired token. Falls back to a Firebase-derived user in that case.
      let userToStore: User;
      try {
        const res = await authFetch('/api/auth/me', {}, { autoSignOut: false });
        const json = await res.json().catch(() => ({ success: false }));
        if (res.ok && json.success) {
          userToStore = json.data as User;
        } else {
          throw new Error('No profile');
        }
      } catch {
        userToStore = {
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

      setUser(userToStore);
      setIsDemo(false);
      if (!userToStore.emailVerified) {
        setView('verify-email');
        toast.info('Please verify your email to continue');
      } else {
        setView('chat');
        toast.success('Welcome back!');
      }
      triggerNotifications();
    } catch (err: any) {
      toast.error(getFirebaseErrorMessage(err) || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <button
          onClick={() => setView('welcome')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden">
            <Image
              src="/logo.png"
              alt="KIVO"
              width={56}
              height={56}
              priority
              quality={100}
              sizes="56px"
              className="object-contain p-1"
            />
          </div>
        </div>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign In</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Welcome back to KIVO
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
              autoComplete="current-password"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={async () => {
                if (!email) { toast.error('Please enter your email first'); return; }
                try {
                  await sendPasswordResetEmail(auth, email);
                  toast.success('Password reset link sent to your email');
                } catch (err: any) {
                  toast.error(getFirebaseErrorMessage(err) || 'Failed to send reset email');
                }
              }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </button>
          </div>

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="mt-2 h-11 text-sm font-medium rounded-xl kivo-glow"
            style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>

          {/* Demo Login */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground/60">or</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setUser({
                id: 'demo-user-001',
                email: 'demo@kivo.app',
                displayName: 'Demo User',
                username: 'demouser',
                avatar: '',
                bio: '',
                status: '',
                online: true,
                lastSeen: new Date().toISOString(),
                theme: 'dark',
                emailVerified: true,
                showOnline: true,
                showLastSeen: true,
                showReadReceipts: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              setIsDemo(true);
              setView('chat');
              toast.success('Welcome to KIVO Demo!');
            }}
            className="w-full flex items-center justify-center gap-2 h-11 text-sm font-medium rounded-xl bg-surface-1 border border-border/50 text-foreground hover:bg-surface-hover transition-colors"
          >
            <FlaskConical className="h-4 w-4 text-primary" />
            Sign In with Demo Account
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <button onClick={() => setView('signup')} className="text-primary hover:underline font-medium">
            Sign Up
          </button>
        </p>
      </motion.div>
    </div>
  );
}