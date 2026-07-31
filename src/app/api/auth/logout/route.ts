import { getAuthUser, invalidateToken, errorResponse } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return errorResponse('Unauthorized', 401);
  }

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    invalidateToken(auth.slice(7));
  }

  // Mark user offline
  const { db } = await import('@/lib/db');
  try {
    await db.user.update({
      where: { id: user.id },
      data: { online: false, lastSeen: new Date() },
    });
  } catch {}

  return Response.json({ success: true });
}
