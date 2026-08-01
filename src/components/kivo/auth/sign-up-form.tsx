'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore, triggerNotifications } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/types';
import Image from 'next/image';

/** Map Firebase Auth error codes to user-friendly messages. */
function getFirebaseErrorMessage(err: any): string | null {
  const code: string = err?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists';
    case 'auth/invalid-email':
      return 'Please enter a valid email address';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-up is not enabled';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    default:
      return null;
  }
}

export function SignUpForm() {
  const setView = useUIStore((s) => s.setView);
  const { setUser, setToken } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '', displayName: '', username: '' });
  const [loading, setLoading] = useState(false);
  const [devVerificationCode, setDevVerificationCode] = useState<string | null>(null);

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.displayName || !form.username) return;
    setLoading(true);

    // Track the created Firebase account so it can be rolled back if profile creation fails
    let firebaseUser: any = null;

    try {
      // 1) Create the Firebase Authentication account
      const credential = await createUserWithEmailAndPassword(auth, form.email, form.password);
      firebaseUser = credential.user;
      const idToken = await credential.user.getIdToken();

      // 2) Create the KIVO profile (Supabase Postgres) — email comes from the verified token
      const data = await api<{ user: User; verificationCode?: string }>('/auth/register', {
        token: idToken,
        body: { displayName: form.displayName, username: form.username },
      });

      // Store the Firebase ID token (the backend now accepts it)
      setUser(data.user);
      setToken(idToken);
      if (data.verificationCode) setDevVerificationCode(data.verificationCode);
      setView('verify-email');
      toast.success('Account created! Please verify your email.');
      triggerNotifications();
    } catch (err: any) {
      // Profile creation failed after the Firebase account was created — roll it back
      // so the user can retry without an orphaned account.
      if (firebaseUser) {
        deleteUser(firebaseUser).catch(() => {});
      }
      toast.error(getFirebaseErrorMessage(err) || err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
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

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create Account</h1>
        <p className="mb-8 text-sm text-muted-foreground">Join KIVO today</p>
        {devVerificationCode && (
          <div className="mb-6 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 text-center">
            Dev mode — verification code: <span className="font-mono font-bold">{devVerificationCode}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName" className="text-xs">Display Name</Label>
            <Input
              id="displayName"
              placeholder="John Doe"
              value={form.displayName}
              onChange={update('displayName')}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username" className="text-xs">Username</Label>
            <Input
              id="username"
              placeholder="johndoe"
              value={form.username}
              onChange={update('username')}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
              autoComplete="username"
            />
            <span className="text-[11px] text-muted-foreground/60">Lowercase, letters, numbers, underscores</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-email" className="text-xs">Email</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-password" className="text-xs">Password</Label>
            <Input
              id="signup-password"
              type="password"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={update('password')}
              className="h-11 rounded-xl bg-surface-1 border-border/50"
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !form.email || !form.password || !form.displayName || !form.username}
            className="mt-2 h-11 text-sm font-medium rounded-xl kivo-glow"
            style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Account
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <button onClick={() => setView('signin')} className="text-primary hover:underline font-medium">
            Sign In
          </button>
        </p>
      </motion.div>
    </div>
  );
}