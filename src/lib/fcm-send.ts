/**
 * Server-side FCM sender using the shared Firebase Admin app.
 *
 * Used by:
 *   - Socket service (push when recipient offline)
 *   - Any API route that needs to send a push notification
 *
 * The admin app is initialized once in firebase-admin.ts via
 * FIREBASE_SERVICE_ACCOUNT_B64.
 */

import { getTokens, cleanupInvalidTokens } from '@/lib/notification-service';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

let messaging: import('firebase-admin/messaging').Messaging | null = null;

async function getMessaging(): Promise<import('firebase-admin/messaging').Messaging | null> {
  if (messaging) return messaging;

  try {
    const app = await getFirebaseAdminApp();
    if (!app) return null;

    const adminMessaging = await import('firebase-admin/messaging');
    messaging = adminMessaging.getMessaging(app);
    return messaging;
  } catch (err) {
    console.error('[FCM Send] Failed to initialize messaging:', err);
    return null;
  }
}

// -------------------------------------------------------------------
//  Types
// -------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  data: {
    conversationId: string;
    senderId: string;
    type: 'new_message' | 'friend_request' | 'system';
  };
}

// -------------------------------------------------------------------
//  Send to a single user (all their devices)
// -------------------------------------------------------------------

/**
 * Send a push notification to all devices registered for a user.
 * Silently ignores if FCM is not configured or user has no tokens.
 *
 * Returns the number of tokens attempted.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  const msg = await getMessaging();
  if (!msg) return 0;

  try {
    const tokenList = await getTokens(userId);

    if (tokenList.length === 0) return 0;

    const message: import('firebase-admin/messaging').MulticastMessage = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        conversationId: payload.data.conversationId,
        senderId: payload.data.senderId,
        type: payload.data.type,
      },
      android: {
        notification: {
          channelId: 'kivo_messages',
          priority: 'high' as const,
          sound: 'default',
          icon: 'logo',
        },
        collapseKey: payload.data.conversationId || undefined,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: tokenList,
    };

    const response = await msg.sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      await doCleanupInvalidTokens(tokenList, response.responses);
    }

    return tokenList.length;
  } catch (err) {
    console.error('[FCM Send] sendPushToUser error:', err);
    return 0;
  }
}

// -------------------------------------------------------------------
//  Send to multiple users (bulk)
// -------------------------------------------------------------------

/**
 * Send the same push notification to multiple users.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  await Promise.allSettled(
    userIds.map((uid) => sendPushToUser(uid, payload)),
  );
}

// -------------------------------------------------------------------
//  Cleanup invalid tokens
// -------------------------------------------------------------------

async function doCleanupInvalidTokens(
  tokens: string[],
  responses: import('firebase-admin/messaging').SendResponse[],
) {
  const toDelete: string[] = [];

  for (let i = 0; i < responses.length; i++) {
    const err = responses[i].error;
    if (!err) continue;

    const code = err.code;
    if (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/mismatched-credential'
    ) {
      toDelete.push(tokens[i]);
    }
  }

  if (toDelete.length > 0) {
    try {
      await cleanupInvalidTokens(toDelete);
      console.info(`[FCM Send] Cleaned up ${toDelete.length} invalid token(s)`);
    } catch (err) {
      console.error('[FCM Send] Token cleanup failed:', err);
    }
  }
}

// -------------------------------------------------------------------
//  Remove all tokens for a user (logout) — see notification-service
// -------------------------------------------------------------------
