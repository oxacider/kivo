import { db } from '@/lib/db';
import { getAuthUser, errorResponse } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return errorResponse('Unauthorized', 401);

    const requests = await db.friendship.findMany({
      where: { receiverId: user.id, status: 'pending' },
      include: {
        sender: { select: { id: true, displayName: true, username: true, avatar: true, bio: true, status: true, online: true, lastSeen: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ success: true, data: requests });
  } catch {
    return errorResponse('Failed to fetch requests', 500);
  }
}
