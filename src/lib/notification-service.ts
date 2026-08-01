import { db } from '@/lib/db';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TokenRecord {
  userId: string;
  token: string;
  platform: string;
}

/* ------------------------------------------------------------------ */
/*  Service operations                                                */
/* ------------------------------------------------------------------ */

/**
 * Register (upsert) a device push token for a user.
 * Idempotent — updating an existing token just refreshes the platform.
 */
export async function registerToken(
  userId: string,
  token: string,
  platform: string = 'web',
): Promise<void> {
  await db.deviceToken.upsert({
    where: { userId_token: { userId, token } },
    update: { platform },
    create: { userId, token, platform },
  });
}

/**
 * Remove a specific device token for a user.
 */
export async function removeToken(userId: string, token: string): Promise<void> {
  await db.deviceToken.deleteMany({ where: { userId, token } });
}

/**
 * Get all FCM registration tokens for a user (for multicast push).
 */
export async function getTokens(userId: string): Promise<string[]> {
  const rows = await db.deviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  return rows.map((r) => r.token);
}

/**
 * Remove all device tokens for a user (logout / account deletion).
 */
export async function removeAllTokens(userId: string): Promise<void> {
  await db.deviceToken.deleteMany({ where: { userId } });
}

/**
 * Delete a batch of invalid / expired tokens (post-send cleanup).
 */
export async function cleanupInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.deviceToken.deleteMany({ where: { token: { in: tokens } } });
}
