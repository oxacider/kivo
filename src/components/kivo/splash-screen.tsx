'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isNative } from '@/lib/capacitor';
import { hideSplash } from '@/lib/capacitor';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  // On native, the Capacitor SplashScreen is shown by the native layer.
  // We skip the web splash animation and immediately proceed.
  useEffect(() => {
    if (isNative) {
      // Small delay to let the WebView finish loading
      const timer = setTimeout(() => onDone(), 100);
      return () => clearTimeout(timer);
    }

    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 2200);
    const t4 = setTimeout(() => onDone(), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  // On native, hide the native splash when our web splash finishes
  useEffect(() => {
    if (!isNative) return;
    // The bootstrapper handles hideSplash, but we ensure it here too
    return () => { hideSplash(); };
  }, []);

  if (isNative) {
    // Render nothing on native — the native splash covers this.
    // The onDone callback fires after a small delay above.
    return <div className="fixed inset-0 z-50 bg-background" />;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-background"
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.541 0.281 293.009 / 0.15) 0%, transparent 70%)',
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: phase >= 1 ? 1.2 : 0.5, opacity: phase >= 1 ? 1 : 0 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.623 0.258 293.009 / 0.1) 0%, transparent 70%)',
            }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Floating particles */}
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-primary/30"
            style={{
              left: `${20 + i * 12}%`,
              top: `${30 + (i % 3) * 15}%`,
            }}
            animate={{
              y: [-20, -80, -20],
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 2.5 + i * 0.3,
              repeat: Infinity,
              delay: i * 0.4,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* Logo */}
        <motion.div
          className="relative z-10 flex flex-col items-center"
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden"
            style={{
              boxShadow: '0 8px 32px oklch(0.541 0.281 293.009 / 0.3)',
            }}
            animate={phase >= 2 ? { rotate: [0, -5, 5, 0] } : {}}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
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
            className="text-3xl font-semibold tracking-tight gradient-text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 10 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            KIVO
          </motion.h1>

          <motion.p
            className="mt-2 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 0.7 : 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Premium Messaging
          </motion.p>
        </motion.div>

        {/* Loading bar */}
        <motion.div
          className="absolute bottom-16 left-1/2 h-[2px] w-32 -translate-x-1/2 overflow-hidden rounded-full bg-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 1 ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))' }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.5, delay: 0.5, ease: 'easeInOut' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
