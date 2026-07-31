'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { api } from '@/lib/api';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

export function VerifyEmailForm() {
  const { user, token, setUser } = useAuthStore();
  const { setView } = useUIStore();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-poll for verification status
  useEffect(() => {
    if (verified) return;
    pollingRef.current = setInterval(async () => {
      if (!token) return;
      try {
        const me: any = await api('/auth/me', { token });
        if (me.emailVerified) {
          setVerified(true);
          setUser(me);
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [token, verified, setUser]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) return;
    setLoading(true);
    try {
      await api('/auth/verify-email', { token, body: { code: fullCode } });
      setVerified(true);
      if (user) setUser({ ...user, emailVerified: true });
      toast.success('Email verified successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || !token) return;
    setResendLoading(true);
    try {
      const data: any = await api('/auth/send-verification', { token, body: {} });
      if (data.code) setDevCode(data.code);
      setCode(['', '', '', '', '', '']);
      setCountdown(60);
      toast.success(data.message || 'Verification code sent!');
      // Focus first input
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/\d/.test(value) && value !== '') return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (newCode.every((c) => c !== '')) {
      const fullCode = newCode.join('');
      setLoading(true);
      api('/auth/verify-email', { token, body: { code: fullCode } })
        .then(() => {
          setVerified(true);
          if (user) setUser({ ...user, emailVerified: true });
          toast.success('Email verified successfully!');
        })
        .catch((err: any) => {
          toast.error(err.message || 'Verification failed');
          setCode(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        })
        .finally(() => setLoading(false));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      // Auto-submit
      setLoading(true);
      api('/auth/verify-email', { token, body: { code: pasted } })
        .then(() => {
          setVerified(true);
          if (user) setUser({ ...user, emailVerified: true });
          toast.success('Email verified successfully!');
        })
        .catch((err: any) => {
          toast.error(err.message || 'Verification failed');
          setCode(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        })
        .finally(() => setLoading(false));
    }
  };

  const handleContinue = () => {
    setView('chat');
  };

  const handleLogout = () => {
    useAuthStore.getState().logout();
    useUIStore.getState().setView('welcome');
  };

  if (verified) {
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
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Email Verified!</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Your email has been verified successfully. You can now use all features of KIVO.
          </p>
          <Button
            onClick={handleContinue}
            className="w-full h-11 text-sm font-medium rounded-xl kivo-glow"
            style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
          >
            Continue to Chat
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden">
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

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Verify Your Email</h1>
        <p className="mb-2 text-sm text-muted-foreground">
          We sent a 6-digit code to
        </p>
        <p className="mb-8 text-sm font-medium text-foreground">{user?.email}</p>

        {/* OTP Input */}
        <div className="flex gap-2 mb-6" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <Input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="h-14 w-12 text-center text-xl font-mono font-semibold rounded-xl bg-surface-1 border-border/50 focus:ring-primary/30"
              disabled={loading}
            />
          ))}
        </div>

        {/* Dev hint */}
        {devCode && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Dev mode — code: <span className="font-mono font-bold">{devCode}</span>
          </div>
        )}

        {/* Resend */}
        <div className="mb-6">
          {countdown > 0 ? (
            <p className="text-xs text-muted-foreground">
              Resend code in <span className="font-medium text-foreground">{countdown}s</span>
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend verification code'}
            </button>
          )}
        </div>

        {/* Manual verify button */}
        <Button
          onClick={handleVerify}
          disabled={loading || code.some((c) => !c)}
          className="w-full h-11 text-sm font-medium rounded-xl kivo-glow"
          style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify Email
        </Button>

        {/* Logout link */}
        <button
          onClick={handleLogout}
          className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out and use a different account
        </button>
      </motion.div>
    </div>
  );
}
