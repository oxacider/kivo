'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Zap, MessageSquare, Smartphone, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { isNative } from '@/lib/capacitor';
import { enableNotifications } from '@/lib/notifications';

/* ------------------------------------------------------------------ */
/*  localStorage key — persist user's choice so we don't re-prompt    */
/* ------------------------------------------------------------------ */

const PERMISSION_PROMPT_KEY = 'kivo-notification-prompt-dismissed';
const PERMISSION_PROMPT_COOLDOWN_DAYS = 14;

function wasPromptDismissed(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(PERMISSION_PROMPT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (isNaN(ts)) return false;
    // Cooldown: don't show again for N days after dismissal
    return Date.now() - ts < PERMISSION_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markPromptDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PERMISSION_PROMPT_KEY, String(Date.now()));
  } catch {
    // Storage full — skip
  }
}

function shouldShowPrompt(): boolean {
  if (isNative) return false;
  if (typeof Notification === 'undefined') return false;
  // Never show if already granted
  if (Notification.permission === 'granted') return false;
  // Don't show if user dismissed recently
  if (wasPromptDismissed()) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Feature list                                                       */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: Zap, label: 'Instant message alerts' },
  { icon: MessageSquare, label: 'Background notifications' },
  { icon: Smartphone, label: 'Vibration support' },
  { icon: RefreshCw, label: 'Message updates' },
];

/* ------------------------------------------------------------------ */
/*  Permission states mapped to human-readable status                  */
/* ------------------------------------------------------------------ */

type PermissionUIState = 'idle' | 'requesting' | 'granted' | 'denied' | 'blocked';

function getPermissionState(): PermissionUIState {
  if (typeof Notification === 'undefined') return 'blocked';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'idle';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NotificationPermissionDialog() {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PermissionUIState>('idle');
  const [isLoading, setIsLoading] = useState(false);

  // Decide whether to show on mount (with a small delay for smooth appearance)
  useEffect(() => {
    if (!shouldShowPrompt()) return;
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Sync permission state from browser
  useEffect(() => {
    if (visible) setState(getPermissionState());
  }, [visible]);

  const handleEnable = useCallback(async () => {
    setIsLoading(true);
    setState('requesting');

    try {
      const token = await enableNotifications();
      if (token) {
        setState('granted');
        // Auto-dismiss after showing success briefly
        setTimeout(() => setVisible(false), 1800);
      } else {
        // Permission denied or token fetch failed
        setState(getPermissionState());
      }
    } catch {
      setState(getPermissionState());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    markPromptDismissed();
    setVisible(false);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Dialog card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-background border border-border/40 shadow-2xl"
          >
            {/* Gradient accent bar at top */}
            <div
              className="h-1.5 w-full"
              style={{
                background:
                  state === 'granted'
                    ? 'linear-gradient(90deg, #22c55e, #10b981)'
                    : 'linear-gradient(90deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009), oklch(0.45 0.31 293))',
              }}
            />

            {/* Close button */}
            {state !== 'requesting' && state !== 'granted' && (
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="flex flex-col items-center px-6 pt-6 pb-6 text-center">
              {/* Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{
                  background:
                    state === 'granted'
                      ? 'linear-gradient(135deg, #22c55e20, #10b98120)'
                      : 'linear-gradient(135deg, oklch(0.623 0.258 293.009 / 0.15), oklch(0.541 0.281 293.009 / 0.15))',
                }}
              >
                {state === 'granted' ? (
                  <Check className="h-8 w-8 text-green-500" />
                ) : state === 'denied' ? (
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                ) : (
                  <Bell className="h-8 w-8" style={{ color: 'oklch(0.623 0.258 293.009)' }} />
                )}
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-xl font-bold tracking-tight text-foreground"
              >
                {state === 'granted'
                  ? 'Notifications Enabled!'
                  : state === 'denied'
                  ? 'Notifications Blocked'
                  : 'Never miss a message'}
              </motion.h2>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-2 text-sm text-muted-foreground max-w-[280px] leading-relaxed"
              >
                {state === 'granted'
                  ? "You're all set! You'll receive messages instantly, even when KIVO is closed."
                  : state === 'denied'
                  ? 'Notifications are blocked in your browser settings. Open browser settings to enable them.'
                  : 'Enable notifications to receive new messages instantly, even when KIVO is closed.'}
              </motion.p>

              {/* Feature list (only show in idle state) */}
              {state === 'idle' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-5 flex flex-col gap-2 w-full"
                >
                  {FEATURES.map((feature, i) => (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                      className="flex items-center gap-3 rounded-xl bg-surface-1 px-4 py-2.5"
                    >
                      <feature.icon className="h-4 w-4 shrink-0" style={{ color: 'oklch(0.623 0.258 293.009)' }} />
                      <span className="text-sm font-medium text-foreground">{feature.label}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: state === 'idle' ? 0.6 : 0.25 }}
                className="mt-6 flex flex-col gap-2 w-full"
              >
                {state === 'idle' && (
                  <button
                    onClick={handleEnable}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-sm text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))',
                      boxShadow: '0 0 24px oklch(0.541 0.281 293.009 / 0.25)',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                          className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                        />
                        Requesting...
                      </>
                    ) : (
                      <>
                        <Bell className="h-4 w-4" />
                        Enable Notifications
                      </>
                    )}
                  </button>
                )}

                {state === 'denied' && (
                  <button
                    onClick={() => {
                      markPromptDismissed();
                      setVisible(false);
                    }}
                    className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(135deg, oklch(0.623 0.258 293.009), oklch(0.541 0.281 293.009))',
                      boxShadow: '0 0 24px oklch(0.541 0.281 293.009 / 0.25)',
                      color: 'white',
                    }}
                  >
                    Open Browser Settings
                  </button>
                )}

                {state === 'granted' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    className="flex items-center justify-center gap-2 text-sm font-medium text-green-500"
                  >
                    <Check className="h-4 w-4" />
                    All set!
                  </motion.div>
                )}

                {/* Dismiss button */}
                {state !== 'requesting' && state !== 'granted' && (
                  <button
                    onClick={handleDismiss}
                    className="h-10 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Not Now
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
