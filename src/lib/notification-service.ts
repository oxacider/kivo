import { db } from '@/lib/db';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TokenRecord {
  userId: string;
  token: string;
  platform: string;
}

/**
 * Hard cap on the number of devices a single user may register.
 * Prevents unbounded growth of the device_tokens table. When the cap is
 * exceeded, the OLDEST tokens are evicted first (keep the newest devices).
 */
export const MAX_DEVICES_PER_USER = 10;

/**
 * Basic sanity check for an FCM registration token.
 *
 * Web/Android FCM tokens are ~150+ URL-safe alphanumeric chars; iOS APNs
 * tokens are shorter hex strings. This is a coarse guard against garbage
 * input — it does NOT validate the token against FCM itself (that happens
 * at send time, where invalid tokens are auto-removed).
 */
export function isValidFCMToken(token: string): boolean {
  if (typeof token !== 'string') return false;
  if (token.length < 20 || token.length > 4096) return false;
  return /^[A-Za-z0-9\-_:.%=@]+$/.test(token);
}

/* ------------------------------------------------------------------ */
/*  Service operations                                                */
/* ------------------------------------------------------------------ */

/**
 * Register (upsert) a device push token for a user.
 * Idempotent — updating an existing token just refreshes the platform.
 *
 * Multi-device support: each device registers its own token row. Enforces
 * MAX_DEVICES_PER_USER by evicting the oldest tokens beyond the cap, so a
 * user switching devices many times can't bloat the table.
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

  // Enforce the device cap: keep the MAX_DEVICES_PER_USER most recently
  // active tokens, evict the excess. `updatedAt` bumps on every upsert
  // refresh, so ordering by it keeps recently re-registered devices even if
  // their original `createdAt` is old. (orderBy desc + skip keeps the newest,
  // returns the leftovers to evict.)
  const excess = await db.deviceToken.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_DEVICES_PER_USER,
    select: { id: true },
  });
  if (excess.length > 0) {
    await db.deviceToken.deleteMany({
      where: { id: { in: excess.map((e) => e.id) } },
    });
  }
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
