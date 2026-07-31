import { getMessagingInstance, VAPID_KEY } from '@/lib/firebase';
import { getToken, deleteToken as fbDeleteToken } from 'firebase/messaging';
import { api } from '@/lib/api';
import { isNative } from '@/lib/capacitor';

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
/*  Permission (web only)                                             */
/* ------------------------------------------------------------------ */

/** Request browser notification permission. No-op on native. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || isNative || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

/* ------------------------------------------------------------------ */
/*  FCM Token (web only — native uses FCM plugin directly)            */
/* ------------------------------------------------------------------ */

/** Get the current FCM registration token (does NOT create one). Web only. */
export async function getFCMToken(): Promise<string | null> {
  if (isNative) return null;
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  try {
    return await getToken(messaging, { vapidKey: VAPID_KEY });
  } catch {
    return null;
  }
}

/** Generate (or return cached) FCM token with VAPID key. Web only. */
async function generateFCMToken(): Promise<string | null> {
  if (isNative) return null;
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
async function saveTokenToServer(token: string, device: string): Promise<void> {
  await api('/notifications/token', {
    method: 'POST',
    body: { token, device },
  });
}

/** Remove FCM token from KIVO backend. */
async function removeTokenFromServer(token: string): Promise<void> {
  await api('/notifications/token', {
    method: 'DELETE',
    body: { token },
  });
}

/** Delete the FCM registration token from Firebase. Web only. */
async function deleteFCMRegistration(): Promise<void> {
  if (isNative) return;
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
 *
 * - Web: requests browser permission → FCM token → save to server
 * - Native: FCM token is obtained by the native FCM plugin;
 *   this function saves it to the KIVO backend.
 *
 * Returns the token on success, null otherwise.
 * Designed to be fire-and-forget: never throws.
 */
export async function enableNotifications(): Promise<string | null> {
  try {
    const device = isNative ? 'android' : 'web';

    // Step 1: Permission (web only)
    if (!isNative) {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        console.info('[KIVO FCM] Notification permission not granted:', permission);
        return null;
      }
    }

    // Step 2: FCM token
    const token = await generateFCMToken();
    if (!token) {
      console.warn('[KIVO FCM] Could not generate FCM token.');
      return null;
    }

    // Step 3: Save to server
    await saveTokenToServer(token, device);
    console.info(`[KIVO FCM] Token saved successfully (device: ${device}).`);
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
