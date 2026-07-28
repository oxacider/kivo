import { db } from '@/lib/db';
import type { User } from '@/types';

const tokenMap = new Map<string, string>();
const userMap = new Map<string, string>();

export function generateToken(userId: string): string {
  const token = `kivo_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  tokenMap.set(userId, token);
  userMap.set(token, userId);
  return token;
}

export function verifyToken(token: string): string | null {
  return userMap.get(token) || null;
}

export async function getAuthUser(request: Request): Promise<User | null> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const userId = verifyToken(token);
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  return user as User | null;
}

export function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function errorResponse(error: string, status = 400) {
  return Response.json({ success: false, error }, { status });
}
