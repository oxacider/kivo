'use client';

import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';

// ---- internal state ----

let handlingPopState = false;
let hasPushedHistory = false;
let pendingPush: Record<string, unknown> | null = null;

/**
 * Gate that prevents schedulePushHistory from recording entries
 * during session restore / initial routing (before initHistory runs).
 */
let navigationReady = false;

// ---- snapshot ----

function capture(): Record<string, unknown> {
  const ui = useUIStore.getState();
  const chat = useChatStore.getState();
  return {
    v: ui.currentView,
    t: ui.mainTab,
    c: chat.activeConversationId,
    so: ui.settingsOpen,
    no: ui.notificationsOpen,
    sr: ui.searchOpen,
  };
}

function restore(nav: Record<string, unknown>) {
  const ui = useUIStore.getState();
  const chat = useChatStore.getState();

  handlingPopState = true;
  try {
    // Close overlays first so they animate out before other changes
    if (!nav.sr) ui.setSearchOpen(false);
    if (!nav.no) ui.setNotificationsOpen(false);
    if (!nav.so) ui.setSettingsOpen(false);

    // Restore view (may unmount current ChatLayout subtree)
    if (nav.v !== ui.currentView) ui.setView(nav.v as typeof ui.currentView);

    // Restore tab
    if (nav.t !== ui.mainTab) ui.setMainTab(nav.t as typeof ui.mainTab);

    // Restore conversation
    if (nav.c !== chat.activeConversationId) chat.setActiveConversationId(nav.c as string | null);

    // Re-open overlays last
    if (nav.sr) ui.setSearchOpen(true);
    if (nav.no) ui.setNotificationsOpen(true);
    if (nav.so) ui.setSettingsOpen(true);
  } finally {
    handlingPopState = false;
  }
}

// ---- public API ----

/**
 * Schedule a history push for the current navigation state.
 *
 * Safe to call from multiple stores within the same synchronous tick —
 * only one entry is pushed, capturing the pre-mutation state.
 */
export function schedulePushHistory() {
  if (!navigationReady || handlingPopState || typeof window === 'undefined') return;
  if (!pendingPush) {
    pendingPush = capture();
  }
  // queueMicrotask runs after all synchronous store updates finish
  queueMicrotask(() => {
    if (pendingPush) {
      window.history.pushState({ n: pendingPush }, '', '');
      hasPushedHistory = true;
      pendingPush = null;
    }
  });
}

/**
 * Initialise the popstate listener and seed the initial history entry.
 * Returns a cleanup function.
 */
export function initHistory(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Replace the current (empty) entry with our root state
  window.history.replaceState({ n: capture() }, '', '');

  // Enable history recording now that we have a clean root entry.
  navigationReady = true;

  const onPop = (e: PopStateEvent) => {
    const nav = e.state?.n as Record<string, unknown> | undefined;
    if (!nav) return;
    restore(nav);
  };

  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

/**
 * Navigate back one step in history.
 * Returns `true` if a back navigation was attempted, `false` if at root.
 */
export function navigateBack(): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasPushedHistory) return false;
  window.history.back();
  return true;
}

/** Reset the navigation stack (call when returning to welcome). */
export function resetHistory() {
  hasPushedHistory = false;
  if (typeof window !== 'undefined') {
    window.history.replaceState({ n: capture() }, '', '');
  }
}
