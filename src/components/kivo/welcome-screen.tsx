'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { Shield, Zap, Sparkles } from 'lucide-react';
import Image from 'next/image';

export function WelcomeScreen() {
  const setView = useUIStore((s) => s.setView);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo mark */}
        <motion.div
          className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden"
          style={{
            boxShadow: '0 8px 32px oklch(0.541 0.281 293.009 / 0.25)',
          }}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Image
            src="/logo.png"
            alt="KIVO"
            width={80}
            height={80}
            priority
            quality={100}
            sizes="80px"
            className="object-contain p-1.5"
          />
        </motion.div>

        <motion.h1
          className="mb-2 text-3xl font-semibold tracking-tight gradient-text"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Welcome to KIVO
        </motion.h1>

        <motion.p
          className="mb-10 text-center text-sm text-muted-foreground leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          A premium messaging experience designed for clarity,
          speed, and privacy.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          className="mb-10 flex flex-wrap justify-center gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          {[
            { icon: Shield, label: 'Private' },
            { icon: Zap, label: 'Fast' },
            { icon: Sparkles, label: 'Beautiful' },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-surface-1 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <Icon className="h-3 w-3" />
              {label}
            </span>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          className="flex w-full flex-col gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <Button
            onClick={() => setView('signup')}
            className="w-full h-12 text-sm font-medium rounded-xl kivo-glow"
            style={{ background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
          >
            Create Account
          </Button>
          <Button
            variant="outline"
            onClick={() => setView('signin')}
            className="w-full h-12 text-sm font-medium rounded-xl border-border/60"
          >
            Sign In
          </Button>
        </motion.div>

        <motion.p
          className="mt-6 text-center text-xs text-muted-foreground/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          By continuing, you agree to KIVO&apos;s Terms of Service
        </motion.p>
      </motion.div>
    </div>
  );
}