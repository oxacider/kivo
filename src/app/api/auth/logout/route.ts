import { getAuthUser, invalidateToken, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    return errorResponse('Unauthorized', 401);
  }

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    invalidateToken(auth.slice(7));
  }

  try {
    await db.user.update({
      where: { id: user.id },
      data: { online: false, lastSeen: new Date() },
    });
  } catch {}

  // Device token removal is handled client-side by disableNotifications(),
  // which removes only the current device's token from the server.
  // This preserves push for other active sessions (e.g. Android when logging out web).

  return Response.json({ success: true });
}
