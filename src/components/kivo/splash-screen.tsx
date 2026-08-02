'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { isNative } from '@/lib/capacitor';
import { hideSplash } from '@/lib/capacitor';

/* ------------------------------------------------------------------ */
/*  Cinematic Timeline (ms)                                           */
/*                                                                     */
/*    0 –  500   Dark screen, glow breathes in                        */
/*  500 – 1500   Logo reveal: blur→clear, 0.7→1.0 scale              */
/* 1500 – 2500   KIVO text with letter-spacing animation              */
/* 2500 – 3500   Tagline "Connect. Create. Belong."                  */
/* 3500+         Fade out → transition to app                         */
/* ------------------------------------------------------------------ */

const TAGLINE = 'Connect. Create. Belong.';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Native Capacitor: skip animation, just fire onDone immediately
  useEffect(() => {
    if (isNative) {
      const timer = setTimeout(() => onDone(), 80);
      return () => clearTimeout(timer);
    }

    // Reduced motion: skip to the end quickly
    if (reducedMotion) {
      const timer = setTimeout(() => onDone(), 400);
      return () => clearTimeout(timer);
    }

    // Cinematic timeline
    const t1 = setTimeout(() => setPhase(1), 500);   // logo starts
    const t2 = setTimeout(() => setPhase(2), 1500);  // text starts
    const t3 = setTimeout(() => setPhase(3), 2500);  // tagline starts
    const t4 = setTimeout(() => onDone(), 3800);     // transition to app
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      clearTimeout(t3); clearTimeout(t4);
    };
  }, [onDone, reducedMotion]);

  // On native, hide the native splash when ours finishes
  useEffect(() => {
    if (!isNative) return;
    return () => { hideSplash(); };
  }, []);

  // ── Reduced motion / Native: minimal render ─────────────────────────
  if (reducedMotion || isNative) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a10]">
        <Image
          src="/logo.png" alt="KIVO" width={80} height={80}
          priority quality={100} sizes="80px" className="object-contain"
        />
      </div>
    );
  }

  // ── Floating particle positions (deterministic grid + random offset) ──
  const particles = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: 22 + (i % 4) * 18 + Math.sin(i * 2.7) * 10,
      top: 25 + Math.floor(i / 4) * 18 + Math.cos(i * 1.3) * 12,
      delay: i * 0.35,
      duration: 3.2 + (i % 3) * 0.7,
      size: i % 3 === 0 ? 1.5 : i % 3 === 1 ? 2 : 1,
      opacity: 0.15 + (i % 4) * 0.05,
    }))
  ).current;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
        style={{ background: '#0a0a10' }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        {/* ── Atmospheric breathing glow ─────────────────────────────── */}
        <div className="pointer-events-none absolute inset-0">
          {/* Outer haze — large, slow breathing */}
          <motion.div
            className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(
                circle,
                oklch(0.541 0.281 293.009 / 0.06) 0%,
                oklch(0.541 0.281 293.009 / 0.03) 35%,
                oklch(0.623 0.258 293.009 / 0.01) 60%,
                transparent 80%
              )`,
            }}
            animate={{
              scale: [0.8, 1.15, 0.8],
              opacity: [0, 0.7, 0],
            }}
            transition={{
              scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 2.5, delay: 0.2, ease: 'easeOut' },
            }}
          />

          {/* Mid glow — tighter, brighter */}
          <motion.div
            className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(
                circle,
                oklch(0.541 0.281 293.009 / 0.12) 0%,
                oklch(0.623 0.258 293.009 / 0.06) 40%,
                transparent 70%
              )`,
            }}
            animate={{
              scale: [0.9, 1.08, 0.9],
              opacity: [0, 0.9, 0.4],
            }}
            transition={{
              scale: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
            }}
          />

          {/* Core glow — intimate, centered on logo */}
          <motion.div
            className="absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(
                circle,
                oklch(0.623 0.258 293.009 / 0.18) 0%,
                oklch(0.541 0.281 293.009 / 0.08) 50%,
                transparent 100%
              )`,
            }}
            animate={{
              scale: [0.85, 1.05, 0.85],
              opacity: [0, 1, 0.5],
            }}
            transition={{
              scale: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 2, delay: 0.6, ease: 'easeOut' },
            }}
          />
        </div>

        {/* ── Soft light particles ──────────────────────────────────── */}
        <div className="pointer-events-none absolute inset-0">
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                left: `${p.left}%`,
                top: `${p.top}%`,
                background: `radial-gradient(circle,
                  oklch(0.623 0.258 293.009 / ${p.opacity + 0.15}) 0%,
                  transparent 100%
                )`,
                animation: `kivo-particle-float ${p.duration}s ease-in-out infinite`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>

        {/* ── Logo ──────────────────────────────────────────────────── */}
        <motion.div
          className="relative z-10 flex flex-col items-center"
          style={{ willChange: 'transform, opacity, filter' }}
        >
          {/* Logo container with 3D depth shadow */}
          <motion.div
            className="mb-8 flex h-24 w-24 items-center justify-center rounded-2xl"
            initial={{
              opacity: 0,
              scale: 0.7,
              filter: 'blur(12px)',
            }}
            animate={{
              opacity: phase >= 1 ? 1 : 0,
              scale: phase >= 1 ? 1 : 0.7,
              filter: phase >= 1 ? 'blur(0px)' : 'blur(12px)',
            }}
            transition={{
              duration: 1.0,
              ease: [0.25, 0.1, 0.25, 1.0], // custom cubic for smooth deceleration
            }}
            style={{
              boxShadow: phase >= 1
                ? '0 0 60px oklch(0.541 0.281 293.009 / 0.25), 0 0 120px oklch(0.541 0.281 293.009 / 0.10), 0 16px 48px oklch(0.541 0.281 293.009 / 0.15)'
                : 'none',
              transition: 'box-shadow 1.2s ease-out',
            }}
          >
            <Image
              src="/logo.png"
              alt="KIVO"
              width={96}
              height={96}
              priority
              quality={100}
              sizes="96px"
              className="object-contain p-1"
              style={{ willChange: 'transform' }}
            />
          </motion.div>

          {/* ── KIVO brand text ────────────────────────────────────── */}
          <motion.h1
            className="text-4xl font-bold tracking-[0.3em] gradient-text select-none"
            initial={{ opacity: 0, y: 14, letterSpacing: '0.5em' }}
            animate={{
              opacity: phase >= 2 ? 1 : 0,
              y: phase >= 2 ? 0 : 14,
              letterSpacing: phase >= 2 ? '0.15em' : '0.5em',
            }}
            transition={{
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
              letterSpacing: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
            }}
          >
            KIVO
          </motion.h1>

          {/* ── Tagline ────────────────────────────────────────────── */}
          <motion.p
            className="mt-3 text-sm font-light tracking-[0.1em] select-none"
            style={{ color: 'oklch(0.7 0.025 293)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: phase >= 3 ? 0.7 : 0,
              y: phase >= 3 ? 0 : 8,
            }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {TAGLINE}
          </motion.p>
        </motion.div>

        {/* ── Subtle bottom indicator ───────────────────────────────── */}
        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 0.4 : 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div
            className="h-[1px] w-24 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, oklch(0.623 0.258 293.009 / 0.3), transparent)',
            }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
