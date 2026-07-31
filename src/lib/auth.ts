import { db } from '@/lib/db';
import { signToken, verifyToken } from '@/lib/jwt';
import type { User } from '@/types';

/* ------------------------------------------------------------------ */
/*  Token blocklist — invalidated tokens (logout, password change)  */
/* ------------------------------------------------------------------ */

const blocklist = new Set<string>();

/** Add a token to the blocklist (called on logout). */
export function invalidateToken(token: string) {
  blocklist.add(token);
}

/** Check if a token is blocked. */
export function isTokenBlocked(token: string): boolean {
  return blocklist.has(token);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                       */
/* ------------------------------------------------------------------ */

/** Generate a signed JWT for a user ID. */
export async function generateToken(userId: string): Promise<string> {
  return signToken(userId);
}

/** Verify a JWT and return the userId. Returns null if invalid. */
export async function extractUserId(token: string): Promise<string | null> {
  if (isTokenBlocked(token)) return null;
  const payload = await verifyToken(token);
  return payload?.userId ?? null;
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
      lastSeen: true, theme: true, createdAt: true, updatedAt: true,
    },
  });
  return user as User | null;
}

/** Standard error response helper. */
export function errorResponse(error: string, status = 400) {
  return Response.json({ success: false, error }, { status });
}
