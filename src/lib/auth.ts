import { db } from '@/lib/db';
import { signToken, verifyToken } from '@/lib/jwt';
import type { User } from '@/types';

/* ------------------------------------------------------------------ */
/*  Token blocklist — invalidated tokens (logout)                        */
/* ------------------------------------------------------------------ */

const blocklist = new Set<string>();
const MAX_BLOCKLIST_SIZE = 100_000;

/** Add a token to the blocklist (called on logout). */
export function invalidateToken(token: string) {
  blocklist.add(token);
  if (blocklist.size > MAX_BLOCKLIST_SIZE) {
    const iter = blocklist.values();
    for (let i = 0; i < 1001; i++) {
      const { value } = iter.next();
      if (value === undefined) break;
      blocklist.delete(value);
    }
  }
}

/** Check if a token is blocked. */
export function isTokenBlocked(token: string): boolean {
  return blocklist.has(token);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                       */
/* ------------------------------------------------------------------ */

/** Generate a signed JWT embedding the user's current tokenVersion. */
export async function generateToken(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  return signToken(userId, user?.tokenVersion ?? 0);
}

/**
 * Verify a JWT and return the userId.
 * Returns null if invalid, expired, blocked, or tokenVersion mismatch
 * (e.g. password was changed after this token was issued).
 */
export async function extractUserId(token: string): Promise<string | null> {
  if (isTokenBlocked(token)) return null;
  const payload = await verifyToken(token);
  if (!payload?.userId) return null;

  // Verify tokenVersion matches (catches post-password-reset tokens)
  const tv = payload.tv;
  if (tv !== undefined) {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== tv) return null;
  }

  return payload.userId;
}

/**
 * Authenticate a request and return the full user object.
 * Strips the password hash automatically.
 */
export async function getAuthUser(request: Request): Promise<User | null> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token = auth.slice(7);
  const userId = await extractUserId(token);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, displayName: true, username: true,
      avatar: true, bio: true, status: true, online: true,
      lastSeen: true, theme: true, emailVerified: true,
      showOnline: true, showLastSeen: true, showReadReceipts: true,
      createdAt: true, updatedAt: true,
    },
  });
  return user as User | null;
}

/** Standard error response helper. */
export function errorResponse(error: string, status = 400) {
  return Response.json({ success: false, error }, { status });
}
