'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/** Map Firebase Auth error codes to user-friendly messages (password reset context). */
function getFirebaseErrorMessage(err: any): string | null {
  const code: string = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address';
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

export function ForgotPasswordForm() {
  const setView = useUIStore((s) => s.setView);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [loading, setLoading] = useState(false);
  const [resetVia, setResetVia] = useState<'firebase' | 'legacy'>('legacy');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Countdown timer for resend
  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      // Primary path: Firebase Authentication. sendPasswordResetEmail() sends the
      // reset link email for Firebase accounts. It rejects with
      // auth/user-not-found when the email has no Firebase account — in that
      // case we fall back to the legacy 6-digit code flow for legacy accounts.
      let firebaseSent = false;
      try {
        await sendPasswordResetEmail(auth, email);
        firebaseSent = true;
      } catch (fbErr: any) {
        if (fbErr?.code !== 'auth/user-not-found') {
          throw fbErr;
        }
      }

      if (firebaseSent) {
        setResetVia('firebase');
        setStep('success');
        toast.success('Password reset link sent to your email');
        return;
      }

      // Legacy fallback: 6-digit reset code stored in the DB (public endpoint).
      const data: any = await api('/auth/forgot-password', { body: { email }, auth: false });
      if (data.code) setDevCode(data.code);
      setStep('code');
      startCountdown();
      toast.info(data.message || 'Enter the 6-digit code to reset your password');
    } catch (err: any) {
      toast.error(getFirebaseErrorMessage(err) || err?.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const data: any = await api('/auth/forgot-password', { body: { email }, auth: false });
      if (data.code) setDevCode(data.code);
      setCode(['', '', '', '', '', '']);
      startCountdown();
      toast.success('New code sent!');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6 || !newPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api('/auth/reset-password', { body: { email, code: fullCode, newPassword }, auth: false });
      setStep('success');
      toast.success('Password reset! Please sign in with your new password');
    } catch (err: any) { toast.error(err.message); }
    setLoading(false);
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/\d/.test(value) && value !== '') return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.querySelector(`input[data-code-index="${index + 1}"]`);
      (nextInput as HTMLInputElement)?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.querySelector(`input[data-code-index="${index - 1}"]`);
      (prevInput as HTMLInputElement)?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
        <motion.div
          className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Password Reset!</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            {resetVia === 'firebase'
              ? 'We sent a password reset link to your email. Follow the link to set a new password.'
              : 'Your password has been successfully reset. You can now sign in with your new password.'}
          </p>
          <Button
            onClick={() => setView('signin')}
            className="w-full h-11 text-sm font-medium rounded-xl kivo-glow"
            style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
          >
            Sign In
          </Button>
        </motion.div>
      </div>
    );
  }

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
          onClick={() => step === 'code' ? setStep('email') : setView('signin')}
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
            <p className="mb-6 text-sm text-muted-foreground">
              Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
            </p>

            {/* OTP Input */}
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div className="flex gap-2 justify-center" onPaste={handleCodePaste}>
                {code.map((digit, i) => (
                  <Input
                    key={i}
                    data-code-index={i}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="h-12 w-10 text-center text-lg font-mono font-semibold rounded-xl bg-surface-1 border-border/50 focus:ring-primary/30"
                  />
                ))}
              </div>

              {/* Dev hint */}
              {devCode && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 text-center">
                  Dev mode — code: <span className="font-mono font-bold">{devCode}</span>
                </div>
              )}

              {/* Resend */}
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend in <span className="font-medium text-foreground">{countdown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Resend code
                  </button>
                )}
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password" className="text-xs">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl bg-surface-1 border-border/50"
                  autoComplete="new-password"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || code.some((c) => !c) || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
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
