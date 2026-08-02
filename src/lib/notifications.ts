import { getMessagingInstance, VAPID_KEY } from '@/lib/firebase';
import {
  getToken,
  deleteToken as fbDeleteToken,
  onRegistered,
  onUnregistered,
  register,
  unregister,
} from 'firebase/messaging';
import { api } from '@/lib/api';
import { isNative, isAndroid, isIOS } from '@/lib/capacitor';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KIVONotificationData {
  conversationId: string;
  senderId: string;
  type: 'new_message' | 'friend_request' | 'system';
}

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

/** Request browser notification permission. No-op on native. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || isNative || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

/* ------------------------------------------------------------------ */
/*  Web FCM Token                                                     */
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
async function generateWebFCMToken(): Promise<string | null> {
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
/*  Native (Capacitor) Push Token                                     */
/* ------------------------------------------------------------------ */

let nativePushToken: string | null = null;
let nativeListenersRegistered = false;

/**
 * Register for native push notifications via @capacitor/push-notifications.
 * Returns the FCM token on success, null otherwise.
 *
 * Handles:
 *  - Permission request
 *  - Token registration
 *  - Token refresh (automatic via listener)
 *  - Notification tap routing
 */
async function registerNativePush(): Promise<string | null> {
  if (!isNative) return null;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'denied') {
      console.info('[KIVO Push] Permission denied');
      return null;
    }

    // Register for push — Android gets token immediately,
    // iOS may need an additional step
    await PushNotifications.register();

    // The token arrives via the 'registration' listener (set up below).
    // Return whatever we have or null.
    return nativePushToken;
  } catch (err) {
    console.warn('[KIVO Push] Registration failed:', err);
    return null;
  }
}

/**
 * Set up native push notification listeners.
 * Only needs to be called once.
 *
 * Handles:
 *  - registration: saves token to server
 *  - registrationError: logs error
 *  - pushNotificationReceived: foreground notification (optional handling)
 *  - pushNotificationActionPerformed: notification tap → navigate to chat
 */
function ensureNativeListeners() {
  if (!isNative || nativeListenersRegistered) return;
  nativeListenersRegistered = true;

  import('@capacitor/push-notifications').then(({ PushNotifications }) => {
    // Token received from FCM
    PushNotifications.addListener('registration', (token) => {
      nativePushToken = token.value;
      const platform = isAndroid ? 'android' : isIOS ? 'ios' : 'android';
      console.info(`[KIVO Push] Token received (${platform}):`, token.value.slice(0, 20) + '...');
      saveTokenToServer(token.value, platform).catch(() => {});
    });

    // Token registration error
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[KIVO Push] Registration error:', err.error);
    });

    // Foreground notification received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.info('[KIVO Push] Foreground notification:', notification.title);
      // Optionally show in-app notification or update badge
    });

    // User tapped notification (app in background or foreground)
    PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
      const data = action.notification.data as Record<string, string> | undefined;
      const conversationId = data?.conversationId;

      if (conversationId) {
        console.info('[KIVO Push] Tap → conversation:', conversationId);
        // Navigate to the conversation using Zustand store
        // Dynamic imports avoid circular dependency at module level
        const { useChatStore } = await import('@/stores/chat-store');
        const { useUIStore } = await import('@/stores/ui-store');
        const { useAuthStore } = await import('@/stores/auth-store');

        const { user } = useAuthStore.getState();
        if (user) {
          useChatStore.getState().setActiveConversationId(conversationId);
          useUIStore.getState().setView('chat');
        }
      }
    });
  }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Server-side Token CRUD                                             */
/* ------------------------------------------------------------------ */

/** Save device token to KIVO backend (idempotent — upserts). */
async function saveTokenToServer(token: string, platform: string): Promise<void> {
  await api('/notifications/token', {
    method: 'POST',
    body: { token, platform },
  });
}

/** Remove device token from KIVO backend. */
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
/*  Web FCM Token Refresh (Firebase v12 FID lifecycle)               */
/* ------------------------------------------------------------------ */

let webLifecycleUnsubs: (() => void)[] = [];

