import { getMessagingInstance, VAPID_KEY } from '@/lib/firebase';
import { getToken, deleteToken as fbDeleteToken } from 'firebase/messaging';
import { api } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Notification Payload Types (Cloud Functions-ready)                 */
/* ------------------------------------------------------------------ */

export interface KIVONotificationData {
  conversationId: string;
  senderId: string;
  type: 'new_message' | 'friend_request' | 'system';
}

/**
 * Standard payload shape that Cloud Functions will send.
 * Both `notification` (for background) and `data` (for foreground + routing).
 */
export interface KIVOPushPayload {
  notification: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
  };
  data: KIVONotificationData;
}

/* ------------------------------------------------------------------ */
/*  Permission                                                        */
/* ------------------------------------------------------------------ */

/** Request browser notification permission. Returns the granted state. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

/* ------------------------------------------------------------------ */
/*  FCM Token                                                         */
/* ------------------------------------------------------------------ */

/** Get the current FCM registration token (does NOT create one). */
export async function getFCMToken(): Promise<string | null> {
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  try {
    return await getToken(messaging, { vapidKey: VAPID_KEY });
  } catch {
    return null;
  }
}

/** Generate (or return cached) FCM token with VAPID key. */
async function generateFCMToken(): Promise<string | null> {
  const messaging = await getMessagingInstance();
  if (!messaging || !VAPID_KEY) return null;
  try {
    return await getToken(messaging, { vapidKey: VAPID_KEY });
  } catch (err) {
    console.warn('[KIVO FCM] Failed to get FCM token:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Server-side Token CRUD                                             */
/* ------------------------------------------------------------------ */

/** Save FCM token to KIVO backend (idempotent — upserts). */
async function saveTokenToServer(token: string): Promise<void> {
  await api('/notifications/token', {
    method: 'POST',
    body: { token, device: 'web' },
  });
}

/** Remove FCM token from KIVO backend. */
async function removeTokenFromServer(token: string): Promise<void> {
  await api('/notifications/token', {
    method: 'DELETE',
    body: { token },
  });
}

/** Delete the FCM registration token from Firebase. */
async function deleteFCMRegistration(): Promise<void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return;
  try {
    await fbDeleteToken(messaging);
  } catch {
    // Token may already be invalid
  }
}

/* ------------------------------------------------------------------ */
/*  High-Level API                                                    */
/* ------------------------------------------------------------------ */

/**
 * Enable push notifications for the current user.
 * 1. Request browser permission
 * 2. Generate FCM token
 * 3. Save token to KIVO backend
 *
 * Returns the token on success, null otherwise.
 * Designed to be fire-and-forget: never throws.
 */
export async function enableNotifications(): Promise<string | null> {
  try {
    // Step 1: Permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.info('[KIVO FCM] Notification permission not granted:', permission);
      return null;
    }

    // Step 2: FCM token
    const token = await generateFCMToken();
    if (!token) {
      console.warn('[KIVO FCM] Could not generate FCM token.');
      return null;
    }

    // Step 3: Save to server
    await saveTokenToServer(token);
    console.info('[KIVO FCM] Token saved successfully.');
    return token;
  } catch (err) {
    console.warn('[KIVO FCM] enableNotifications failed:', err);
    return null;
  }
}

/**
 * Disable push notifications: remove token from Firebase and KIVO backend.
 * Designed to be fire-and-forget: never throws.
 */
export async function disableNotifications(): Promise<void> {
  try {
    const token = await getFCMToken();
    if (token) {
      await removeTokenFromServer(token);
    }
    await deleteFCMRegistration();
    console.info('[KIVO FCM] Notifications disabled.');
  } catch (err) {
    console.warn('[KIVO FCM] disableNotifications failed:', err);
  }
}
