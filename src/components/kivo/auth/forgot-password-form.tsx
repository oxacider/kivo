'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ForgotPasswordForm() {
  const setView = useUIStore((s) => s.setView);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api('/auth/forgot-password', { body: { email } });
      setStep('code');
      toast.info('Enter the 6-digit code to reset your password');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !newPassword) return;
    setLoading(true);
    try {
      await api('/auth/reset-password', { body: { email, code, newPassword } });
      toast.success('Password reset! Please sign in');
      setView('signin');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <button
          onClick={() => setView('signin')}
          className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {step === 'email' ? (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">Forgot Password</h1>
            <p className="mb-8 text-sm text-muted-foreground">
              Enter your email to receive a reset code
            </p>
            <form onSubmit={handleSendCode} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-email" className="text-xs">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl bg-surface-1 border-border/50"
                  autoComplete="email"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !email}
                className="mt-2 h-11 text-sm font-medium rounded-xl kivo-glow"
                style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Code
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reset Password</h1>
            <p className="mb-8 text-sm text-muted-foreground">
              Enter the 6-digit code and your new password
            </p>
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Reset Code</Label>
                <Input
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-11 rounded-xl bg-surface-1 border-border/50 text-center tracking-[0.5em] text-lg font-mono"
                  maxLength={6}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password" className="text-xs">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11 rounded-xl bg-surface-1 border-border/50"
                  autoComplete="new-password"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || code.length !== 6 || !newPassword}
                className="mt-2 h-11 text-sm font-medium rounded-xl kivo-glow"
                style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <button onClick={() => setView('signin')} className="text-primary hover:underline font-medium">
            Sign In
          </button>
        </p>
      </motion.div>
    </div>
  );
}