/**
 * Subscribe to FCM web token rotation.
 *
 * Firebase 12+ uses FID-based registration: `register()` establishes the
 * FID identity and re-syncs when the FID changes (device reinstall, weekly
 * refresh, pushsubscriptionchange). `onRegistered` delivers the current
 * FID, which the backend stores as the push target — so a rotated token
 * is automatically re-registered here. `onUnregistered` fires when an FID
 * is no longer active, so we auto-remove it from the backend (invalid
 * tokens are cleaned up without waiting for a failed send).
 *
 * Idempotent — safe to call from enableNotifications on every login.
 * Never throws.
 */
export function setupWebTokenRefresh(): void {
  if (isNative || webLifecycleUnsubs.length > 0) return;

  getMessagingInstance()
    .then((messaging) => {
      if (!messaging) return;
      // New / rotated FID → register with the KIVO backend.
      webLifecycleUnsubs.push(
        onRegistered(messaging, (fid) => {
          saveTokenToServer(fid, 'web').catch(() => {});
          console.info('[KIVO FCM] Token (re)registered and saved.');
        })
      );
      // FID invalidated → remove from the KIVO backend automatically.
      webLifecycleUnsubs.push(
        onUnregistered(messaging, (fid) => {
          removeTokenFromServer(fid).catch(() => {});
          console.info('[KIVO FCM] Token unregistered, removed from backend.');
        })
      );
      // Establish registration; re-syncs on FID change or weekly refresh.
      register(messaging, { vapidKey: VAPID_KEY }).catch(() => {});
    })
    .catch(() => {});
}

/** Unsubscribe the web lifecycle listeners (disable flow). */
function teardownWebTokenRefresh(): void {
  for (const unsub of webLifecycleUnsubs) unsub();
  webLifecycleUnsubs = [];
}

/* ------------------------------------------------------------------ */
/*  High-Level API                                                    */
/* ------------------------------------------------------------------ */

/**
 * Enable push notifications for the current user.
 *
 * - Web: requests browser permission → FCM token → save to server
 * - Native: requests OS permission → Capacitor registers → listener saves token
 *
 * Returns the token on success, null otherwise.
 * Never throws.
 */
export async function enableNotifications(): Promise<string | null> {
  try {
    if (isNative) {
      // Set up native listeners first (for registration callback)
      ensureNativeListeners();
      const token = await registerNativePush();
      if (!token) {
        console.warn('[KIVO Push] Could not register for native push.');
        return null;
      }
      console.info(`[KIVO Push] Token registered successfully.`);
      return token;
    }

    // Web flow
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.info('[KIVO FCM] Notification permission not granted:', permission);
      return null;
    }

    const token = await generateWebFCMToken();
    if (!token) {
      console.warn('[KIVO FCM] Could not generate FCM token.');
      return null;
    }

    await saveTokenToServer(token, 'web');
    // Start listening for FCM web token rotation so refreshed tokens
    // stay registered on the backend (stale tokens are auto-removed at
    // send time by fcm-send).
    setupWebTokenRefresh();
    console.info('[KIVO FCM] Token saved successfully (device: web).');
    return token;
  } catch (err) {
    console.warn('[KIVO] enableNotifications failed:', err);
    return null;
  }
}

/**
 * Disable push notifications: remove token from Firebase and KIVO backend.
 * Never throws.
 */
export async function disableNotifications(): Promise<void> {
  try {
    if (isNative && nativePushToken) {
      await removeTokenFromServer(nativePushToken);
      nativePushToken = null;
    } else {
      // v12: unregister the FID while the onUnregistered listener is still
      // active so it auto-removes the token from the backend; then tear down.
      const messaging = await getMessagingInstance();
      if (messaging) {
        await unregister(messaging).catch(() => {});
      }
      teardownWebTokenRefresh();
      const token = await getFCMToken();
      if (token) {
        await removeTokenFromServer(token);
      }
      await deleteFCMRegistration();
    }
    console.info('[KIVO] Notifications disabled.');
  } catch (err) {
    console.warn('[KIVO] disableNotifications failed:', err);
  }
}

/* ------------------------------------------------------------------ */
/*  Init — call early in app lifecycle to set up native listeners     */
/* ------------------------------------------------------------------ */

/**
 * Initialize push notification system.
 * On native, this sets up the Capacitor push listeners so that
 * when the OS delivers a token, it gets saved to the server.
 * On web, this is a no-op (the service worker handles background pushes).
 *
 * Call once from the app root (SafeAreaBootstrapper or FirebaseProvider).
 */
export function initPushSystem() {
  if (!isNative) return;
  ensureNativeListeners();
}
