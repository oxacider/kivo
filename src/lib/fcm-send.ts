/**
 * Server-side FCM sender using firebase-admin.
 *
 * Used by:
 *   - Socket service (push when recipient offline)
 *   - Any API route that needs to send a push notification
 *
 * The admin app is lazily initialized from the service-account JSON path
 * or base64 env var (FCM_SERVICE_ACCOUNT_B64).
 */

import { db } from '@/lib/db';

let adminApp: import('firebase-admin/app').App | null = null;
let messaging: import('firebase-admin/messaging').Messaging | null = null;

async function getMessaging(): Promise<import('firebase-admin/messaging').Messaging | null> {
  if (messaging) return messaging;

  // Skip if no config available (dev mode without FCM credentials)
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) {
    return null;
  }

  try {
    // Dynamic imports — firebase-admin is server-only, never bundled to client
    const admin = await import('firebase-admin/app');
    const adminMessaging = await import('firebase-admin/messaging');

    if (admin.getApps().length === 0) {
      let credential: import('firebase-admin/app').AppOptions['credential'];

      if (process.env.FCM_SERVICE_ACCOUNT_B64) {
        // Base64-encoded service account JSON
        const json = Buffer.from(process.env.FCM_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
        credential = admin.cert(JSON.parse(json));
      } else if (process.env.FCM_SERVICE_ACCOUNT_PATH) {
        const sa = await import(process.env.FCM_SERVICE_ACCOUNT_PATH);
        credential = admin.cert(sa);
      } else {
        // Try Google Application Default Credentials
        credential = admin.applicationDefault();
      }

      adminApp = admin.initializeApp({ credential, projectId });
    } else {
      adminApp = admin.getApps()[0];
    }

    messaging = adminMessaging.getMessaging(adminApp);
    return messaging;
  } catch (err) {
    console.error('[FCM Send] Failed to initialize firebase-admin:', err);
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
    const tokens = await db.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) return 0;

    const tokenList = tokens.map((t) => t.token);

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
      await cleanupInvalidTokens(tokenList, response.responses);
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

async function cleanupInvalidTokens(
  tokens: string[],
  responses: import('firebase-admin/messaging').SendResponse[],
) {
  const toDelete: string[] = [];

  for (let i = 0; i < responses.length; i++) {
    const err = responses[i].error;
    if (!err) continue;

    // Delete tokens that are invalid, unregistered, or not for this project
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
      await db.deviceToken.deleteMany({
        where: { token: { in: toDelete } },
      });
      console.info(`[FCM Send] Cleaned up ${toDelete.length} invalid token(s)`);
    } catch (err) {
      console.error('[FCM Send] Token cleanup failed:', err);
    }
  }
}

// -------------------------------------------------------------------
//  Remove all tokens for a user (logout)
// -------------------------------------------------------------------

export async function removeAllTokensForUser(userId: string): Promise<void> {
  try {
    await db.deviceToken.deleteMany({ where: { userId } });
  } catch (err) {
    console.error('[FCM Send] removeAllTokensForUser error:', err);
  }
}
